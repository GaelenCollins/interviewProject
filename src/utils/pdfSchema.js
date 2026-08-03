/**
 * Customer Sales Quote PDF canonical schema + prompt helpers.
 * LLM fills this schema from extracted text; math stays in auditEngine.
 */

import {
  detectCurrency,
  sanitizeSerial,
  sanitizeSku,
  sanitizeText,
  toIsoDate,
} from './ingestGuards.js'

export const EMPTY_PDF_QUOTE = {
  quoteNumber: null,
  projectHeader: {
    title: null,
    cotermDate: null,
    expirationDate: null,
  },
  groups: [],
  grandTotal: null,
  currency: null,
}

export function pdfExtractionSystemPrompt() {
  return `You extract structured data from a digital customer sales quote PDF text dump.
Return ONLY valid JSON matching the schema. Use YYYY-MM-DD for dates (never MM/DD/YYYY).
Do NOT calculate margins, markups, or invent numbers not present in the text.
If a field is missing, use null. Quantities and prices must be numbers.
CRITICAL money rule: copy every dollar amount EXACTLY as printed, including billing schedule years and totals.
Never round, never "fix" a 1¢ mismatch, never make a schedule sum to the section total if the PDF does not.
If Year 2 is one cent off in the PDF, extract that wrong cent — the audit engine must see it.
IMPORTANT: The first page often lists subscription groups + totals only. The Billing Schedule table (Year 1 / Year 2 / Payment amounts) is usually on a later detail page per subscription. Set schedulePage to that detail page — do NOT set schedulePage to 1 unless the Year/Payment table is literally on page 1.
Also set "currency" to USD, CAD, or EUR when clearly indicated (symbols $ € or codes).`
}

export function pdfExtractionUserPrompt(pdfText) {
  return `Extract this customer quote into:
{
  "quoteNumber": "string|null",
  "currency": "USD|CAD|EUR|null",
  "projectHeader": {
    "title": "string|null",
    "cotermDate": "YYYY-MM-DD|null",
    "expirationDate": "YYYY-MM-DD|null"
  },
  "groups": [
    {
      "groupTitle": "string",
      "serialNumber": "string|null",
      "page": "number|null — page where the group SUMMARY / total appears",
      "schedulePage": "number|null — page where this group's Billing Schedule table (Year 1/2/…) appears; often a later detail page, NOT the summary page",
      "coverageDates": { "start": "YYYY-MM-DD|null", "end": "YYYY-MM-DD|null" },
      "billingSchedule": [{ "year": "number|null", "periodLabel": "string|null", "amount": number, "page": "number|null — same as schedulePage when known" }],
      "lineItems": [
        {
          "sku": "string",
          "description": "string",
          "qty": number,
          "unitPrice": number,
          "extendedPrice": number,
          "page": number|null
        }
      ],
      "groupTotal": number|null
    }
  ],
  "grandTotal": number|null
}

PDF text (page markers included as <!-- page N -->):
${String(pdfText || '').slice(0, 28000)}`
}

export function normalizePdfQuote(raw, sourceText = '') {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PDF_QUOTE }

  const fromModel =
    raw.currency == null ? null : String(raw.currency).trim().toUpperCase()
  const currency =
    fromModel === 'USD' || fromModel === 'CAD' || fromModel === 'EUR'
      ? fromModel
      : detectCurrency(sourceText || JSON.stringify(raw))

  return {
    quoteNumber: raw.quoteNumber != null ? sanitizeText(raw.quoteNumber) || null : null,
    currency,
    projectHeader: {
      title:
        raw.projectHeader?.title != null
          ? sanitizeText(raw.projectHeader.title) || null
          : null,
      cotermDate: toIsoDate(raw.projectHeader?.cotermDate),
      expirationDate: toIsoDate(raw.projectHeader?.expirationDate),
    },
    groups: Array.isArray(raw.groups)
      ? raw.groups.map((g) => {
          const summaryPage = g.page == null ? null : Number(g.page)
          const schedulePage =
            g.schedulePage == null ? null : Number(g.schedulePage)
          return {
            groupTitle: sanitizeText(g.groupTitle ?? ''),
            serialNumber: sanitizeSerial(g.serialNumber),
            page: summaryPage != null && Number.isFinite(summaryPage) ? summaryPage : null,
            schedulePage:
              schedulePage != null && Number.isFinite(schedulePage)
                ? schedulePage
                : null,
            coverageDates: {
              start: toIsoDate(g.coverageDates?.start),
              end: toIsoDate(g.coverageDates?.end),
            },
            billingSchedule: Array.isArray(g.billingSchedule)
              ? g.billingSchedule.map((b, idx) => {
                  const yearNum =
                    b?.year == null || b?.year === ''
                      ? null
                      : Number(b.year)
                  const periodLabel =
                    b?.periodLabel != null
                      ? sanitizeText(b.periodLabel) || null
                      : b?.label != null
                        ? sanitizeText(b.label) || null
                        : yearNum != null && Number.isFinite(yearNum)
                          ? `Year ${yearNum}`
                          : `Period ${idx + 1}`
                  const entryPage =
                    b?.page == null ? null : Number(b.page)
                  return {
                    year: yearNum != null && Number.isFinite(yearNum) ? yearNum : null,
                    periodLabel,
                    amount: Number(b.amount ?? b.billing),
                    page:
                      entryPage != null && Number.isFinite(entryPage)
                        ? entryPage
                        : schedulePage != null && Number.isFinite(schedulePage)
                          ? schedulePage
                          : null,
                  }
                })
              : [],
            lineItems: Array.isArray(g.lineItems)
              ? g.lineItems.map((item) => ({
                  sku: sanitizeSku(item.sku),
                  description: sanitizeText(item.description ?? ''),
                  qty: Number(item.qty),
                  unitPrice: Number(item.unitPrice),
                  extendedPrice: Number(item.extendedPrice),
                  page: item.page ?? g.page ?? null,
                }))
              : [],
            groupTotal: g.groupTotal == null ? null : Number(g.groupTotal),
          }
        })
      : [],
    grandTotal: raw.grandTotal == null ? null : Number(raw.grandTotal),
  }
}

