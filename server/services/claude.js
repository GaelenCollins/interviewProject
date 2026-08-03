import Anthropic from '@anthropic-ai/sdk'
import {
  pdfExtractionSystemPrompt,
  pdfExtractionUserPrompt,
  normalizePdfQuote,
} from '../../src/utils/pdfSchema.js'

const HAIKU = process.env.CLAUDE_HAIKU_MODEL || 'claude-haiku-4-5'
const SONNET = process.env.CLAUDE_SONNET_MODEL || 'claude-sonnet-4-5'

const HUMAN_VOICE = `Role & Tone:
Write like a helpful coworker using plain sentences and short paragraphs.

Formatting Constraints:
- Do not use ALL CAPS for emphasis.
- Do not use bold markdown asterisks (no **bold** text anywhere).
- Do not use em dashes (—) or emojis.
- Always write "0%" instead of "zero" when discussing margins.
- Always write "SKU" before any product code (for example, SKU RS-HW-SVC-PE-S3).

Naming & File Source Rules:
- Always call the Excel file the "Distributor Quote (Excel Source)".
- Always call the PDF file the "Dynamix Customer Quote (PDF)".
- The Distributor Quote (Excel Source) is 100% correct and is the unalterable cost benchmark.
- The Dynamix Customer Quote (PDF) is generated via Dynamix SNAP, where manual edits happen. Audit PDF sell prices and terms against Excel cost.
- Audience: Dynamix sends the PDF to the end customer. PDF presentation issues (billing schedule, wrong qty, wrong sell on the face of the quote) matter for the customer-facing document.
- Do not say the distributor (or any distributor brand such as Rubrik) checks, flags, or rejects the PDF.
- Low or 0% margin is a Dynamix profitability issue (Dynamix would make less money). Do not say the customer cares about or would notice a low margin / "no room for profit."
- High margin (especially over the ceiling) is what a customer could care about — pricing that looks too high or uncompetitive.
- Presentation / math errors on the PDF (schedule off by a penny, extension math, qty typos) are worth cleaning up before the customer sees the quote.

Margin Policy & Error Logic:
- Usual target gross margin: 8% to 12%.
- Hard floor warning: Under 5% (Dynamix margin risk).
- Hard ceiling warning: Over 20% (customer / bid risk: gouging or a lost bid).
- Notices: 5%–7.9% or 12.1%–20% (outside target, but still inside hard limits).
- Treat a true 0% margin as a critical SNAP pricing error for Dynamix, not as a customer-facing "profit optics" issue.
- Keep customer preferences related to margin rebalancing as a brief aside when explaining causes of irregular margins. The user may know of these irregularities.

Phrasing & Grounding Rules:
- Only give soft suggestions: say the sell price "probably should" be higher if Dynamix wants a normal margin.
- Never say a price "needs" to be raised or that the user "must" change anything.
- Prefer soft modals: "should", "could", "might", "probably". Never "must", "will block", "will cause", or other certainty about outcomes.
- Say issues "could cause" a rejection or delay, not that they "will" block or reject the order.
- For any math-related finding (margins, target sell, extensions, schedule totals, qty × price), point the user to the Calculator in the app header (calculator icon; tabs for scientific math, sale price, and margin %) to work the numbers. Do not invent detailed sell-price math yourself unless the deterministic context already has the figure.
- If an Excel value looks unusual, mention it lightly as worth a thorough check, not as a confirmed cause.
- Never invent margin numbers or assume causes you cannot verify directly from the source files.`

const VISIBILITY_RULES = `You have line-by-line quote visibility in quoteDossier:
Distributor Quote (Excel Source) line items (SKU, description, qty, cost, discount, serial, coverage dates, notes),
Dynamix Customer Quote (PDF) line items (SKU, description, qty, sell, extended, group, coverage, billing schedule),
compared lines, SKU presence gaps, check findings, and a PDF text snippet for freeform terms.
USE that data to answer. Never say you lack line-by-line term visibility or that the audit only covered pricing.
If something is truly absent from quoteDossier, say exactly what field is missing — do not refuse the whole question.
Ignored findings: checkFindings only lists active (non-ignored) issues. Never mention, summarize, or draft emails about ignored or hidden issues — even if they appeared earlier in the chat history or opening summary. Treat ignored issues as out of scope unless the user explicitly asks about a specific ignored item.`

