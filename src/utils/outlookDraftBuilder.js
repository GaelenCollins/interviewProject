/**
 * Client-side RFC 822 (.eml) builder for Outlook drafts with attachments
 * (annotated PDF + original Excel distributor quote).
 * mailto: cannot attach files — opening .eml launches Outlook with body + attachments.
 */

import {
  buildAnnotatedFilename,
  generateAnnotatedPdf,
} from './pdfAnnotator.js'
import { computeVerdict } from './auditEngine.js'

function uint8ToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function foldBase64(b64, lineLen = 76) {
  const lines = []
  for (let i = 0; i < b64.length; i += lineLen) {
    lines.push(b64.slice(i, i + lineLen))
  }
  return lines.join('\r\n')
}

function encodeSubject(subject) {
  const s = String(subject || '').replace(/[\r\n]+/g, ' ').trim()
  // Keep ASCII subjects plain; encode others as UTF-8 B
  if (/^[\x20-\x7E]*$/.test(s)) return s
  const b64 = btoa(unescape(encodeURIComponent(s)))
  return `=?UTF-8?B?${b64}?=`
}

function normalizeBodyNewlines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\r\n')
}

function escapeHeaderValue(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
}

function stripSeverityPrefix(message) {
  return String(message || '')
    .replace(/^(CRITICAL|WARNING|NOTICE):\s*/i, '')
    .trim()
}

/** Keep SNAP out of outbound email copy (and annotated-PDF-adjacent text). */
export function scrubSnapFromEmailText(text) {
  return String(text || '')
    .replace(/\bDynamix SNAP\b/gi, 'Dynamix Customer Quote')
    .replace(/\bSNAP PDF\b/gi, 'customer quote PDF')
    .replace(/\bin SNAP\b/gi, 'on the customer quote')
    .replace(/\bon SNAP\b/gi, 'on the customer quote')
    .replace(/\bSNAP\b/gi, 'customer quote')
}

/** Deterministic email body from active audit findings (no LLM). */
export function generateDeterministicEmail({
  errors = [],
  pdfFileName = '',
  quoteNumber = null,
} = {}) {
  const active = (errors || []).filter((e) => !e.hidden)
  const verdict = computeVerdict(active)
  const quoteLabel = quoteNumber || pdfFileName || 'this quote'

  const lines = []
  lines.push('Hi [Recipient Name],')
  lines.push('')
  lines.push(
    `I reviewed ${quoteLabel} for [Customer Name] and wanted to flag a few items before we send.`,
  )
  lines.push('')

  if (verdict === 'UNSAFE_TO_SEND') {
    lines.push('I would hold send for now until the critical items below are resolved.')
  } else if (verdict === 'REQUIRES_APPROVAL') {
    lines.push('I would like a quick second look on the warnings below before send.')
  } else if (active.length === 0) {
    lines.push('I did not find any open critical or warning items on the current review.')
  } else {
    lines.push('Nothing blocking, but a few lighter items are worth a glance:')
  }
  lines.push('')

  const critical = active.filter((e) => e.severity === 'CRITICAL')
  const warnings = active.filter((e) => e.severity === 'WARNING')
  const notices = active.filter((e) => e.severity === 'NOTICE')

  const section = (title, items) => {
    if (!items.length) return
    lines.push(`${title}:`)
    for (const e of items) {
      const where = e.page ? ` (PDF page ${e.page})` : ''
      const sku = e.sku ? `SKU ${e.sku}: ` : ''
      lines.push(
        `- ${sku}${scrubSnapFromEmailText(stripSeverityPrefix(e.message))}${where}`,
      )
    }
    lines.push('')
  }

  section('Critical', critical)
  section('Warnings', warnings)
  section('Notices', notices)

  lines.push(
    'I attached an annotated PDF that marks up the findings on the customer quote, plus the original distributor Excel for reference.',
  )
  lines.push('')
  lines.push('Thanks,')
  lines.push('[Your Name]')

  return lines.join('\n')
}

