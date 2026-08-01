/**
 * Shared ingestion guards: sanitization, dates, currency, SNAP shape checks.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MIN_PDF_TEXT_CHARS = 50

/** Strip hidden breaks / tabs and trim — for SKUs, serials, descriptions. */
export function sanitizeText(value) {
  if (value == null) return ''
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/[\r\n\t]/g, '')
    .trim()
}

export function sanitizeSku(value) {
  return sanitizeText(value)
}

export function sanitizeSerial(value) {
  const s = sanitizeText(value)
  return s || null
}

/**
 * Normalize date strings to YYYY-MM-DD.
 * Prefer US MM/DD/YYYY when ambiguous; if first part > 12, treat as DD/MM/YYYY.
 */
export function toIsoDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value).trim()

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const mono = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (mono) {
    const months = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    }
    const mm = months[mono[2].toUpperCase()]
    if (!mm) return null
    const yyyy = mono[3].length === 2 ? `20${mono[3]}` : mono[3]
    return `${yyyy}-${mm}-${mono[1].padStart(2, '0')}`
  }

  const parts = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (parts) {
    const a = Number(parts[1])
    const b = Number(parts[2])
    const yyyy = parts[3].length === 2 ? `20${parts[3]}` : parts[3]
    // First part > 12 → day/month/year (international)
    if (a > 12 && b >= 1 && b <= 12) {
      return `${yyyy}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
    }
    // Default US month/day/year
    return `${yyyy}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
  }

  return null
}

/**
 * Detect currency code from free text. Returns USD | CAD | EUR | null.
 * Bare "$" is treated as USD when no other code is present.
 */
export function detectCurrency(text) {
  const s = String(text || '')
  if (!s.trim()) return null

  if (/\bCAD\b/i.test(s) || /C\$/.test(s)) return 'CAD'
  if (/\bEUR\b/i.test(s) || /€/.test(s)) return 'EUR'
  if (/\bUSD\b/i.test(s) || /\bUS\$\b/i.test(s)) return 'USD'
  if (/\$/.test(s)) return 'USD'
  return null
}

export function countPdfLineItems(pdfData) {
  return (pdfData?.groups || []).reduce(
    (n, g) => n + (g.lineItems || []).length,
    0,
  )
}

/** Loose SNAP / Dynamix customer-quote shape check. */
export function looksLikeSnapQuote(pdfText, pdfData) {
  const text = String(pdfText || '')
  const lineCount = countPdfLineItems(pdfData)
  if (lineCount === 0) return false
  const hasSkuLike =
    /\bRS-[A-Z0-9-]+\b/i.test(text) ||
    (pdfData.groups || []).some((g) =>
      (g.lineItems || []).some((i) => /[A-Z0-9-]{4,}/i.test(String(i.sku || ''))),
    )
  const hasMarkers =
    /coterm|coverage|billing|quote\s*#|grand\s*total|subscription/i.test(text) ||
    Boolean(pdfData.quoteNumber) ||
    Boolean(pdfData.projectHeader?.cotermDate)
  return hasSkuLike || hasMarkers
}

export function plainPdfTextLength(pdfText) {
  const md = String(pdfText?.markdown || pdfText || '')
  return md
    .replace(/<!--\s*page\s+\d+\s*-->/gi, '')
    .replace(/\n---\n/g, '')
    .replace(/\s+/g, ' ')
    .trim().length
}