const CHAT_SYSTEM = `${HUMAN_VOICE}
${VISIBILITY_RULES}
You are the Dynamix quote checker assistant.
Be practical and specific to this quote pair.
Never invent margin math. Prefer the provided deterministic figures.
Do not invent a custom sell price. For what-if margin or sell math, recommend the Calculator in the header (Sale Price or Margin % tabs).
Never say a margin "should be at least" a number.
Excel is the cost benchmark; the PDF comes from SNAP with possible manual edits.
If the user asks about a 0% or low margin, frame it as Dynamix making less money / a likely SNAP pricing slip — not as something the customer would notice. High margins are the customer-facing pricing concern.
Keep customer preferences around margin rebalancing as a brief aside. Soft suggestions only ("probably should"), never "needs".
Unusual Excel peer values are only a light "fishy, double-check" aside, not the cause.
When asked about missing terms, SKUs, coverage dates, serials, schedules, or notes, answer from quoteDossier concretely.
Use deeper synthesis when helpful: connect lines across the Distributor Quote (Excel Source) and Dynamix Customer Quote (PDF), explain policy bands clearly, and ground every claim in the dossier.`

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is missing')
  return new Anthropic({ apiKey })
}

async function complete({ model, system, user, maxTokens = 1200, temperature }) {
  const res = await client().messages.create({
    model,
    max_tokens: maxTokens,
    ...(temperature != null ? { temperature } : {}),
    system,
    messages: [{ role: 'user', content: user }],
  })
  const text = res.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  return { text, model, usage: res.usage }
}

