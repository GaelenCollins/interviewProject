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
      "page": number|null,
      "coverageDates": { "start": "YYYY-MM-DD|null", "end": "YYYY-MM-DD|null" },
      "billingSchedule": [{ "year": number, "amount": number }],
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
      ? raw.groups.map((g) => ({
          groupTitle: sanitizeText(g.groupTitle ?? ''),
          serialNumber: sanitizeSerial(g.serialNumber),
          page: g.page ?? null,
          coverageDates: {
            start: toIsoDate(g.coverageDates?.start),
            end: toIsoDate(g.coverageDates?.end),
          },
          billingSchedule: Array.isArray(g.billingSchedule)
            ? g.billingSchedule.map((b) => ({
                year: Number(b.year),
                amount: Number(b.amount),
              }))
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
        }))
      : [],
    grandTotal: raw.grandTotal == null ? null : Number(raw.grandTotal),
  }
}