function excelMimeType(fileName = '', contentType = '') {
  const typed = String(contentType || '').trim()
  if (typed && typed !== 'application/octet-stream') return typed
  const name = String(fileName || '').toLowerCase()
  if (name.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (name.endsWith('.csv')) return 'text/csv'
  return 'application/octet-stream'
}

function sanitizeAttachmentName(name, fallback) {
  const raw = String(name || fallback || 'attachment')
    .replace(/[\r\n"]+/g, '_')
    .trim()
  return raw || fallback || 'attachment'
}

/**
 * Pick the best email body from recent assistant chat, else deterministic fallback.
 */
export function resolveEmailBody({
  chatMessages = [],
  errors = [],
  pdfFileName = '',
  quoteNumber = null,
} = {}) {
  const assistants = [...chatMessages]
    .reverse()
    .filter((m) => m.role === 'assistant' && !m.streaming && String(m.text || '').trim())

  // Prefer an assistant reply that looks like an email draft
  const drafted = assistants.find((m) =>
    /^(hi|hello|dear|good\s+(morning|afternoon|evening))\b/i.test(
      String(m.text).trim(),
    ),
  )
  if (drafted) return String(drafted.text).trim()

  // Else use latest substantive check summary (skip short status lines)
  const summary = assistants.find((m) => String(m.text).trim().length > 80)
  if (summary) {
    return `${String(summary.text).trim()}\n\nI attached an annotated PDF with highlights for the active findings, plus the original distributor Excel for reference.\n\nThanks,`
  }

  return generateDeterministicEmail({ errors, pdfFileName, quoteNumber })
}

/**
 * Build a message/rfc822 Blob for Outlook (X-Unsent draft + attachments).
 */
export async function buildOutlookDraft({
  to = '',
  subject = '',
  bodyText = '',
  pdfArrayBuffer,
  auditResults = {},
  fileName = 'customer_quote.pdf',
  excelArrayBuffer = null,
  excelFileName = '',
  excelContentType = '',
} = {}) {
  if (!pdfArrayBuffer) {
    throw new Error('PDF file is required to build an Outlook draft.')
  }

  const annotatedBytes = await generateAnnotatedPdf(pdfArrayBuffer, auditResults)
  const pdfAttachmentName = sanitizeAttachmentName(
    buildAnnotatedFilename(fileName),
    'annotated_quote.pdf',
  )
  const pdfBase64 = foldBase64(uint8ToBase64(annotatedBytes))

  const boundary = `----=_Part_Dynamix_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`

  const body = normalizeBodyNewlines(scrubSnapFromEmailText(bodyText))
  const toHeader = escapeHeaderValue(to)
  const subjectHeader = encodeSubject(
    scrubSnapFromEmailText(subject || 'Quote check findings'),
  )

  const parts = [
    'MIME-Version: 1.0',
    'X-Unsent: 1',
    toHeader ? `To: ${toHeader}` : 'To: ',
    `Subject: ${subjectHeader}`,
    'X-Mailer: Dynamix Sales Quote Checker',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfAttachmentName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${pdfAttachmentName}"`,
    '',
    pdfBase64,
  ]

  if (excelArrayBuffer) {
    const excelName = sanitizeAttachmentName(
      excelFileName,
      'distributor_quote.xlsx',
    )
    const excelType = excelMimeType(excelName, excelContentType)
    const excelBytes =
      excelArrayBuffer instanceof Uint8Array
        ? excelArrayBuffer
        : new Uint8Array(excelArrayBuffer)
    const excelBase64 = foldBase64(uint8ToBase64(excelBytes))
    parts.push(
      `--${boundary}`,
      `Content-Type: ${excelType}; name="${excelName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${excelName}"`,
      '',
      excelBase64,
    )
  }

  parts.push(`--${boundary}--`, '')

  return new Blob([parts.join('\r\n')], { type: 'message/rfc822' })
}

/** Trigger a browser download of the .eml draft (user opens it in Outlook). */
export function downloadOutlookDraft(blob, downloadName = 'Quote_Revision.eml') {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Parse LLM email output: SUBJECT: line, blank line, body. */
export function parseLlmEmailDraft(raw) {
  const text = String(raw || '').trim()
  if (!text) return { subject: '', body: '' }

  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/im)
  let subject = subjectMatch ? subjectMatch[1].trim() : ''
  let body = text

  if (subjectMatch) {
    body = text.replace(/^SUBJECT:\s*.+$/im, '').replace(/^\s*\n/, '').trim()
  }

  // If model wrapped body in accidental fences
  body = body.replace(/^```(?:text|email)?\s*/i, '').replace(/\s*```$/i, '').trim()

  return { subject, body }
}
