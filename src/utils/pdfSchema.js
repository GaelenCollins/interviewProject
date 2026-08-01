/**
 * Customer Sales Quote PDF canonical schema + prompt helpers.
 * LLM fills this schema from extracted text; math stays in auditEngine.
 */

export const EMPTY_PDF_QUOTE = {
  quoteNumber: null,
  projectHeader: {
    title: null,
    cotermDate: null,
    expirationDate: null,
  },
  groups: [],
  grandTotal: null,
}

export function pdfExtractionSystemPrompt() {
  return `You extract structured data from a digital customer sales quote PDF text dump.
Return ONLY valid JSON matching the schema. Use YYYY-MM-DD for dates.
Do NOT calculate margins, markups, or invent numbers not present in the text.
If a field is missing, use null. Quantities and prices must be numbers.`
}

export function pdfExtractionUserPrompt(pdfText) {
  return `Extract this customer quote into:
{
  "quoteNumber": "string|null",
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

export function normalizePdfQuote(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PDF_QUOTE }

  return {
    quoteNumber: raw.quoteNumber ?? null,
    projectHeader: {
      title: raw.projectHeader?.title ?? null,
      cotermDate: raw.projectHeader?.cotermDate ?? null,
      expirationDate: raw.projectHeader?.expirationDate ?? null,
    },
    groups: Array.isArray(raw.groups)
      ? raw.groups.map((g) => ({
          groupTitle: g.groupTitle ?? '',
          serialNumber: g.serialNumber ?? null,
          page: g.page ?? null,
          coverageDates: {
            start: g.coverageDates?.start ?? null,
            end: g.coverageDates?.end ?? null,
          },
          billingSchedule: Array.isArray(g.billingSchedule)
            ? g.billingSchedule.map((b) => ({
                year: Number(b.year),
                amount: Number(b.amount),
              }))
            : [],
          lineItems: Array.isArray(g.lineItems)
            ? g.lineItems.map((item) => ({
                sku: String(item.sku || '').trim(),
                description: item.description ?? '',
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
