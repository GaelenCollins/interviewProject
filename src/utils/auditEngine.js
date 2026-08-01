/**
 * Deterministic quote check engine — ZERO LLM math.
 * All formulas executed here in pure JavaScript.
 */

import {
  CUSTOMER_QUOTE,
  DISTRIBUTOR_QUOTE,
  skuLabel,
} from '../constants/labels.js'

const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, NOTICE: 2 }

/** Dynamix margin policy (gross margin %) */
export const MARGIN_POLICY = {
  TARGET_MIN: 8,
  TARGET_MAX: 12,
  FLOOR: 5,
  CEILING: 20,
}

/** Soft aside when margins look irregular — customer may already know. */
export const CAPEX_OPEX_NOTE =
  'If this was intentional for a customer preference around margin rebalancing (for example CapEx vs OpEx), you may already know; otherwise treat it as worth a quick check.'

export function toNumber(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(String(value).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function roundMoney(value) {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

export function roundPct(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** Gross Margin % = ((Sell - Cost) / Sell) * 100 */
export function grossMarginPercent(sellPrice, resellerCost) {
  const sell = toNumber(sellPrice)
  const cost = toNumber(resellerCost)
  if (sell == null || cost == null || sell === 0) return null
  return ((sell - cost) / sell) * 100
}

/** Gross Markup % = ((Sell - Cost) / Cost) * 100 */
export function grossMarkupPercent(sellPrice, resellerCost) {
  const sell = toNumber(sellPrice)
  const cost = toNumber(resellerCost)
  if (sell == null || cost == null || cost === 0) return null
  return ((sell - cost) / cost) * 100
}

/** Corrected Sell = Cost / (1 - TargetMargin/100) */
export function correctedSellPrice(resellerCost, targetMarginPercent) {
  const cost = toNumber(resellerCost)
  const m = toNumber(targetMarginPercent)
  if (cost == null || m == null || m >= 100) return null
  return roundMoney(cost / (1 - m / 100))
}

export function isValidExtension(unitPrice, quantity, extendedPrice, tol = 0.01) {
  const u = toNumber(unitPrice)
  const q = toNumber(quantity)
  const e = toNumber(extendedPrice)
  if (u == null || q == null || e == null) return null
  return Math.abs(u * q - e) < tol
}

export function isScheduleBalanced(annualPayments, sectionTotal, tol = 0.01) {
  const total = toNumber(sectionTotal)
  if (total == null) return null
  const sum = (annualPayments || []).reduce((acc, p) => {
    const amt = toNumber(typeof p === 'number' ? p : p?.amount)
    return acc + (amt ?? 0)
  }, 0)
  return Math.abs(sum - total) < tol
}

export function mean(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function stdDev(values) {
  const nums = values.filter((v) => v != null && Number.isFinite(v))
  if (nums.length < 2) return null
  const μ = mean(nums)
  const variance = nums.reduce((acc, v) => acc + (v - μ) ** 2, 0) / nums.length
  return Math.sqrt(variance)
}

export function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeSku(sku) {
  return String(sku || '')
    .trim()
    .toUpperCase()
}

/** Structured location for UI + a short plain-text fallback. */
export function buildSourceLocation({
  sheetName = null,
  excelRow = null,
  excelCol = null,
  page = null,
} = {}) {
  const excelParts = []
  if (sheetName) excelParts.push(`Sheet "${sheetName}"`)
  if (excelCol) excelParts.push(`column ${excelCol}`)
  if (excelRow != null) excelParts.push(`row ${excelRow}`)

  const locationParts = {
    sheetName: sheetName || null,
    excelCol: excelCol || null,
    excelRow: excelRow ?? null,
    page: page ?? null,
    excelLabel: excelParts.length ? excelParts.join(' · ') : null,
    pdfLabel: page != null ? `Page ${page}` : null,
  }

  const bits = []
  if (locationParts.excelLabel) {
    bits.push(`${DISTRIBUTOR_QUOTE}: ${locationParts.excelLabel}`)
  }
  if (locationParts.pdfLabel) {
    bits.push(`${CUSTOMER_QUOTE}: ${locationParts.pdfLabel}`)
  }

  return {
    locations: bits.length ? bits.join(' · ') : null,
    locationParts,
  }
}

/** @deprecated use buildSourceLocation */
export function formatSourceLocations(opts) {
  return buildSourceLocation(opts).locations
}

/** Deterministic "anything weird?" notes for an Excel line */
export function inspectExcelLine(item, allItems = []) {
  if (!item) return []
  const hints = []
  const qty = toNumber(item.qty)
  const unit = toNumber(item.resellerUnitCost)
  const ext = toNumber(item.resellerExtCost)
  const discount = toNumber(item.discountPercent)

  if (qty != null && qty <= 0) hints.push(`Quantity is ${qty}, which is unusual.`)
  if (unit != null && unit <= 0) hints.push(`Reseller unit cost is ${formatMoney(unit)}.`)
  if (
    qty != null &&
    unit != null &&
    ext != null &&
    Math.abs(unit * qty - ext) >= 0.02
  ) {
    hints.push(
      `Reseller ext ${formatMoney(ext)} does not equal unit ${formatMoney(unit)} × qty ${qty}.`,
    )
  }
  if (item.serialNumber && /\n|\s{2,}/.test(String(item.serialNumber))) {
    hints.push('Serial number cell has extra spaces or line breaks.')
  }
  if (!item.coverageStart || !item.coverageEnd) {
    hints.push(`Coverage start/end date is blank on this ${DISTRIBUTOR_QUOTE} row.`)
  }
  if (item.description && String(item.description).length < 3) {
    hints.push('Description looks empty or truncated.')
  }

  if (discount != null) {
    const peers = (allItems || [])
      .filter((r) => normalizeSku(r.sku) !== normalizeSku(item.sku))
      .map((r) => toNumber(r.discountPercent))
      .filter((d) => d != null)
    if (peers.length >= 2) {
      const peerMean = mean(peers)
      const peerMin = Math.min(...peers)
      const peerMax = Math.max(...peers)
      if (peerMean != null && discount < peerMean * 0.35 && peerMean - discount >= 2) {
        hints.push(
          `Side note only (not the cause): this Excel row's discount is ${roundPct(discount)}% vs peer average ~${roundPct(peerMean)}% (${roundPct(peerMin)}%–${roundPct(peerMax)}%). Fishy enough to double-check that line thoroughly; do not treat it as what caused the PDF issue.`,
        )
      } else if (peerMean != null && discount > peerMean * 2.5 && discount - peerMean >= 5) {
        hints.push(
          `Side note only (not the cause): this Excel row's discount is ${roundPct(discount)}% vs peer average ~${roundPct(peerMean)}%. Worth a quick double-check; do not treat it as what caused the PDF issue.`,
        )
      }
    }
  }

  return hints
}

function flattenPdfLines(pdfData) {
  const out = []
  for (const group of pdfData.groups || []) {
    for (const item of group.lineItems || []) {
      out.push({
        ...item,
        groupTitle: group.groupTitle,
        serialNumber: group.serialNumber ?? item.serialNumber ?? null,
        coverageStart: group.coverageDates?.start ?? null,
        coverageEnd: group.coverageDates?.end ?? null,
        page: item.page ?? group.page ?? null,
      })
    }
  }
  return out
}

function buildComparedLines(excelData, pdfData) {
  const pdfLines = flattenPdfLines(pdfData)
  const excelBySku = new Map()
  for (const row of excelData.lineItems || []) {
    const sku = normalizeSku(row.sku)
    if (!sku) continue
    if (!excelBySku.has(sku)) excelBySku.set(sku, [])
    excelBySku.get(sku).push(row)
  }

  const pdfBySku = new Map()
  for (const row of pdfLines) {
    const sku = normalizeSku(row.sku)
    if (!sku) continue
    if (!pdfBySku.has(sku)) pdfBySku.set(sku, [])
    pdfBySku.get(sku).push(row)
  }

  const skus = new Set([...excelBySku.keys(), ...pdfBySku.keys()])
  const compared = []

  for (const sku of skus) {
    const excelRows = excelBySku.get(sku) || []
    const pdfRows = pdfBySku.get(sku) || []
    const excelQty = excelRows.reduce((s, r) => s + (toNumber(r.qty) || 0), 0)
    const pdfQty = pdfRows.reduce((s, r) => s + (toNumber(r.qty) || 0), 0)
    const cost =
      toNumber(excelRows[0]?.resellerUnitCost) ??
      toNumber(excelRows[0]?.resellerPrice) ??
      toNumber(excelRows[0]?.cost)
    const sell =
      toNumber(pdfRows[0]?.unitPrice) ?? toNumber(pdfRows[0]?.sell)
    const margin = grossMarginPercent(sell, cost)
    const markup = grossMarkupPercent(sell, cost)

    compared.push({
      sku,
      description:
        pdfRows[0]?.description || excelRows[0]?.description || '',
      excelQty: excelRows.length ? excelQty : null,
      pdfQty: pdfRows.length ? pdfQty : null,
      qty: pdfRows.length ? pdfQty : excelQty,
      resellerUnitCost: cost,
      unitPrice: sell,
      extendedPrice:
        toNumber(pdfRows[0]?.extendedPrice) ??
        (sell != null && pdfQty ? roundMoney(sell * pdfQty) : null),
      margin,
      markup,
      marginRounded: roundPct(margin),
      markupRounded: roundPct(markup),
      page: pdfRows[0]?.page ?? null,
      line: excelRows[0]?.line ?? null,
      sheetName: excelRows[0]?.sheetName ?? excelData.sheetName ?? null,
      excelRow: excelRows[0]?.excelRow ?? null,
      excelCols: excelRows[0]?.excelCols ?? null,
      excelSerial: excelRows[0]?.serialNumber ?? null,
      pdfSerial: pdfRows[0]?.serialNumber ?? null,
      coverageEnd: pdfRows[0]?.coverageEnd || excelRows[0]?.coverageEnd || null,
      inExcel: excelRows.length > 0,
      inPdf: pdfRows.length > 0,
    })
  }

  // Mean / σ from clean lines only (exclude 0% / negative margin errors)
  const cleanMargins = compared
    .filter((r) => r.inExcel && r.inPdf && r.margin != null && r.margin > 0)
    .map((r) => r.margin)
  const μ = mean(cleanMargins)
  const σ = stdDev(cleanMargins)

  return {
    lines: compared.map((r) => {
      const z =
        r.margin != null &&
        r.margin > 0 &&
        μ != null &&
        σ != null &&
        σ > 0
          ? Math.abs(r.margin - μ) / σ
          : null
      return {
        ...r,
        zScore: z != null ? roundPct(z) : null,
        // Mild: >2σ; extreme: >3σ
        isOutlier: z != null && z > 2,
        isExtremeOutlier: z != null && z > 3,
      }
    }),
    meanMargin: μ,
    stdDevMargin: σ,
    meanMarginRounded: roundPct(μ),
    stdDevMarginRounded: roundPct(σ),
  }
}

function makeError({
  type,
  severity,
  message,
  sku = null,
  page = null,
  line = null,
  excelRow = null,
  excelCol = null,
  sheetName = null,
  math = null,
  showMarginTable = false,
  excelHints = [],
  excelSource = null,
  discountContext = null,
  highlightTerms = null,
}) {
  const isMarginIssue =
    showMarginTable || /MARGIN|ZERO|NEGATIVE|FLOOR|CEILING|OUTLIER|TARGET_BAND/i.test(type)
  const isZeroMargin = /ZERO_OR_NEGATIVE_MARGIN/i.test(type)
  const isReducedMarginFloor = /MARGIN_BELOW_FLOOR/i.test(type)

  const actions = [
    {
      label: 'What caused this?',
      kind: 'cause',
      query: isZeroMargin
        ? `What could have caused this? Lead with the ${DISTRIBUTOR_QUOTE} cost vs ${CUSTOMER_QUOTE} sell comparison. Treat a 0% margin as a critical pricing error on the SNAP PDF first. As a brief aside, note that customer preferences around margin rebalancing (for example CapEx vs OpEx) can also explain irregular margins if the user already knows about that. Soft suggestions only (probably should); never say it "needs" to be raised. (${type}${sku ? ` · ${skuLabel(sku)}` : ''})`
        : isReducedMarginFloor
          ? `What could have caused this? Lead with the ${DISTRIBUTOR_QUOTE} cost vs ${CUSTOMER_QUOTE} sell comparison. Treat a SNAP PDF entry issue as more likely, and keep customer preferences around margin rebalancing (for example CapEx vs OpEx) as a brief aside. Soft suggestions only (probably should); never say it "needs" to change. (${type}${sku ? ` · ${skuLabel(sku)}` : ''})`
          : `What could have caused this? Lead with the ${DISTRIBUTOR_QUOTE} cost vs ${CUSTOMER_QUOTE} sell comparison. Treat Excel as the unalterable cost benchmark; the PDF is from SNAP where manual edits happen. Soft suggestions only; never say the user "needs" to change a price. (${type}${sku ? ` · ${skuLabel(sku)}` : ''})`,
    },
  ]
  if (!isMarginIssue) {
    actions.push({
      label: 'What needs to change?',
      kind: 'fix',
      query: `What might need to change here? Describe the mismatch clearly. Soft suggestions only (probably should); do not invent a new sell price and do not say anything "needs" to be raised. (${type}${sku ? ` · ${skuLabel(sku)}` : ''})`,
    })
  }
  if (isMarginIssue) {
    actions.unshift({
      label: 'See margin breakdown',
      kind: 'margins',
      query: `Show me the margin breakdown${sku ? ` for ${skuLabel(sku)}` : ''}. Do not suggest a sell price.`,
    })
  }
  if (isZeroMargin || isReducedMarginFloor) {
    actions.push({
      label: 'Margin rebalancing?',
      kind: 'capex_opex',
      query: `Could this irregular margin be intentional customer preference around margin rebalancing (for example CapEx vs OpEx)? Keep it a brief aside. ${CAPEX_OPEX_NOTE}`,
    })
  }

  const { locations, locationParts } = buildSourceLocation({
    sheetName,
    excelRow,
    excelCol,
    page,
  })
  // Cost/margin → highlight price; naming/identity → highlight SKU (never both by default)
  const terms = highlightTerms?.length
    ? highlightTerms
    : isMarginIssue
      ? priceSearchTerms(math?.sell)
      : [sku].filter(Boolean)

  return {
    type,
    severity,
    message,
    sku,
    page,
    line,
    excelRow,
    excelCol,
    sheetName,
    locations,
    locationParts,
    excelHints,
    excelSource,
    discountContext,
    highlightTerms: terms,
    math,
    showMarginTable,
    actions,
  }
}

function locFromRow(row, colKey = 'sku') {
  return {
    sheetName: row.sheetName ?? null,
    excelRow: row.excelRow ?? null,
    excelCol: row.excelCols?.[colKey] ?? row.excelCols?.sku ?? null,
    page: row.page ?? null,
  }
}

function excelItemForSku(excelData, sku) {
  const key = normalizeSku(sku)
  return (excelData.lineItems || []).find((r) => normalizeSku(r.sku) === key) || null
}

function excelEnrichment(excelData, sku) {
  const item = excelItemForSku(excelData, sku)
  if (!item) return { excelSource: null, excelHints: [] }
  const allItems = excelData.lineItems || []
  const peerDiscounts = allItems
    .filter((r) => normalizeSku(r.sku) !== normalizeSku(item.sku))
    .map((r) => toNumber(r.discountPercent))
    .filter((d) => d != null)
  return {
    excelSource: {
      sheetName: item.sheetName ?? excelData.sheetName ?? null,
      excelRow: item.excelRow ?? null,
      excelCols: item.excelCols ?? null,
      line: item.line ?? null,
      sku: item.sku,
      qty: item.qty,
      resellerUnitCost: item.resellerUnitCost,
      resellerExtCost: item.resellerExtCost,
      discountPercent: item.discountPercent,
      serialNumber: item.serialNumber,
      coverageStart: item.coverageStart,
      coverageEnd: item.coverageEnd,
      description: item.description,
    },
    excelHints: inspectExcelLine(item, allItems),
    discountContext:
      item.discountPercent != null
        ? {
            thisDiscountPercent: roundPct(item.discountPercent),
            peerMeanPercent: roundPct(mean(peerDiscounts)),
            peerMinPercent: peerDiscounts.length
              ? roundPct(Math.min(...peerDiscounts))
              : null,
            peerMaxPercent: peerDiscounts.length
              ? roundPct(Math.max(...peerDiscounts))
              : null,
            peerCount: peerDiscounts.length,
          }
        : null,
  }
}

function priceSearchTerms(value) {
  const n = toNumber(value)
  if (n == null) return []
  const plain = n.toFixed(2)
  const withComma = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return [plain, withComma, `$${withComma}`, `$${plain}`]
}

function dateSearchTerms(iso) {
  if (!iso) return []
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return [String(iso)]
  const [, y, mo, d] = m
  return [
    `${y}-${mo}-${d}`,
    `${mo}/${d}/${y}`,
    `${Number(mo)}/${Number(d)}/${y}`,
    `${mo}-${d}-${y}`,
    `${d}-${mo}-${y}`,
  ]
}

/**
 * Pre-flight audit: excelData + pdfData → ranked errors + verdict + compared lines.
 */
export function auditQuote(excelData, pdfData, { asOfDate = todayYmd() } = {}) {
  const errors = []
  const analysis = buildComparedLines(excelData, pdfData)
  const { lines, meanMargin } = analysis

  // --- CRITICAL ---
  for (const row of lines) {
    if (row.inExcel && row.inPdf && row.unitPrice != null && row.resellerUnitCost != null) {
      if (row.unitPrice <= row.resellerUnitCost || (row.margin != null && row.margin <= 0)) {
        const loc = locFromRow(row, 'resellerUnitCost')
        const marginText =
          row.margin != null && row.margin < 0
            ? `${row.marginRounded ?? roundPct(row.margin)}%`
            : '0%'
        errors.push(
          makeError({
            type: 'ZERO_OR_NEGATIVE_MARGIN',
            severity: 'CRITICAL',
            sku: row.sku,
            line: row.line,
            ...loc,
            ...excelEnrichment(excelData, row.sku),
            showMarginTable: true,
            highlightTerms: priceSearchTerms(row.unitPrice),
            math: {
              cost: row.resellerUnitCost,
              sell: row.unitPrice,
              marginPercent: row.marginRounded ?? 0,
              meanMarginPercent: roundPct(meanMargin),
            },
            message: `${skuLabel(row.sku)} sells for ${formatMoney(row.unitPrice)} but reseller cost is ${formatMoney(row.resellerUnitCost)}, so margin is ${marginText}. That usually means a critical pricing error on the ${CUSTOMER_QUOTE}; double-check the SNAP sell price against the Excel cost. ${CAPEX_OPEX_NOTE}`,
          }),
        )
      }
    }

    if (row.inExcel && !row.inPdf) {
      const loc = { ...locFromRow(row, 'sku'), page: null }
      errors.push(
        makeError({
          type: 'MISSING_SKU',
          severity: 'CRITICAL',
          sku: row.sku,
          line: row.line,
          ...loc,
          ...excelEnrichment(excelData, row.sku),
          highlightTerms: [row.sku],
          message: `${skuLabel(row.sku)} is on the ${DISTRIBUTOR_QUOTE} but missing from the ${CUSTOMER_QUOTE}.`,
        }),
      )
    }

    if (row.inPdf && !row.inExcel) {
      const loc = { page: row.page ?? 1 }
      errors.push(
        makeError({
          type: 'GHOST_SKU',
          severity: 'CRITICAL',
          sku: row.sku,
          ...loc,
          highlightTerms: [row.sku],
          message: `${skuLabel(row.sku)} shows up on the ${CUSTOMER_QUOTE} but is not in the ${DISTRIBUTOR_QUOTE}.`,
        }),
      )
    }

    if (
      row.inExcel &&
      row.inPdf &&
      row.excelQty != null &&
      row.pdfQty != null &&
      row.excelQty !== row.pdfQty
    ) {
      const loc = locFromRow(row, 'qty')
      errors.push(
        makeError({
          type: 'QTY_MISMATCH',
          severity: 'CRITICAL',
          sku: row.sku,
          line: row.line,
          ...loc,
          ...excelEnrichment(excelData, row.sku),
          highlightTerms: [row.sku],
          message: `Quantity for ${skuLabel(row.sku)} does not match: ${DISTRIBUTOR_QUOTE} has ${row.excelQty}, ${CUSTOMER_QUOTE} has ${row.pdfQty}.`,
        }),
      )
    }
  }

  // Extension checks on PDF lines
  for (const group of pdfData.groups || []) {
    let lineExtSum = 0
    for (const item of group.lineItems || []) {
      const valid = isValidExtension(item.unitPrice, item.qty, item.extendedPrice)
      const ext = toNumber(item.extendedPrice)
      if (ext != null) lineExtSum += ext
      if (valid === false) {
        errors.push(
          makeError({
            type: 'EXTENSION_MATH_ERROR',
            severity: 'CRITICAL',
            sku: item.sku,
            page: item.page ?? group.page ?? 1,
            highlightTerms: [
              ...priceSearchTerms(item.unitPrice),
              ...priceSearchTerms(item.extendedPrice),
            ],
            message: `Line extension math error for ${skuLabel(item.sku)}: unit ${formatMoney(item.unitPrice)} × qty ${item.qty} ≠ extended ${formatMoney(item.extendedPrice)}.`,
          }),
        )
      }
    }

    const groupTotal = toNumber(group.groupTotal)
    if (groupTotal != null && Math.abs(lineExtSum - groupTotal) >= 0.01) {
      errors.push(
        makeError({
          type: 'GROUP_TOTAL_MISMATCH',
          severity: 'CRITICAL',
          page: group.page ?? 1,
          highlightTerms: [
            group.groupTitle,
            ...priceSearchTerms(groupTotal),
          ].filter(Boolean),
          message: `Group "${group.groupTitle || 'Untitled'}" total ${formatMoney(groupTotal)} does not equal sum of line extensions ${formatMoney(roundMoney(lineExtSum))}.`,
        }),
      )
    }

    // Billing schedule balance
    if (group.billingSchedule?.length && groupTotal != null) {
      const balanced = isScheduleBalanced(group.billingSchedule, groupTotal, 0.01)
      const sum = roundMoney(
        group.billingSchedule.reduce((a, p) => a + (toNumber(p.amount) || 0), 0),
      )
      const delta = sum != null ? Math.abs(sum - groupTotal) : null
      if (balanced === false && delta != null) {
        if (delta > 0.05) {
          errors.push(
            makeError({
              type: 'SCHEDULE_UNBALANCED',
              severity: 'CRITICAL',
              page: group.page ?? 1,
              message: `Annual payment schedule for "${group.groupTitle || 'section'}" (${formatMoney(sum)}) does not balance to section total ${formatMoney(groupTotal)}.`,
            }),
          )
        } else {
          errors.push(
            makeError({
              type: 'PENNY_SCHEDULE_UNBALANCE',
              severity: 'NOTICE',
              page: group.page ?? 1,
              message: `Penny-rounding schedule unbalance (Δ ${formatMoney(delta)}) on "${group.groupTitle || 'section'}" (likely a final-year adjustment).`,
            }),
          )
        }
      }
    }
  }

  const groupTotalSum = roundMoney(
    (pdfData.groups || []).reduce((a, g) => a + (toNumber(g.groupTotal) || 0), 0),
  )
  const grand = toNumber(pdfData.grandTotal)
  if (grand != null && groupTotalSum != null && Math.abs(groupTotalSum - grand) >= 0.01) {
    errors.push(
      makeError({
        type: 'GRAND_TOTAL_MISMATCH',
        severity: 'CRITICAL',
        page: 1,
        message: `Sum of group totals ${formatMoney(groupTotalSum)} ≠ grand total ${formatMoney(grand)}.`,
      }),
    )
  }

  const expiration = excelData.contractDates?.expiration
  if (expiration && asOfDate > expiration) {
    errors.push(
      makeError({
        type: 'EXPIRED_SUPPLIER_QUOTE',
        severity: 'NOTICE',
        page: 1,
        message: `${DISTRIBUTOR_QUOTE} expiration ${expiration} is before today (${asOfDate}). Fine for testing with older files; confirm before a live send.`,
      }),
    )
  }

  // --- Margin policy: floor / ceiling / target band (0% already CRITICAL above) ---
  // Target 8–12%; WARNING <5% or >20%; NOTICE 5–7.9% or 12.1–20%
  for (const row of lines) {
    if (!(row.inExcel && row.inPdf) || row.margin == null) continue
    if (row.margin <= 0) continue // already CRITICAL

    const marginLabel = `${row.marginRounded ?? roundPct(row.margin)}%`
    const meanLabel = roundPct(meanMargin)
    const loc = locFromRow(row, 'resellerUnitCost')
    const enrich = excelEnrichment(excelData, row.sku)
    const highlights = priceSearchTerms(row.unitPrice)
    const math = {
      cost: row.resellerUnitCost,
      sell: row.unitPrice,
      marginPercent: row.marginRounded,
      meanMarginPercent: meanLabel,
      targetMinPercent: MARGIN_POLICY.TARGET_MIN,
      targetMaxPercent: MARGIN_POLICY.TARGET_MAX,
      floorPercent: MARGIN_POLICY.FLOOR,
      ceilingPercent: MARGIN_POLICY.CEILING,
    }

    if (row.margin < MARGIN_POLICY.FLOOR) {
      errors.push(
        makeError({
          type: 'MARGIN_BELOW_FLOOR',
          severity: 'WARNING',
          sku: row.sku,
          line: row.line,
          ...loc,
          ...enrich,
          showMarginTable: true,
          highlightTerms: highlights,
          math,
          message: `${skuLabel(row.sku)} has a ${marginLabel} margin, under the ${MARGIN_POLICY.FLOOR}% hard floor (target band is ${MARGIN_POLICY.TARGET_MIN}–${MARGIN_POLICY.TARGET_MAX}%). ${CAPEX_OPEX_NOTE}`,
        }),
      )
    } else if (row.margin > MARGIN_POLICY.CEILING) {
      errors.push(
        makeError({
          type: 'MARGIN_ABOVE_CEILING',
          severity: 'WARNING',
          sku: row.sku,
          line: row.line,
          ...loc,
          ...enrich,
          showMarginTable: true,
          highlightTerms: highlights,
          math,
          message: `${skuLabel(row.sku)} has a ${marginLabel} margin, above the ${MARGIN_POLICY.CEILING}% hard ceiling (target band is ${MARGIN_POLICY.TARGET_MIN}–${MARGIN_POLICY.TARGET_MAX}%). High margins can risk gouging or losing the bid.`,
        }),
      )
    } else if (
      row.margin < MARGIN_POLICY.TARGET_MIN ||
      row.margin > MARGIN_POLICY.TARGET_MAX
    ) {
      const side =
        row.margin < MARGIN_POLICY.TARGET_MIN ? 'below' : 'above'
      errors.push(
        makeError({
          type: 'MARGIN_TARGET_BAND',
          severity: 'NOTICE',
          sku: row.sku,
          line: row.line,
          ...loc,
          ...enrich,
          showMarginTable: true,
          highlightTerms: highlights,
          math,
          message: `${skuLabel(row.sku)} has a ${marginLabel} margin, ${side} the usual ${MARGIN_POLICY.TARGET_MIN}–${MARGIN_POLICY.TARGET_MAX}% target band (still inside the ${MARGIN_POLICY.FLOOR}–${MARGIN_POLICY.CEILING}% hard limits).`,
        }),
      )
    }
  }

  // Project header coterm vs coverage end dates
  const headerCoterm = pdfData.projectHeader?.cotermDate
  const coverageEnds = [
    ...new Set(
      (pdfData.groups || [])
        .map((g) => g.coverageDates?.end)
        .filter(Boolean),
    ),
  ]
  if (headerCoterm && coverageEnds.length && !coverageEnds.includes(headerCoterm)) {
    errors.push(
      makeError({
        type: 'PROJECT_HEADER_DATE_MISMATCH',
        severity: 'WARNING',
        page: 1,
        highlightTerms: [
          ...dateSearchTerms(headerCoterm),
          ...coverageEnds.flatMap(dateSearchTerms),
        ],
        message: `Project header coterm date ${headerCoterm} does not match coverage end date(s) ${coverageEnds.join(', ')} on the ${CUSTOMER_QUOTE}.`,
      }),
    )
  }

  // Also filename / excel contract end vs header (extra signal)
  const excelEnd = excelData.contractDates?.end
  if (headerCoterm && excelEnd && headerCoterm !== excelEnd) {
    const already = errors.some((e) => e.type === 'PROJECT_HEADER_DATE_MISMATCH')
    if (!already) {
      errors.push(
        makeError({
          type: 'PROJECT_HEADER_DATE_MISMATCH',
          severity: 'WARNING',
          page: 1,
          sheetName: excelData.sheetName ?? null,
          highlightTerms: dateSearchTerms(headerCoterm),
          message: `${CUSTOMER_QUOTE} project header coterm ${headerCoterm} does not match the ${DISTRIBUTOR_QUOTE} contract end ${excelEnd} on the "${excelData.sheetName || 'workbook'}" sheet.`,
        }),
      )
    }
  }

  // Unassigned serials on RS-HW-
  for (const row of lines) {
    if (!row.inExcel || !row.sku.startsWith('RS-HW-')) continue
    if (row.excelSerial && row.inPdf && !row.pdfSerial) {
      const loc = locFromRow(row, 'serialNumber')
      errors.push(
        makeError({
          type: 'UNASSIGNED_SERIAL',
          severity: 'WARNING',
          sku: row.sku,
          line: row.line,
          ...loc,
          ...excelEnrichment(excelData, row.sku),
          highlightTerms: [row.sku],
          message: `${skuLabel(row.sku)} has serial ${row.excelSerial} in the ${DISTRIBUTOR_QUOTE}, but that serial is not assigned on the ${CUSTOMER_QUOTE}.`,
        }),
      )
    }
  }

  // Pass-through fees in notes
  const notes = String(excelData.notes || '')
  const feeMatch = notes.match(/\$\s*(\d+(?:\.\d{2})?)\s*per\s+appliance/i)
  if (feeMatch) {
    const fee = toNumber(feeMatch[1])
    const pdfBlob = JSON.stringify(pdfData)
    if (fee != null && !pdfBlob.includes(String(fee)) && !/\$200\b/.test(pdfBlob)) {
      errors.push(
        makeError({
          type: 'UNCAPTURED_PASSTHROUGH_FEE',
          severity: 'WARNING',
          page: 1,
          sheetName: excelData.sheetName ?? null,
          message: `${DISTRIBUTOR_QUOTE} Notes call for about $${fee} shipping per appliance, and that does not show up on the ${CUSTOMER_QUOTE}.`,
        }),
      )
    }
  }

  // NOTICE: formatting cleanup
  for (const row of excelData.lineItems || []) {
    if (row.serialNumber && /\n|\s{2,}/.test(String(row.serialNumber))) {
      const loc = {
        sheetName: row.sheetName ?? excelData.sheetName ?? null,
        excelRow: row.excelRow ?? null,
        excelCol: row.excelCols?.serialNumber ?? null,
        page: null,
      }
      errors.push(
        makeError({
          type: 'FORMATTING_CLEANUP',
          severity: 'NOTICE',
          sku: row.sku,
          line: row.line,
          ...loc,
          ...excelEnrichment(excelData, row.sku),
          message: `Serial for ${skuLabel(row.sku)} has messy spacing in the ${DISTRIBUTOR_QUOTE} ("${String(row.serialNumber).replace(/\s+/g, ' ').trim()}").`,
        }),
      )
    }
  }

  errors.sort((a, b) => {
    const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sr !== 0) return sr
    return String(a.sku || '').localeCompare(String(b.sku || ''))
  })

  const ranked = errors.map((e, i) => ({
    ...e,
    id: i + 1,
    hidden: false,
    message: e.message.startsWith(e.severity)
      ? e.message
      : `${e.severity}: ${e.message}`,
  }))

  const visible = ranked.filter((e) => !e.hidden)
  const criticalCount = visible.filter((e) => e.severity === 'CRITICAL').length
  const warningCount = visible.filter((e) => e.severity === 'WARNING').length

  let verdict = 'SAFE_TO_SEND'
  if (criticalCount > 0) verdict = 'UNSAFE_TO_SEND'
  else if (warningCount > 0) verdict = 'REQUIRES_APPROVAL'

  return {
    errors: ranked,
    verdict,
    analysis: {
      lines: analysis.lines,
      meanMargin: analysis.meanMargin,
      stdDevMargin: analysis.stdDevMargin,
      meanMarginRounded: analysis.meanMarginRounded,
      stdDevMarginRounded: analysis.stdDevMarginRounded,
    },
    summaryCounts: {
      critical: criticalCount,
      warning: warningCount,
      notice: visible.filter((e) => e.severity === 'NOTICE').length,
      total: visible.length,
    },
  }
}

/** Interactive target-margin correction for a line */
export function buildTargetMarginCorrection(line, targetMarginPercent) {
  const cost = toNumber(line.resellerUnitCost ?? line.cost)
  const qty = toNumber(line.qty) ?? 1
  const currentSell = toNumber(line.unitPrice ?? line.sell)
  const correctedUnit = correctedSellPrice(cost, targetMarginPercent)
  const correctedExt = correctedUnit != null ? roundMoney(correctedUnit * qty) : null
  const recovered =
    correctedUnit != null && currentSell != null
      ? roundMoney((correctedUnit - currentSell) * qty)
      : null

  return {
    targetMarginPercent: toNumber(targetMarginPercent),
    resellerUnitCost: cost,
    currentUnitPrice: currentSell,
    correctedUnitPrice: correctedUnit,
    correctedExtendedPrice: correctedExt,
    recoveredGrossProfit: recovered,
    qty,
  }
}

export function computeVerdict(errors) {
  const active = (errors || []).filter((e) => !e.hidden)
  if (active.some((e) => e.severity === 'CRITICAL')) return 'UNSAFE_TO_SEND'
  if (active.some((e) => e.severity === 'WARNING')) return 'REQUIRES_APPROVAL'
  return 'SAFE_TO_SEND'
}