/** Split PDF markdown into { page, text } chunks via <!-- page N --> markers. */
export function splitPdfMarkdownPages(markdown) {
  const raw = String(markdown || '')
  if (!raw.trim()) return []
  const parts = raw.split(/<!--\s*page\s+(\d+)\s*-->/i)
  // parts: [preamble, pageNum, body, pageNum, body, ...]
  const out = []
  for (let i = 1; i < parts.length; i += 2) {
    const page = Number(parts[i])
    const text = parts[i + 1] || ''
    if (Number.isFinite(page)) out.push({ page, text })
  }
  if (!out.length && raw.trim()) out.push({ page: 1, text: raw })
  return out
}

function pageLooksLikeBillingSchedule(text) {
  const t = String(text || '')
  if (/billing\s*schedule/i.test(t)) return true
  // Year/Payment table rows with money (detail pages), not just "3 Annual Payments"
  const yearHits = (t.match(/\b(?:year|yr\.?|payment)\s*#?\s*[1-9]\b/gi) || [])
    .length
  const moneyHits = (t.match(/\$\s*[\d,]+(?:\.\d{2})?/g) || []).length
  return yearHits >= 2 && moneyHits >= 2
}

/**
 * Deterministically attach schedulePage to each group from PDF text.
 * Summary totals often live on page 1; Year N tables are on later detail pages.
 */
export function enrichPdfSchedulePages(pdfData, markdown) {
  if (!pdfData || !Array.isArray(pdfData.groups)) return pdfData
  const pages = splitPdfMarkdownPages(markdown)
  if (!pages.length) return pdfData

  const schedulePages = pages.filter((p) => pageLooksLikeBillingSchedule(p.text))

  for (const group of pdfData.groups) {
    if (!group.billingSchedule?.length) continue

    const hints = [
      group.serialNumber,
      group.groupTitle,
      ...(group.lineItems || []).map((l) => l.sku),
    ]
      .filter(Boolean)
      .map((h) => String(h).toLowerCase())

    let best = null
    for (const sp of schedulePages) {
      const hay = sp.text.toLowerCase()
      const hintHit = hints.some((h) => h.length >= 4 && hay.includes(h))
      // Prefer detail pages that mention this group; otherwise any schedule page
      if (hintHit) {
        best = sp.page
        break
      }
      if (best == null) best = sp.page
    }

    // If LLM already set a schedulePage that looks like a real schedule page, keep it
    const llmSchedule = group.schedulePage
    const llmIsSchedule =
      llmSchedule != null &&
      schedulePages.some((p) => p.page === llmSchedule)

    const resolved = llmIsSchedule
      ? llmSchedule
      : best != null
        ? best
        : group.schedulePage || null

    // Never leave schedule pointing only at the summary page when detail pages exist
    const summaryOnly =
      resolved != null &&
      resolved === group.page &&
      schedulePages.some((p) => p.page !== group.page)
    const schedulePage = summaryOnly
      ? schedulePages.find((p) => p.page !== group.page)?.page || resolved
      : resolved

    group.schedulePage = schedulePage
    group.billingSchedule = (group.billingSchedule || []).map((b) => ({
      ...b,
      page: b.page && b.page !== group.page ? b.page : schedulePage || b.page || null,
    }))
  }

  return pdfData
}
