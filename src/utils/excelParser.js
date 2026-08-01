/**
 * Distributor Excel → canonical schema (Quote Renewal tab).
 * Uses SheetJS (xlsx). Source files are never modified.
 */

import * as XLSX from 'xlsx'
import { toNumber } from './auditEngine.js'
import { excelColLetter } from './excelCols.js'
import {
  detectCurrency,
  sanitizeSerial,
  sanitizeSku,
  sanitizeText,
  toIsoDate,
} from './ingestGuards.js'

/**
 * @returns {{
 *  supplierQuoteNumber: string|null,
 *  contractDates: { start: string|null, end: string|null, expiration: string|null },
 *  lineItems: Array<object>,
 *  totalResellerCost: number|null,
 *  notes: string,
 *  currency: string|null,
 *  _debug?: object
 * }}
 */
export function parseDistributorExcel(buffer, filename = '') {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName =
    workbook.SheetNames.find((n) => /quote\s*renewal/i.test(n)) ||
    workbook.SheetNames[0]

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: false,
  })

  const headerIdx = findHeaderRow(rows)
  const headers =
    headerIdx >= 0 ? rows[headerIdx].map((h) => String(h ?? '').trim()) : []

  const metaBlob = rows
    .slice(0, 12)
    .flat()
    .filter(Boolean)
    .map(String)
    .join('\n')

  const pick = (re) => {
    const m = metaBlob.match(re)
    return m ? m[1].trim() : null
  }

  const notesSheet = workbook.SheetNames.find((n) => /notes/i.test(n))
  let notes = ''
  if (notesSheet) {
    const noteRows = XLSX.utils.sheet_to_json(workbook.Sheets[notesSheet], {
      header: 1,
      defval: '',
    })
    notes = noteRows
      .flat()
      .map(String)
      .filter(Boolean)
      .join('\n')
  }

  const dataStart = headerIdx >= 0 ? headerIdx + 1 : 0
  const rawDataRows = headerIdx >= 0 ? rows.slice(dataStart) : []
  const lineItems = extractLineItems(headers, rawDataRows, {
    sheetName,
    dataStartRowIndex: dataStart,
  })
  const totalResellerCost =
    toNumber(pick(/Grand Total[^\d]*([\d,.]+)/i)) ??
    roundSum(lineItems.map((l) => l.resellerExtCost))

  const currency = detectCurrency(`${metaBlob}\n${notes}`)

  return {
    supplierQuoteNumber:
      pick(/Supplier Quote#:\s*([^\n]+)/i) || pick(/Arrow Quote#:\s*([^\n]+)/i),
    contractDates: {
      start: toIsoDate(pick(/Contract Start Date:\s*([^\n]+)/i)),
      end: toIsoDate(pick(/Contract End Date:\s*([^\n]+)/i)),
      expiration: toIsoDate(pick(/Quote Expiration Date:\s*([^\n]+)/i)),
    },
    lineItems,
    totalResellerCost,
    notes,
    currency,
    sheetName,
    _debug: {
      filename,
      sheetName,
      headerRowIndex: headerIdx,
      headers,
    },
  }
}

function parseDiscountPercent(rawValue, header = '') {
  if (rawValue == null || String(rawValue).trim() === '') return null
  const str = String(rawValue).trim()
  if (str.includes('%')) {
    return toNumber(str.replace(/%/g, ''))
  }
  const n = toNumber(rawValue)
  if (n == null) return null
  if (/%/.test(String(header || ''))) return n
  if (n > 0 && n <= 1) return n * 100
  return n
}

export { excelColLetter, toIsoDate }

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const joined = (rows[i] || []).map((c) => String(c ?? '')).join(' | ')
    if (/service sku/i.test(joined) && /reseller price/i.test(joined)) return i
    if (/sku/i.test(joined) && /qty/i.test(joined) && /price/i.test(joined)) return i
  }
  return -1
}

function extractLineItems(headers, dataRows, { sheetName = null, dataStartRowIndex = 0 } = {}) {
  const idx = (patterns) =>
    headers.findIndex((h) => patterns.some((re) => re.test(h || '')))

  const lineI = idx([/^line$/i])
  const skuI = idx([/service sku$/i, /^sku$/i])
  const descI = idx([/service sku description/i, /description/i])
  const qtyI = idx([/^qty$/i, /quantity/i])
  const resellerI = idx([/reseller price$/i, /unit cost/i])
  const resellerExtI = idx([/reseller price ext/i])
  const discountI = idx([
    /^discount\s*%?$/i,
    /discount\s*%/i,
    /disc\.?\s*%/i,
    /^disc$/i,
  ])
  const serialI = idx([/serial/i])
  const startI = idx([/service start/i, /start date/i])
  const endI = idx([/service end/i, /end date/i])

  if (skuI < 0 || resellerI < 0) return []

  const items = []
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    if (!row?.some((c) => c != null && String(c).trim() !== '')) continue

    const skuRaw = row[skuI]
    if (skuRaw == null) continue
    const sku = sanitizeSku(skuRaw)
    if (!sku || /^total/i.test(sku)) continue
    if (!/^[A-Z0-9][A-Z0-9._-]{2,}$/i.test(sku)) continue

    const qty = toNumber(row[qtyI]) ?? 1
    const resellerUnitCost = toNumber(row[resellerI])
    if (resellerUnitCost == null) continue

    const resellerExtCost =
      toNumber(row[resellerExtI]) ??
      Math.round(resellerUnitCost * qty * 100) / 100

    const discountPercent =
      discountI >= 0 ? parseDiscountPercent(row[discountI], headers[discountI]) : null

    const excelRow = dataStartRowIndex + i + 1

    items.push({
      line: lineI >= 0 ? toNumber(row[lineI]) : items.length + 1,
      sku,
      description: descI >= 0 ? sanitizeText(row[descI] ?? '') : '',
      qty,
      resellerUnitCost,
      resellerExtCost,
      discountPercent,
      serialNumber: serialI >= 0 ? sanitizeSerial(row[serialI]) : null,
      coverageStart: startI >= 0 ? toIsoDate(row[startI]) : null,
      coverageEnd: endI >= 0 ? toIsoDate(row[endI]) : null,
      sheetName,
      excelRow,
      excelCols: {
        sku: excelColLetter(skuI),
        qty: qtyI >= 0 ? excelColLetter(qtyI) : null,
        resellerUnitCost: excelColLetter(resellerI),
        resellerExtCost: resellerExtI >= 0 ? excelColLetter(resellerExtI) : null,
        discountPercent: discountI >= 0 ? excelColLetter(discountI) : null,
        serialNumber: serialI >= 0 ? excelColLetter(serialI) : null,
        coverageEnd: endI >= 0 ? excelColLetter(endI) : null,
      },
    })
  }
  return items
}

function roundSum(values) {
  const n = values.reduce((a, v) => a + (toNumber(v) || 0), 0)
  return Math.round(n * 100) / 100
}