async function* streamComplete({
  model,
  system,
  user,
  maxTokens = 800,
  temperature,
}) {
  const stream = client().messages.stream({
    model,
    max_tokens: maxTokens,
    ...(temperature != null ? { temperature } : {}),
    system,
    messages: [{ role: 'user', content: user }],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta' &&
      event.delta.text
    ) {
      yield event.delta.text
    }
  }
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Model response was not valid JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

async function extractPdfSchemaWithModel(pdfText, model) {
  const { text, model: usedModel } = await complete({
    model,
    maxTokens: 2500,
    temperature: 0,
    system: pdfExtractionSystemPrompt(),
    user: pdfExtractionUserPrompt(pdfText),
  })
  return {
    pdfData: normalizePdfQuote(extractJson(text), pdfText),
    model: usedModel,
  }
}

/** Haiku — primary PDF schema extract (fast). */
export async function extractPdfSchemaWithHaiku(pdfText) {
  return extractPdfSchemaWithModel(pdfText, HAIKU)
}

/** Sonnet — PDF schema extract fallback when Haiku JSON/schema fails. */
export async function extractPdfSchemaWithSonnet(pdfText) {
  return extractPdfSchemaWithModel(pdfText, SONNET)
}

/**
 * Dual-stage PDF schema extraction:
 * Haiku primary → Sonnet fallback. Throws if both fail (caller may regex-fallback).
 */
export async function extractPdfSchema(pdfText) {
  try {
    return await extractPdfSchemaWithHaiku(pdfText)
  } catch (haikuErr) {
    try {
      const sonnetResult = await extractPdfSchemaWithSonnet(pdfText)
      return {
        ...sonnetResult,
        fallbackFrom: 'haiku',
        haikuError: haikuErr?.message || String(haikuErr),
      }
    } catch (sonnetErr) {
      const err = new Error(
        `PDF schema extraction failed (Haiku: ${haikuErr?.message || haikuErr}; Sonnet: ${sonnetErr?.message || sonnetErr})`,
      )
      err.haikuError = haikuErr
      err.sonnetError = sonnetErr
      throw err
    }
  }
}

const REASONING_STYLE = `Reason from the provided facts each time. Write in your own words.
Do not reuse a fixed template, canned opener, or identical phrasing across answers.
Stay accurate and grounded; vary only the wording and emphasis, not the numbers or findings.`

/** Haiku — short pill answers (streamed). */
export async function* streamQuickActionWithHaiku({ question, error, context }) {
  yield* streamComplete({
    model: HAIKU,
    maxTokens: 550,
    temperature: 0.85,
    system: `${HUMAN_VOICE}
${VISIBILITY_RULES}
${REASONING_STYLE}
Answer quote-check questions briefly (about 3-6 sentences) using quoteDossier.
Stay strictly on the Active issue below — do not pivot to a different finding unless the user asks.
Never invent numeric margins; only use numbers in the context.
Do not suggest a corrected sell price unless the user explicitly asks for one.
When asked what caused a discrepancy: lead with Excel cost (benchmark) vs SNAP PDF sell.
For low or 0% margins: this hurts Dynamix profitability; do not say the customer cares about low margin. Treat it as a likely SNAP pricing slip first; margin rebalancing can be a brief aside.
For high margins (near/over ceiling): that is what a customer could push back on.
For payment-schedule / cash-flow findings: talk about the deficit periods and billed vs distributor-due amounts from the Active issue.
For math-related issues, recommend the Calculator in the app header.
Soft suggestions only ("probably should"); never "needs to be raised".
Keep any unusual Excel peer-discount note to one short aside: fishy, worth checking, not the cause.
If unsure of root cause, say so calmly.`,
    user: `Question: ${question}

Active issue (answer ONLY about this finding):
${JSON.stringify(
  {
    id: error?.id,
    type: error?.type,
    severity: error?.severity,
    sku: error?.sku,
    message: error?.message,
    locations: error?.locations,
    math: error?.math,
    scheduleComparison: error?.scheduleComparison || null,
    omittedTerms: error?.omittedTerms || null,
    excelHints: error?.excelHints || context?.excelHints || [],
    discountContext: error?.discountContext || context?.discountContext || null,
  },
  null,
  2,
)}

Excel row for this SKU:
${JSON.stringify(context?.excelSource || error?.excelSource || null, null, 2)}

Discount vs other Excel lines:
${JSON.stringify(error?.discountContext || context?.discountContext || null, null, 2)}

Compared line (Excel vs PDF):
${JSON.stringify(context?.comparedLine || null, null, 2)}

Quote dossier (line-by-line terms):
${JSON.stringify(context?.quoteDossier || null, null, 2)}

Lowest/typical margins on clean lines (for soft advice only):
${JSON.stringify(
  {
    meanMarginPercent: context?.math?.meanMarginPercent ?? error?.math?.meanMarginPercent,
    minHealthyMarginPercent: context?.minHealthyMarginPercent ?? null,
  },
  null,
  2,
)}

Math context:
${JSON.stringify(context?.math || error?.math || {}, null, 2)}

Meta:
${JSON.stringify(context?.meta || {}, null, 2)}`,
  })
}

function buildChatUserPayload({ messages, context, quoteDossier }) {
  const history = messages
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n')

  const dossier = quoteDossier || context?.quoteDossier || null
  const activeErrors = (context?.errors || []).filter((e) => !e.hidden)

  return `High-level context:
${JSON.stringify(
  {
    verdict: context?.verdict,
    meanMarginPercent: context?.analysis?.meanMarginRounded,
    activeErrorCount: activeErrors.length,
    activeErrors: activeErrors.map((e) => ({
      id: e.id,
      severity: e.severity,
      type: e.type,
      sku: e.sku,
      message: e.message,
    })),
    meta: context?.meta,
  },
  null,
  2,
)}

Quote dossier (full line-by-line Excel + PDF terms — use this; checkFindings are active only):
${JSON.stringify(dossier, null, 2)}

Conversation:
${history}

Reply naturally as the assistant. Use the quote dossier; do not claim you lack line visibility.
Do not discuss ignored issues. If the user asks for an email or summary of problems, only include active findings.`
}

/** Sonnet — free-form chat (streamed) for deeper reasoning and synthesis. */
export async function* streamChatWithSonnet({ messages, context, quoteDossier = null }) {
  yield* streamComplete({
    model: SONNET,
    maxTokens: 900,
    temperature: 0.85,
    system: `${CHAT_SYSTEM}
${REASONING_STYLE}`,
    user: buildChatUserPayload({ messages, context, quoteDossier }),
  })
}

/**
 * Sonnet — initial post-check analysis (streamed).
 * Facts come from deterministic audit; prose is model-written each run.
 */
export async function* streamInitialAnalysisWithSonnet({
  auditResult,
  quoteDossier,
  meta,
  warnings = [],
}) {
  const findings = (auditResult?.errors || [])
    .filter((e) => !e.hidden)
    .map((e) => ({
      severity: e.severity,
      type: e.type,
      sku: e.sku,
      page: e.page,
      message: e.message,
      locations: e.locations,
      math: e.math,
    }))

  yield* streamComplete({
    model: SONNET,
    maxTokens: 1100,
    temperature: 0.9,
    system: `${HUMAN_VOICE}
${VISIBILITY_RULES}
${REASONING_STYLE}
You just finished a deterministic quote check. Write the opening analysis for the sales user.
Cover: send readiness (from verdict), the important findings (critical first, then warnings, then lighter notices), and invite them to click an issue or ask a question.
Do not comment on healthy, correct, or on-target margins. Do not praise the overall pricing strategy or average margin on clean lines. Skip any "most lines look fine" style asides. Only discuss margins when a finding flags them as a problem.
Low or 0% margins: frame as Dynamix making less money / SNAP pricing risk - never as something the customer would notice. High margins: customer / bid risk.
If any findings involve margin or sell math, briefly mention they can use the Calculator in the header to work target prices.
Ground every number and SKU in the provided audit findings / dossier. Never invent margins or issues.
Do not paste a rigid outline with identical section headers every time; write naturally like a coworker briefing them.`,
    user: `Deterministic audit result (source of truth for numbers and findings):
${JSON.stringify(
  {
    verdict: auditResult?.verdict,
    summaryCounts: auditResult?.summaryCounts,
    findings,
    meta,
    warnings,
  },
  null,
  2,
)}

Quote dossier (line-by-line context):
${JSON.stringify(quoteDossier, null, 2)}

Write the opening analysis now. Focus on problems only.`,
  })
}

/**
 * Sonnet — draft an outbound email from the user's perspective (not the app chatbot).
 * Streams plain text: first line "SUBJECT: ...", then blank line, then body.
 */
export async function* streamEmailDraftWithSonnet({
  quoteDossier,
  meta,
  activeErrors = [],
  verdict = null,
  pdfFileName = '',
  quoteNumber = null,
}) {
  yield* streamComplete({
    model: SONNET,
    maxTokens: 900,
    temperature: 0.7,
    system: `${HUMAN_VOICE}

You write email drafts the Dynamix sales user will send themselves (first person: I / we).
This is a real outbound email, not an in-app assistant reply.

Hard rules:
- Output format ONLY:
  Line 1: SUBJECT: <short subject>
  Line 2: blank
  Then the email body.
- Write from the user's perspective to a colleague, manager, or customer contact as appropriate.
- Use square-bracket placeholders the user can fill in, for example [Recipient Name], [Customer Name], [Your Name], [Your Team].
- Cover only the active findings provided. Never invent SKUs, prices, or issues.
- Do not mention this app, the chatbot, Calculator, tabs, buttons, ignore/hide, or any in-product tooling.
- Do not mention SNAP at all.
- You may refer to the customer quote PDF / Dynamix Customer Quote and the distributor Excel quote as business files, and note that an annotated PDF is attached.
- Soft language only (should / could / probably). No must / will block.
- Low margin = Dynamix profitability concern. High margin = customer/bid concern.
- Keep it professional and concise (about half a page). Plain text only: no markdown bold, no bullet asterisks for bold, no emojis.`,
    user: `Draft the email now.

Quote context:
${JSON.stringify(
  {
    quoteNumber,
    pdfFileName,
    verdict,
    meta,
    activeFindings: activeErrors,
  },
  null,
  2,
)}

Quote dossier (for accurate SKUs / pages / numbers only):
${JSON.stringify(quoteDossier, null, 2)}`,
  })
}

export const MODELS = { HAIKU, SONNET }
