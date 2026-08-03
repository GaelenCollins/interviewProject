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

/** Integer cents — use for exact money equality (catches 1¢ errors). */
export function toCents(value) {
  const n = toNumber(value)
  if (n == null) return null
  return Math.round(n * 100)
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

/** Exact to the cent by default — a 1¢ miss is invalid. */
export function isValidExtension(unitPrice, quantity, extendedPrice, tolCents = 0) {
  const u = toNumber(unitPrice)
  const q = toNumber(quantity)
  const eCents = toCents(extendedPrice)
  if (u == null || q == null || eCents == null) return null
  const expectedCents = Math.round(u * q * 100)
  return Math.abs(expectedCents - eCents) <= tolCents
}

/** Exact to the cent by default — schedule sum must match section total. */
export function isScheduleBalanced(annualPayments, sectionTotal, tolCents = 0) {
  const totalCents = toCents(sectionTotal)
  if (totalCents == null) return null
  let sumCents = 0
  let sawAmount = false
  for (const p of annualPayments || []) {
    const c = toCents(typeof p === 'number' ? p : p?.amount)
    if (c == null) continue
    sawAmount = true
    sumCents += c
  }
  if (!sawAmount) return null
  return Math.abs(sumCents - totalCents) <= tolCents
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
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim()
    .toUpperCase()
}

function normalizeSerialKey(serial) {
  if (serial == null || serial === '') return ''
  return String(serial)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim()
    .toUpperCase()
}

/** Drop promotional placeholders: qty 0 and cost/price 0. */
function filterAuditLines(excelItems, pdfLines) {
  const excel = (excelItems || []).filter((r) => {
    const qty = toNumber(r.qty) ?? 0
    const cost = toNumber(r.resellerUnitCost) ?? 0
    return !(qty === 0 && cost === 0)
  })
  const pdf = (pdfLines || []).filter((r) => {
    const qty = toNumber(r.qty) ?? 0
    const price = toNumber(r.unitPrice) ?? 0
    return !(qty === 0 && price === 0)
  })
  return { excel, pdf }
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

function pairToComparedRow(excelRow, pdfRow, excelData) {
  const sku = normalizeSku(pdfRow?.sku || excelRow?.sku)
  const cost =
    toNumber(excelRow?.resellerUnitCost) ??
    toNumber(excelRow?.resellerPrice) ??
    toNumber(excelRow?.cost)
  const sell = toNumber(pdfRow?.unitPrice) ?? toNumber(pdfRow?.sell)
  const excelQty = excelRow != null ? toNumber(excelRow.qty) : null
  const pdfQty = pdfRow != null ? toNumber(pdfRow.qty) : null
  const margin = grossMarginPercent(sell, cost)
  const markup = grossMarkupPercent(sell, cost)

  return {
    sku,
    description: pdfRow?.description || excelRow?.description || '',
    excelQty,
    pdfQty,
    qty: pdfQty ?? excelQty,
    resellerUnitCost: cost,
    unitPrice: sell,
    extendedPrice:
      toNumber(pdfRow?.extendedPrice) ??
      (sell != null && pdfQty != null ? roundMoney(sell * pdfQty) : null),
    margin,
    markup,
    marginRounded: roundPct(margin),
    markupRounded: roundPct(markup),
    page: pdfRow?.page ?? null,
    line: excelRow?.line ?? null,
    sheetName: excelRow?.sheetName ?? excelData.sheetName ?? null,
    excelRow: excelRow?.excelRow ?? null,
    excelCols: excelRow?.excelCols ?? null,
    excelSerial: excelRow?.serialNumber ?? null,
    pdfSerial: pdfRow?.serialNumber ?? null,
    matchKey:
      sku && (normalizeSerialKey(excelRow?.serialNumber || pdfRow?.serialNumber) || null)
        ? `${sku}::${normalizeSerialKey(excelRow?.serialNumber || pdfRow?.serialNumber)}`
        : sku,
    coverageEnd: pdfRow?.coverageEnd || excelRow?.coverageEnd || null,
    inExcel: Boolean(excelRow),
    inPdf: Boolean(pdfRow),
  }
}

/**
 * Match Excel↔PDF by SKU + serial/group when possible, else sequence within SKU.
 * Zero qty+cost placeholders are excluded before matching.
 */
function buildComparedLines(excelData, pdfData) {
  const { excel: excelItems, pdf: pdfLines } = filterAuditLines(
    excelData.lineItems,
    flattenPdfLines(pdfData),
  )

  const excelUsed = new Set()
  const pdfUsed = new Set()
  const pairs = []

  // Pass 1: compound key SKU + serial
  for (let pi = 0; pi < pdfLines.length; pi++) {
    const p = pdfLines[pi]
    const pSku = normalizeSku(p.sku)
    const pSerial = normalizeSerialKey(p.serialNumber)
    if (!pSku || !pSerial) continue
    for (let ei = 0; ei < excelItems.length; ei++) {
      if (excelUsed.has(ei)) continue
      const e = excelItems[ei]
      if (normalizeSku(e.sku) !== pSku) continue
      if (normalizeSerialKey(e.serialNumber) !== pSerial) continue
      excelUsed.add(ei)
      pdfUsed.add(pi)
      pairs.push({ excel: e, pdf: p })
      break
    }
  }

  // Pass 2: remaining rows with same SKU, paired in sequence order
  const excelBySku = new Map()
  const pdfBySku = new Map()
  for (let ei = 0; ei < excelItems.length; ei++) {
    if (excelUsed.has(ei)) continue
    const sku = normalizeSku(excelItems[ei].sku)
    if (!sku) continue
    if (!excelBySku.has(sku)) excelBySku.set(sku, [])
    excelBySku.get(sku).push(ei)
  }
  for (let pi = 0; pi < pdfLines.length; pi++) {
    if (pdfUsed.has(pi)) continue
    const sku = normalizeSku(pdfLines[pi].sku)
    if (!sku) continue
    if (!pdfBySku.has(sku)) pdfBySku.set(sku, [])
    pdfBySku.get(sku).push(pi)
  }

  const skus = new Set([...excelBySku.keys(), ...pdfBySku.keys()])
  for (const sku of skus) {
    const eIdxs = excelBySku.get(sku) || []
    const pIdxs = pdfBySku.get(sku) || []
    const n = Math.max(eIdxs.length, pIdxs.length)
    for (let i = 0; i < n; i++) {
      const ei = eIdxs[i]
      const pi = pIdxs[i]
      if (ei != null) excelUsed.add(ei)
      if (pi != null) pdfUsed.add(pi)
      pairs.push({
        excel: ei != null ? excelItems[ei] : null,
        pdf: pi != null ? pdfLines[pi] : null,
      })
    }
  }

  const compared = pairs.map(({ excel, pdf }) =>
    pairToComparedRow(excel, pdf, excelData),
  )

  const excelSkuSet = new Set(
    excelItems.map((r) => normalizeSku(r.sku)).filter(Boolean),
  )
  const pdfSkuSet = new Set(
    pdfLines.map((r) => normalizeSku(r.sku)).filter(Boolean),
  )
  let matchedSkuCount = 0
  for (const s of pdfSkuSet) {
    if (excelSkuSet.has(s)) matchedSkuCount += 1
  }
  const skuOverlapPercent =
    pdfSkuSet.size > 0
      ? Math.round((matchedSkuCount / pdfSkuSet.size) * 10000) / 100
      : null

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
        isOutlier: z != null && z > 2,
        isExtremeOutlier: z != null && z > 3,
      }
    }),
    meanMargin: μ,
    stdDevMargin: σ,
    meanMarginRounded: roundPct(μ),
    stdDevMarginRounded: roundPct(σ),
    skuOverlapPercent,
    matchedSkuCount,
    pdfSkuCount: pdfSkuSet.size,
    excelSkuCount: excelSkuSet.size,
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
  showScheduleTable = false,
  scheduleComparison = null,
  omittedTerms = null,
  detailLines = null,
  pdfPages = null,
  highlightPairs = null,
  excelHints = [],
  excelSource = null,
  discountContext = null,
  highlightTerms = null,
}) {
  const isMarginIssue =
    showMarginTable || /MARGIN|ZERO|NEGATIVE|FLOOR|CEILING|OUTLIER|TARGET_BAND/i.test(type)
  const isZeroMargin = /ZERO_OR_NEGATIVE_MARGIN/i.test(type)
  const isReducedMarginFloor = /MARGIN_BELOW_FLOOR/i.test(type)
  const isScheduleIssue = /PAYMENT_SCHEDULE|CASH.?FLOW|SCHEDULE_MISMATCH/i.test(type)

  // Natural short questions — always name this finding so chat stays scoped.
  const issueFocus = [
    type,
    sku ? skuLabel(sku) : null,
    page != null ? `PDF page ${page}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const actions = [
    {
      label: 'What caused this?',
      kind: 'cause',
      query: `What caused this specific finding (${issueFocus})? Stay on this issue only.`,
    },
  ]
  if (!isMarginIssue) {
    actions.push({
      label: 'What needs to change?',
      kind: 'fix',
      query: isScheduleIssue
        ? `For this specific finding (${issueFocus}), what might need to change? Use math.scheduleFixOptions: prefer any simple period swap that clears the deficit (no recalculation), then show the percent-match rebuild (distributor % × customer total) with dollar amounts per period. Stay concrete; stay on this issue only.`
        : `For this specific finding (${issueFocus}), what might need to change? Stay on this issue only.`,
    })
  }
  if (isMarginIssue) {
    actions.unshift({
      label: 'See margin breakdown',
      kind: 'margins',
      query: `Walk me through the margin breakdown for this specific finding (${issueFocus}). Stay on this issue only.`,
    })
  }
  if (isZeroMargin || isReducedMarginFloor) {
    actions.push({
      label: 'Margin rebalancing?',
      kind: 'capex_opex',
      query: `For this specific finding (${issueFocus}), could the margin be intentional rebalancing for the customer? Stay on this issue only.`,
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
    highlightPairs: Array.isArray(highlightPairs) ? highlightPairs : null,
    math,
    showMarginTable,
    showScheduleTable:
      showScheduleTable ||
      Boolean(scheduleComparison?.length) ||
      /PAYMENT_SCHEDULE|CASH.?FLOW|SCHEDULE_MISMATCH/i.test(type),
    scheduleComparison,
    omittedTerms,
    detailLines,
    pdfPages: Array.isArray(pdfPages) ? pdfPages.filter((p) => p != null) : null,
    actions,
  }
}

/** Extra PDF search strings for period labels (Year 1 / Yr 1 / etc.). */
function periodHighlightTerms(periodLabel) {
  const label = String(periodLabel || '').trim()
  if (!label) return []
  const terms = [label]
  const num = label.match(/\d+/)?.[0]
  if (num) {
    terms.push(`Year ${num}`, `Yr ${num}`, `Yr. ${num}`, `Period ${num}`)
  }
  return terms
}

/**
 * Collect PDF highlight targets for problem schedule periods.
 * Returns label/amount pairs so equal dollar amounts on other years are not highlighted.
 */
function collectProblemYearPdfTargets(pdfData, focusPeriods = []) {
  const yearNums = new Set()
  const periodKeys = new Set()
  for (const p of focusPeriods) {
    const key = normalizePeriodKey(p.periodLabel)
    if (key) periodKeys.add(key)
    const num = String(p.periodLabel || '').match(/\d+/)?.[0]
    if (num) yearNums.add(num)
  }

  /** @type {Map<string, { yearNums: Set<string>, labels: Set<string>, amounts: Set<string> }>} */
  const pairByYear = new Map()
  const ensurePair = (yearNum) => {
    const key = String(yearNum || '')
    if (!pairByYear.has(key)) {
      pairByYear.set(key, {
        yearNums: new Set([key]),
        labels: new Set(),
        amounts: new Set(),
      })
    }
    return pairByYear.get(key)
  }

  const pages = new Set()

  for (const group of pdfData?.groups || []) {
    const schedulePage = group.schedulePage ?? null
    for (const entry of group.billingSchedule || []) {
      const amount = toNumber(
        typeof entry === 'number' ? entry : entry?.amount ?? entry?.billing,
      )
      const label =
        entry?.periodLabel ||
        entry?.label ||
        (entry?.year != null ? `Year ${entry.year}` : '')
      const yearNum = String(
        entry?.year ?? String(label).match(/\d+/)?.[0] ?? '',
      )
      const key = normalizePeriodKey(label)
      const isProblem =
        (yearNum && yearNums.has(yearNum)) ||
        (key && periodKeys.has(key))
      if (!isProblem || !yearNum) continue

      const pair = ensurePair(yearNum)
      for (const t of periodHighlightTerms(label)) pair.labels.add(t)
      pair.labels.add(`Payment ${yearNum}`)
      pair.labels.add(`Payment #${yearNum}`)
      pair.labels.add(`Year ${yearNum}`)
      if (amount != null) {
        for (const t of priceSearchTerms(amount)) pair.amounts.add(t)
      }
      const entryPage = entry?.page ?? schedulePage
      if (entryPage != null) pages.add(entryPage)
      else if (schedulePage != null) pages.add(schedulePage)
    }
  }

  // Contribution amounts are per-section Year N payments — pair under that year only
  for (const p of focusPeriods) {
    const num = String(p.periodLabel || '').match(/\d+/)?.[0]
    if (!num) continue
    const pair = ensurePair(num)
    for (const t of periodHighlightTerms(p.periodLabel)) pair.labels.add(t)
    pair.labels.add(`Payment ${num}`)
    pair.labels.add(`Year ${num}`)
    for (const c of p.contributions || []) {
      for (const t of priceSearchTerms(c.amount)) pair.amounts.add(t)
      if (c.page != null) pages.add(c.page)
    }
  }

  let pageList = [...pages].sort((a, b) => a - b)
  if (pageList.length > 1 && pageList[0] === 1) {
    const withoutOne = pageList.filter((p) => p !== 1)
    if (withoutOne.length) pageList = withoutOne
  }

  const pairs = [...pairByYear.values()].map((p) => ({
    yearNums: [...p.yearNums],
    labels: [...p.labels],
    amounts: [...p.amounts],
  }))

  // Labels only in flat terms — dollar amounts must go through highlightPairs
  // so equal Year-2 payments are never globally matched.
  const terms = [...new Set(pairs.flatMap((p) => p.labels))]

  return { terms, pairs, pages: pageList }
}

/** Normalize period labels for soft matching (Year 1 ≈ Yr 1 ≈ Period 1). */
export function normalizePeriodKey(label) {
  const s = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!s) return ''
  const year = s.match(/\b(?:year|yr|period|installment|payment|p)\s*(\d+)\b/)
  if (year) return `period:${year[1]}`
  const q = s.match(/\bq(?:uarter)?\s*([1-4])\b/)
  if (q) return `quarter:${q[1]}`
  const month = s.match(/\b(?:month|mo)\s*(\d+)\b/)
  if (month) return `month:${month[1]}`
  return s
}

/**
 * Parse free-text notes / sheet blobs into [{ periodLabel, cost }].
 * No fixed period count — whatever labels + amounts appear.
 */
export function extractDistributorScheduleFromText(text) {
  const raw = String(text || '')
  if (!raw.trim()) return []

  const found = []
  const seen = new Set()

  const push = (periodLabel, costRaw) => {
    const cost = toNumber(costRaw)
    if (cost == null || !Number.isFinite(cost)) return
    const label = String(periodLabel || '').trim()
    if (!label) return
    const key = `${normalizePeriodKey(label)}|${toCents(cost)}`
    if (seen.has(key)) return
    seen.add(key)
    found.push({ periodLabel: label, cost: roundMoney(cost) })
  }

  // Keep matches on the same line — do not let $Amount\nYear N cross-bind.
  const linePatterns = [
    {
      re: /((?:year|yr\.?|period|installment|payment)\s*#?\s*\d+)[ \t]*[:\-–—]?[ \t]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/gi,
      amountFirst: false,
    },
    {
      re: /((?:q(?:uarter)?\s*[1-4]|month\s*\d+|mo\.?\s*\d+))[ \t]*[:\-–—]?[ \t]*\$?[ \t]*([\d,]+(?:\.\d{1,2})?)/gi,
      amountFirst: false,
    },
    {
      re: /\$[ \t]*([\d,]+(?:\.\d{1,2})?)[ \t]*(?:due|payable|owed)?[ \t]*(?:in|for|on)?[ \t]*((?:year|yr\.?|period|installment|payment)\s*#?\s*\d+)/gi,
      amountFirst: true,
    },
  ]

  for (const line of raw.split(/\n+/)) {
    for (const { re, amountFirst } of linePatterns) {
      let m
      const copy = new RegExp(re.source, re.flags)
      while ((m = copy.exec(line)) !== null) {
        if (amountFirst) push(m[2], m[1])
        else push(m[1], m[2])
      }
    }
  }

  // One entry per normalized period key (first wins)
  const byKey = new Map()
  for (const row of found) {
    const key = normalizePeriodKey(row.periodLabel) || row.periodLabel
    if (!byKey.has(key)) byKey.set(key, row)
  }
  return [...byKey.values()]
}

/**
 * Flatten PDF group billing schedules into [{ periodLabel, billing, contributions }].
 * When multiple quote sections bill the same period, amounts are summed and
 * each section contribution is retained for the UI addition trail.
 */
export function extractCustomerSchedule(pdfData) {
  const byKey = new Map()
  let fallbackIndex = 0

  for (const group of pdfData?.groups || []) {
    const groupTitle = group.groupTitle || 'Untitled section'
    // Prefer the detail page that holds the Billing Schedule table, not the summary page.
    const schedulePage =
      group.schedulePage ??
      null
    for (const entry of group.billingSchedule || []) {
      const billing = toNumber(
        typeof entry === 'number' ? entry : entry?.amount ?? entry?.billing,
      )
      if (billing == null) continue
      fallbackIndex += 1
      const periodLabel =
        entry?.periodLabel ||
        entry?.label ||
        (entry?.year != null && Number.isFinite(Number(entry.year))
          ? `Year ${entry.year}`
          : `Period ${fallbackIndex}`)
      const key = normalizePeriodKey(periodLabel) || `idx:${fallbackIndex}`
      const contribution = {
        groupTitle,
        page: entry?.page ?? schedulePage ?? group.page ?? null,
        amount: roundMoney(billing),
        periodLabel,
      }
      const prev = byKey.get(key)
      if (prev) {
        prev.billing = roundMoney(prev.billing + billing)
        prev.contributions.push(contribution)
      } else {
        byKey.set(key, {
          periodLabel,
          billing: roundMoney(billing),
          contributions: [contribution],
        })
      }
    }
  }

  return [...byKey.values()]
}

function formatAdditionTrail(contributions = []) {
  if (!Array.isArray(contributions) || contributions.length < 2) return null
  const parts = contributions.map(
    (c) =>
      `${c.groupTitle || 'Section'}${c.page != null ? ` (p.${c.page})` : ''}: ${formatMoney(c.amount)}`,
  )
  const total = roundMoney(
    contributions.reduce((a, c) => a + (toNumber(c.amount) || 0), 0),
  )
  return `${parts.join(' + ')} = ${formatMoney(total)}`
}

/**
 * Dynamic period-by-period schedule comparison (length N = max of either side).
 * No hardcoded years, amounts, or period limits.
 */
export function comparePaymentSchedules(
  distributorSchedule = [],
  customerSchedule = [],
) {
  const dist = Array.isArray(distributorSchedule) ? distributorSchedule : []
  const cust = Array.isArray(customerSchedule) ? customerSchedule : []
  const n = Math.max(dist.length, cust.length)
  if (n === 0) {
    return {
      scheduleComparison: [],
      triggered: false,
      hasDeficit: false,
      periodCountMismatch: false,
    }
  }

  const scheduleComparison = Array.from({ length: n }, (_, index) => {
    const distCost = toNumber(dist[index]?.cost) || 0
    const custBilling = toNumber(cust[index]?.billing) || 0
    const netCashFlow = roundMoney(custBilling - distCost) ?? 0
    const periodLabel =
      dist[index]?.periodLabel ||
      cust[index]?.periodLabel ||
      `Period ${index + 1}`
    const contributions = cust[index]?.contributions || []
    const wasRolledUp = contributions.length > 1
    return {
      periodLabel,
      distributorCost: roundMoney(distCost) ?? 0,
      customerBilling: roundMoney(custBilling) ?? 0,
      netCashFlow,
      hasDeficit: netCashFlow < -0.05,
      contributions,
      wasRolledUp,
      additionDetail: formatAdditionTrail(contributions),
    }
  })

  const hasDeficit = scheduleComparison.some((p) => p.hasDeficit)
  const periodCountMismatch = dist.length > 0 && cust.length > 0 && dist.length !== cust.length
  const triggered = hasDeficit || periodCountMismatch

  return {
    scheduleComparison,
    triggered,
    hasDeficit,
    periodCountMismatch,
  }
}

/**
 * Concrete schedule fix ideas derived only from the current scheduleComparison.
 * Never hardcodes years, pages, groups, or dollar amounts — every quote is
 * scanned the same way:
 * - Roll-up period swaps (any i↔j) that clear/improve deficits
 * - Within-group period swaps (any group × any i↔j) that clear/improve deficits
 * - Percent-match rebuild + locked-group redistributions
 */
export function buildScheduleFixOptions(scheduleRows = []) {
  const rows = Array.isArray(scheduleRows) ? scheduleRows : []
  if (rows.length < 2) {
    return { swapOptions: [], percentMatch: null, perGroupEdits: [] }
  }

  const periods = rows.map((r, index) => ({
    index,
    periodLabel: r.periodLabel || `Period ${index + 1}`,
    distributorCost: toNumber(r.distributorCost) || 0,
    customerBilling: toNumber(r.customerBilling) || 0,
    distributorSharePercent: r.distributorSharePercent ?? null,
  }))

  const scoreBillings = (billings) => {
    let deficitCount = 0
    let deficitSum = 0
    const nets = billings.map((b, i) => {
      const net = roundMoney(b - periods[i].distributorCost) ?? 0
      if (net < -0.05) {
        deficitCount += 1
        deficitSum += net
      }
      return net
    })
    return { deficitCount, deficitSum, nets }
  }

  const baseline = periods.map((p) => p.customerBilling)
  const base = scoreBillings(baseline)
  const swapOptions = []

  const pushSwap = ({
    kind,
    summary,
    swap,
    trial,
    scored,
    clearsAll,
    groupTitle = null,
    page = null,
  }) => {
    swapOptions.push({
      kind,
      effort: 'low',
      summary,
      groupTitle,
      page,
      swap,
      resultingSchedule: periods.map((p, k) => ({
        periodLabel: p.periodLabel,
        distributorCost: roundMoney(p.distributorCost),
        customerBilling: roundMoney(trial[k]),
        netCashFlow: scored.nets[k],
        hasDeficit: scored.nets[k] < -0.05,
      })),
      clearsAllDeficits: clearsAll,
      remainingDeficitCount: scored.deficitCount,
    })
  }

  // A) Roll-up swaps: exchange two period totals across the whole quote
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      if (Math.abs(baseline[i] - baseline[j]) < 0.009) continue
      const trial = baseline.slice()
      const tmp = trial[i]
      trial[i] = trial[j]
      trial[j] = tmp
      const scored = scoreBillings(trial)
      const clearsAll = scored.deficitCount === 0
      const fewerDeficits = scored.deficitCount < base.deficitCount
      const betterCash =
        scored.deficitCount === base.deficitCount &&
        scored.deficitSum > base.deficitSum + 0.05
      if (!clearsAll && !fewerDeficits && !betterCash) continue

      pushSwap({
        kind: 'swap',
        summary: `Swap the customer billing amounts between ${periods[i].periodLabel} and ${periods[j].periodLabel} (same dollars, different periods — no recalculation).`,
        swap: {
          a: {
            periodLabel: periods[i].periodLabel,
            from: roundMoney(baseline[i]),
            to: roundMoney(trial[i]),
          },
          b: {
            periodLabel: periods[j].periodLabel,
            from: roundMoney(baseline[j]),
            to: roundMoney(trial[j]),
          },
        },
        trial,
        scored,
        clearsAll,
      })
    }
  }

  // B) Within-group period swaps: only one section's Billing Schedule changes.
  // Often clears a roll-up deficit when a full period-total swap would not.
  /** @type {Map<string, { groupTitle: string, page: number|null, amounts: number[] }>} */
  const groupsByKey = new Map()
  rows.forEach((row, periodIndex) => {
    for (const c of row.contributions || []) {
      const key = `${c.groupTitle || 'Section'}::${c.page ?? ''}`
      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, {
          groupTitle: c.groupTitle || 'Untitled section',
          page: c.page ?? null,
          amounts: rows.map(() => 0),
        })
      }
      const g = groupsByKey.get(key)
      g.amounts[periodIndex] = roundMoney(
        (g.amounts[periodIndex] || 0) + (toNumber(c.amount) || 0),
      )
    }
  })

  for (const g of groupsByKey.values()) {
    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const ai = toNumber(g.amounts[i]) || 0
        const aj = toNumber(g.amounts[j]) || 0
        if (Math.abs(ai - aj) < 0.009) continue
        const trial = baseline.slice()
        trial[i] = roundMoney(trial[i] - ai + aj)
        trial[j] = roundMoney(trial[j] - aj + ai)
        const scored = scoreBillings(trial)
        const clearsAll = scored.deficitCount === 0
        const fewerDeficits = scored.deficitCount < base.deficitCount
        const betterCash =
          scored.deficitCount === base.deficitCount &&
          scored.deficitSum > base.deficitSum + 0.05
        if (!clearsAll && !fewerDeficits && !betterCash) continue

        const pageBit = g.page != null ? ` (PDF p.${g.page})` : ''
        pushSwap({
          kind: 'group_swap',
          groupTitle: g.groupTitle,
          page: g.page,
          summary: `In ${g.groupTitle}${pageBit}, swap ${periods[i].periodLabel} and ${periods[j].periodLabel} on that group's Billing Schedule (group total unchanged).`,
          swap: {
            a: {
              periodLabel: periods[i].periodLabel,
              from: roundMoney(ai),
              to: roundMoney(aj),
            },
            b: {
              periodLabel: periods[j].periodLabel,
              from: roundMoney(aj),
              to: roundMoney(ai),
            },
          },
          trial,
          scored,
          clearsAll,
        })
      }
    }
  }

  swapOptions.sort((a, b) => {
    if (a.clearsAllDeficits !== b.clearsAllDeficits) {
      return a.clearsAllDeficits ? -1 : 1
    }
    // Prefer within-group swaps (smaller edit) when both clear
    if (a.kind !== b.kind) {
      if (a.kind === 'group_swap') return -1
      if (b.kind === 'group_swap') return 1
    }
    if (a.remainingDeficitCount !== b.remainingDeficitCount) {
      return a.remainingDeficitCount - b.remainingDeficitCount
    }
    return 0
  })

  // Prefer swaps that fully clear deficits; otherwise show improving swaps.
  const clearingSwaps = swapOptions.filter((s) => s.clearsAllDeficits)
  const chosenSwaps = (
    clearingSwaps.length ? clearingSwaps : swapOptions
  ).slice(0, 3)

  const totalCost = periods.reduce((a, p) => a + p.distributorCost, 0)
  const totalBilling = periods.reduce((a, p) => a + p.customerBilling, 0)
  let percentPeriods = periods.map((p) => {
    const share =
      totalCost > 0
        ? (p.distributorCost || 0) / totalCost
        : 0
    const suggested =
      totalBilling > 0 ? roundMoney(totalBilling * share) : null
    return {
      periodLabel: p.periodLabel,
      distributorSharePercent:
        p.distributorSharePercent ??
        (totalCost > 0 ? roundPct(share * 100, 1) : null),
      currentCustomerBilling: roundMoney(p.customerBilling),
      suggestedCustomerBilling: suggested,
    }
  })
  if (
    totalBilling > 0 &&
    percentPeriods.length &&
    percentPeriods.every((p) => p.suggestedCustomerBilling != null)
  ) {
    const head = percentPeriods
      .slice(0, -1)
      .reduce((a, p) => a + (p.suggestedCustomerBilling || 0), 0)
    percentPeriods[percentPeriods.length - 1].suggestedCustomerBilling =
      roundMoney(totalBilling - head)
  }

  const percentMatch =
    totalBilling > 0 && totalCost > 0
      ? {
          kind: 'percent_match',
          effort: 'medium',
          summary:
            "Rebuild the customer billing schedule using the distributor's percent-of-total by period, applied to the total sold to Dynamix's customer.",
          customerTotal: roundMoney(totalBilling),
          distributorTotal: roundMoney(totalCost),
          periods: percentPeriods,
          resultingNets: percentPeriods.map((p, i) => {
            const net =
              roundMoney(
                (p.suggestedCustomerBilling || 0) - periods[i].distributorCost,
              ) ?? 0
            return {
              periodLabel: p.periodLabel,
              netCashFlow: net,
              hasDeficit: net < -0.05,
            }
          }),
        }
      : null

  const perGroupEdits = buildPerGroupScheduleEdits(rows, percentMatch)

  return {
    swapOptions: chosenSwaps,
    percentMatch,
    perGroupEdits,
  }
}

/**
 * Locked-group % distribution for "Edit each group's Billing Schedule".
 *
 * NEVER: newPayment = oldPayment * (targetYearTotal / oldYearTotal)
 * that uses a different multiplier per year and changes the group sum.
 *
 * ALWAYS: newPayment[i] = lockedGroupTotal * (distributorCost[i] / totalDistributorCost)
 * with the last period taking the remainder so Σ newPayments === lockedGroupTotal.
 */
export function buildPerGroupScheduleEdits(scheduleRows = [], _percentMatch = null) {
  const rows = Array.isArray(scheduleRows) ? scheduleRows : []
  if (!rows.length) return []

  const totalDistributorCost = rows.reduce(
    (a, r) => a + (toNumber(r.distributorCost) || 0),
    0,
  )
  if (totalDistributorCost <= 0) return []

  // 1) Distributor period percentages (quote-specific)
  const periodRatios = rows.map((r) => {
    const cost = toNumber(r.distributorCost) || 0
    return cost / totalDistributorCost
  })

  const periodLabels = rows.map(
    (r, index) => r.periodLabel || `Period ${index + 1}`,
  )

  // Collect each group's current period payments + locked total
  /** @type {Map<string, { groupTitle: string, page: number|null, oldPayments: number[] }>} */
  const byGroup = new Map()

  rows.forEach((row, periodIndex) => {
    for (const c of row.contributions || []) {
      const key = `${c.groupTitle || 'Section'}::${c.page ?? ''}`
      if (!byGroup.has(key)) {
        byGroup.set(key, {
          groupTitle: c.groupTitle || 'Untitled section',
          page: c.page ?? null,
          oldPayments: rows.map(() => 0),
        })
      }
      const g = byGroup.get(key)
      g.oldPayments[periodIndex] = roundMoney(
        (g.oldPayments[periodIndex] || 0) + (toNumber(c.amount) || 0),
      )
    }
  })

  if (!byGroup.size) return []

  // 2) Rebalance WITHIN each group's locked total
  return [...byGroup.values()].map((group) => {
    const lockedTotal = roundMoney(
      group.oldPayments.reduce((a, n) => a + (toNumber(n) || 0), 0),
    )

    let runningSum = 0
    const newPayments = periodRatios.map((ratio, index) => {
      if (index === periodRatios.length - 1) {
        return roundMoney(lockedTotal - runningSum)
      }
      const val = roundMoney(lockedTotal * ratio)
      runningSum = roundMoney(runningSum + (val || 0))
      return val
    })

    const periods = periodLabels.map((periodLabel, index) => ({
      periodLabel,
      currentAmount: roundMoney(group.oldPayments[index] || 0),
      suggestedAmount: newPayments[index],
      distributorSharePercent: roundPct(periodRatios[index] * 100, 1),
    }))

    return {
      groupTitle: group.groupTitle,
      page: group.page,
      periods,
      lockedTotal,
      currentTotal: lockedTotal,
      suggestedTotal: lockedTotal,
      groupTotal: lockedTotal,
      oldPayments: group.oldPayments.map((n) => roundMoney(n)),
      newPayments,
    }
  })
}

/** Resolve fix options from error math or recompute from scheduleComparison. */
export function resolveScheduleFixOptions(error) {
  const rows = error?.scheduleComparison
  // Always recompute from rows so locked-group algorithm applies to old sessions
  if (Array.isArray(rows) && rows.length >= 2) {
    return buildScheduleFixOptions(rows)
  }
  const existing = error?.math?.scheduleFixOptions
  if (
    existing &&
    ((existing.swapOptions && existing.swapOptions.length) ||
      existing.percentMatch?.periods?.length)
  ) {
    return existing
  }
  return { swapOptions: [], percentMatch: null, perGroupEdits: [] }
}

/**
 * Deterministic user-facing recommendation for schedule cash-flow issues.
 * Returns null when no viable concrete option exists (caller may use LLM).
 */
export function buildScheduleFixAnswer(error) {
  const fixes = resolveScheduleFixOptions(error)
  const viableSwaps = fixes.swapOptions || []
  const clearingSwaps = viableSwaps.filter((s) => s.clearsAllDeficits)
  const swapsToShow = (clearingSwaps.length ? clearingSwaps : viableSwaps).slice(
    0,
    2,
  )
  const percent = fixes.percentMatch
  const percentClears =
    percent?.resultingNets?.length > 0 &&
    percent.resultingNets.every((n) => !n.hasDeficit)

  if (!swapsToShow.length && !percent?.periods?.length) return null

  const parts = []
  const deficitPeriods = error?.math?.deficitPeriods || []
  const deficitLabel =
    deficitPeriods.length > 0
      ? deficitPeriods.join(', ')
      : (error?.scheduleComparison || [])
          .filter((p) => p.hasDeficit)
          .map((p) => p.periodLabel)
          .join(', ') || 'an early period'

  parts.push(
    `The cash-flow gap is timing: ${deficitLabel} does not collect enough from the customer to cover what Dynamix owes the distributor in that period.`,
  )

  if (swapsToShow.length) {
    for (const s of swapsToShow) {
      const a = s.swap?.a
      const b = s.swap?.b
      const clears = s.clearsAllDeficits
        ? ' That clears every period deficit.'
        : ' That improves the cash-flow position.'
      if (s.kind === 'group_swap') {
        const pageBit = s.page != null ? ` (PDF p.${s.page})` : ''
        parts.push(
          `Easiest fix: in ${s.groupTitle || 'that quote group'}${pageBit}, swap ${a?.periodLabel} and ${b?.periodLabel} on the Billing Schedule — ${formatMoney(a?.from)} ↔ ${formatMoney(b?.from)}. The group total stays the same; no recalculation.${clears}`,
        )
      } else {
        parts.push(
          `Easiest fix: swap the customer billing amounts between ${a?.periodLabel} and ${b?.periodLabel} — put ${formatMoney(a?.to)} on ${a?.periodLabel} (currently ${formatMoney(a?.from)}) and ${formatMoney(b?.to)} on ${b?.periodLabel} (currently ${formatMoney(b?.from)}). No recalculation.${clears}`,
        )
      }
      if (s.resultingSchedule?.length && clears) {
        const after = s.resultingSchedule
          .map(
            (p) =>
              `${p.periodLabel}: customer ${formatMoney(p.customerBilling)} (net ${formatMoney(p.netCashFlow)})`,
          )
          .join('; ')
        parts.push(`After that swap: ${after}.`)
      }
    }
  }

  if (percent?.periods?.length) {
    const lead = clearingSwaps.length
      ? 'Cleaner model-aligned alternative'
      : 'Practical rebuild'
    const lines = percent.periods
      .map((p) => {
        const pct =
          p.distributorSharePercent != null
            ? `${p.distributorSharePercent}%`
            : null
        return pct
          ? `${p.periodLabel}: ${pct} of ${formatMoney(percent.customerTotal)} = ${formatMoney(p.suggestedCustomerBilling)} (currently ${formatMoney(p.currentCustomerBilling)})`
          : `${p.periodLabel}: ${formatMoney(p.suggestedCustomerBilling)} (currently ${formatMoney(p.currentCustomerBilling)})`
      })
      .join('; ')
    parts.push(
      `${lead}: take each distributor period's share of total cost and multiply by the customer sell total (${formatMoney(percent.customerTotal)}). Suggested customer schedule: ${lines}.${percentClears ? ' That pattern also keeps every period cash-positive.' : ''}`,
    )
  }

  const perGroup = fixes.perGroupEdits || []
  if (perGroup.length) {
    const groupLines = perGroup.map((g) => {
      const pageBit = g.page != null ? ` (PDF p.${g.page})` : ''
      const locked = g.groupTotal ?? g.currentTotal
      const schedule = (g.periods || [])
        .map(
          (p) =>
            `${p.periodLabel}: change ${formatMoney(p.currentAmount)} → ${formatMoney(p.suggestedAmount)}`,
        )
        .join('; ')
      return `${g.groupTitle}${pageBit}: open that section's Billing Schedule and set ${schedule}. Group total stays locked at ${formatMoney(locked)} (sum of the new period payments).`
    })
    parts.push(
      `How to change it inside each quote group (distributor % applied within each group's locked total):\n${groupLines.map((l) => `- ${l}`).join('\n')}`,
    )
  }

  parts.push(
    'Soft suggestion only — use whichever option fits the deal, and the Calculator in the header if you want to sanity-check the arithmetic.',
  )

  return parts.join('\n\n')
}

const NOTE_COMPLIANCE_KEYWORDS =
  /\b(payment|shipment|due|support|license|required|version|billing|net\s*\d+|coterm|renewal)\b/i

/** Pull distinctive tokens from a note line for PDF presence checks. */
function noteSignatures(line) {
  const text = String(line || '')
  const sigs = []
  const money = text.match(/\$\s*[\d,]+(?:\.\d{2})?/g)
  if (money) sigs.push(...money.map((m) => m.replace(/\s+/g, '')))
  const versions = text.match(/\b(?:v(?:ersion)?\s*)?\d+\.\d+(?:\.\d+)?\b/gi)
  if (versions) sigs.push(...versions)
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 5 &&
        !/^(notes?|please|shall|should|would|could|their|there|these|those|about|after|before|which|where|quote|excel|total)$/.test(
          w,
        ),
    )
  // Keep a short distinctive phrase of content words
  if (words.length >= 3) sigs.push(words.slice(0, 6).join(' '))
  return [...new Set(sigs.map((s) => String(s).toLowerCase().trim()).filter(Boolean))]
}

/**
 * Excel Notes → PDF pass-through: flag critical distributor terms omitted from the customer quote.
 * Returns detailed objects: { text, excelRow, keywords, missingSignatures }.
 */
export function findOmittedDistributorNotes(excelNotes, pdfCorpus, notesLines = null) {
  const corpus = String(pdfCorpus || '').toLowerCase()
  if (!corpus.trim()) return []

  const candidates = Array.isArray(notesLines) && notesLines.length
    ? notesLines
        .map((n) => ({
          text: String(n.text || n || '').trim(),
          excelRow: n.excelRow ?? null,
        }))
        .filter((n) => n.text.length >= 12 && NOTE_COMPLIANCE_KEYWORDS.test(n.text))
    : String(excelNotes || '')
        .split(/\n+/)
        .map((l, i) => ({ text: l.trim(), excelRow: i + 1 }))
        .filter((n) => n.text.length >= 12 && NOTE_COMPLIANCE_KEYWORDS.test(n.text))

  const omitted = []
  for (const line of candidates) {
    const sigs = noteSignatures(line.text)
    if (!sigs.length) continue
    // Fully absent from the customer quote corpus
    if (!sigs.some((sig) => corpus.includes(sig))) {
      const keywordHits = [...(line.text.match(new RegExp(NOTE_COMPLIANCE_KEYWORDS.source, 'gi')) || [])]
        .map((k) => String(k).toLowerCase())
      omitted.push({
        text: line.text,
        excelRow: line.excelRow,
        keywords: [...new Set(keywordHits)],
        missingSignatures: sigs,
      })
    }
  }
  return omitted
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

function emptyAnalysis(extra = {}) {
  return {
    lines: [],
    meanMargin: null,
    stdDevMargin: null,
    meanMarginRounded: null,
    stdDevMarginRounded: null,
    skuOverlapPercent: 0,
    matchedSkuCount: 0,
    pdfSkuCount: 0,
    excelSkuCount: 0,
    ...extra,
  }
}

/**
 * Pre-flight audit: excelData + pdfData → ranked errors + verdict + compared lines.
 */
export function auditQuote(
  excelData,
  pdfData,
  { asOfDate = todayYmd(), pdfText = '' } = {},
) {
  const errors = []
  const analysis = buildComparedLines(excelData, pdfData)
  const { lines, meanMargin, skuOverlapPercent, matchedSkuCount, pdfSkuCount } =
    analysis

  // Currency mismatch (do not compare customer vs distributor names)
  const excelCurrency = excelData?.currency || null
  const pdfCurrency = pdfData?.currency || null
  if (
    excelCurrency &&
    pdfCurrency &&
    String(excelCurrency).toUpperCase() !== String(pdfCurrency).toUpperCase()
  ) {
    errors.push(
      makeError({
        type: 'CURRENCY_MISMATCH',
        severity: 'WARNING',
        page: 1,
        message: `Currency Mismatch Detected: Distributor quote uses ${excelCurrency} while SNAP PDF uses ${pdfCurrency}. Exchange rate validation required.`,
      }),
    )
  }

  // Project mismatch: 0% of PDF SKUs appear in Excel — halt line audits
  if (pdfSkuCount > 0 && matchedSkuCount === 0) {
    errors.push(
      makeError({
        type: 'PROJECT_MISMATCH',
        severity: 'CRITICAL',
        page: 1,
        message:
          'Project Mismatch: These two files share 0 matching SKUs. They look unrelated — please verify you uploaded the correct distributor quote for this SNAP PDF.',
      }),
    )
    return finalizeAuditResult(errors, {
      ...emptyAnalysis({
        skuOverlapPercent: skuOverlapPercent ?? 0,
        matchedSkuCount,
        pdfSkuCount,
        excelSkuCount: analysis.excelSkuCount,
      }),
      halted: true,
      haltReason: 'PROJECT_MISMATCH',
    })
  }

  // --- Line / SKU issues ---
  for (const row of lines) {
    // All margin issues are WARNING (including 0% / negative).
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
            severity: 'WARNING',
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
            message: `${skuLabel(row.sku)} sells for ${formatMoney(row.unitPrice)} but reseller cost is ${formatMoney(row.resellerUnitCost)}, so margin is ${marginText}. That usually means a pricing slip on the ${CUSTOMER_QUOTE}; double-check the sell price against the Excel cost. ${CAPEX_OPEX_NOTE} Click for breakdown.`,
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
    const lineExtCents = toCents(lineExtSum)
    const groupTotalCents = toCents(groupTotal)
    if (
      groupTotalCents != null &&
      lineExtCents != null &&
      Math.abs(lineExtCents - groupTotalCents) >= 1
    ) {
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

    // Billing schedule must balance to the cent against group total (or line sum).
    if (group.billingSchedule?.length) {
      const balanceTarget =
        groupTotal != null ? groupTotal : roundMoney(lineExtSum)
      const balanced = isScheduleBalanced(group.billingSchedule, balanceTarget, 0)
      const sumCents = (group.billingSchedule || []).reduce((a, p) => {
        const c = toCents(typeof p === 'number' ? p : p?.amount)
        return a + (c ?? 0)
      }, 0)
      const targetCents = toCents(balanceTarget)
      const deltaCents =
        targetCents != null ? Math.abs(sumCents - targetCents) : null
      const sum = roundMoney(sumCents / 100)
      if (balanced === false && deltaCents != null && deltaCents >= 1) {
        const delta = roundMoney(deltaCents / 100)
        const highlight = [
          group.groupTitle,
          ...priceSearchTerms(sum),
          ...priceSearchTerms(balanceTarget),
        ].filter(Boolean)
        if (deltaCents <= 5) {
          errors.push(
            makeError({
              type: 'PENNY_SCHEDULE_UNBALANCE',
              severity: 'NOTICE',
              page: group.page ?? 1,
              highlightTerms: highlight,
              math: {
                scheduleSum: sum,
                sectionTotal: balanceTarget,
                deltaCents,
              },
              message: `Billing schedule for "${group.groupTitle || 'section'}" is off by ${formatMoney(delta)} (schedule ${formatMoney(sum)} vs section ${formatMoney(balanceTarget)}). Even a 1¢ miss should be cleaned up on the ${CUSTOMER_QUOTE} before the customer sees it.`,
            }),
          )
        } else {
          errors.push(
            makeError({
              type: 'SCHEDULE_UNBALANCED',
              severity: 'CRITICAL',
              page: group.page ?? 1,
              highlightTerms: highlight,
              math: {
                scheduleSum: sum,
                sectionTotal: balanceTarget,
                deltaCents,
              },
              message: `Annual payment schedule for "${group.groupTitle || 'section'}" (${formatMoney(sum)}) does not balance to section total ${formatMoney(balanceTarget)} (off by ${formatMoney(delta)}).`,
            }),
          )
        }
      }
    }
  }

  const groupTotalSumCents = (pdfData.groups || []).reduce((a, g) => {
    const c = toCents(g.groupTotal)
    return a + (c ?? 0)
  }, 0)
  const groupTotalSum = roundMoney(groupTotalSumCents / 100)
  const grand = toNumber(pdfData.grandTotal)
  const grandCents = toCents(grand)
  if (
    grandCents != null &&
    groupTotalSumCents > 0 &&
    Math.abs(groupTotalSumCents - grandCents) >= 1
  ) {
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

  // --- Margin policy: floor / ceiling / target band (0% / negative already WARNING above) ---
  // Target 8–12%; WARNING <5% or >20%; NOTICE 5–7.9% or 12.1–20%
  for (const row of lines) {
    if (!(row.inExcel && row.inPdf) || row.margin == null) continue
    if (row.margin <= 0) continue // already WARNING

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
          message: `${skuLabel(row.sku)} has a ${marginLabel} margin, under the ${MARGIN_POLICY.FLOOR}% hard floor (target band is ${MARGIN_POLICY.TARGET_MIN}–${MARGIN_POLICY.TARGET_MAX}%). ${CAPEX_OPEX_NOTE} Click for breakdown.`,
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
          message: `${skuLabel(row.sku)} has a ${marginLabel} margin, above the ${MARGIN_POLICY.CEILING}% hard ceiling (target band is ${MARGIN_POLICY.TARGET_MIN}–${MARGIN_POLICY.TARGET_MAX}%). High margins can risk gouging or losing the bid. Click for breakdown.`,
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
          message: `${skuLabel(row.sku)} has a ${marginLabel} margin, ${side} the usual ${MARGIN_POLICY.TARGET_MIN}–${MARGIN_POLICY.TARGET_MAX}% target band (still inside the ${MARGIN_POLICY.FLOOR}–${MARGIN_POLICY.CEILING}% hard limits). Click for breakdown.`,
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

  // --- Dynamic payment schedule / cash-flow audit (Excel ↔ PDF) ---
  const distributorSchedule =
    (Array.isArray(excelData.paymentSchedule) && excelData.paymentSchedule.length
      ? excelData.paymentSchedule
      : null) ||
    extractDistributorScheduleFromText(excelData.notes || '')
  const customerSchedule = extractCustomerSchedule(pdfData)
  if (distributorSchedule.length > 0 && customerSchedule.length > 0) {
    const comparison = comparePaymentSchedules(
      distributorSchedule,
      customerSchedule,
    )
    if (comparison.triggered) {
      const deficitPeriods = comparison.scheduleComparison.filter((p) => p.hasDeficit)
      const focusPeriods =
        deficitPeriods.length > 0
          ? deficitPeriods
          : comparison.scheduleComparison
      const deficitYears = deficitPeriods.map((p) => p.periodLabel)
      const rolledUp = comparison.scheduleComparison.filter((p) => p.wasRolledUp)
      const pdfTargets = collectProblemYearPdfTargets(pdfData, focusPeriods)
      const schedulePage =
        pdfTargets.pages[0] ??
        (pdfData.groups || []).find((g) => g.billingSchedule?.length)?.page ??
        1
      const totalCost = comparison.scheduleComparison.reduce(
        (a, p) => a + (p.distributorCost || 0),
        0,
      )
      const totalBilling = comparison.scheduleComparison.reduce(
        (a, p) => a + (p.customerBilling || 0),
        0,
      )
      // Attach share-of-total % + suggested customer billings (match distributor %)
      const scheduleComparisonWithShare = comparison.scheduleComparison.map(
        (p) => {
          const distributorSharePercent =
            totalCost > 0
              ? roundPct(((p.distributorCost || 0) / totalCost) * 100, 1)
              : null
          const suggestedCustomerBilling =
            totalCost > 0 && totalBilling > 0
              ? roundMoney(
                  totalBilling * ((p.distributorCost || 0) / totalCost),
                )
              : null
          return {
            ...p,
            distributorSharePercent,
            customerSharePercent:
              totalBilling > 0
                ? roundPct(((p.customerBilling || 0) / totalBilling) * 100, 1)
                : null,
            suggestedCustomerBilling,
            suggestedSharePercent: distributorSharePercent,
          }
        },
      )
      // Penny-fix last period so suggested amounts sum exactly to customer total
      if (
        totalBilling > 0 &&
        scheduleComparisonWithShare.length > 0 &&
        scheduleComparisonWithShare.every(
          (p) => p.suggestedCustomerBilling != null,
        )
      ) {
        const headSum = scheduleComparisonWithShare
          .slice(0, -1)
          .reduce((a, p) => a + (p.suggestedCustomerBilling || 0), 0)
        const last = scheduleComparisonWithShare[scheduleComparisonWithShare.length - 1]
        last.suggestedCustomerBilling = roundMoney(totalBilling - headSum)
      }
      const scheduleFixOptions = buildScheduleFixOptions(
        scheduleComparisonWithShare,
      )
      const scheduleAlignmentSuggestion = scheduleFixOptions.percentMatch
        ? {
            approach: scheduleFixOptions.percentMatch.summary,
            customerTotal: scheduleFixOptions.percentMatch.customerTotal,
            distributorTotal: scheduleFixOptions.percentMatch.distributorTotal,
            periods: scheduleFixOptions.percentMatch.periods,
          }
        : {
            approach:
              "Match the distributor schedule's percent-of-total breakdown against the total sold to Dynamix's customer",
            customerTotal: roundMoney(totalBilling),
            distributorTotal: roundMoney(totalCost),
            periods: scheduleComparisonWithShare.map((p) => ({
              periodLabel: p.periodLabel,
              distributorSharePercent: p.distributorSharePercent,
              currentCustomerBilling: p.customerBilling,
              suggestedCustomerBilling: p.suggestedCustomerBilling,
            })),
          }
      errors.push(
        makeError({
          type: 'PAYMENT_SCHEDULE_CASHFLOW',
          severity: 'CRITICAL',
          page: schedulePage,
          pdfPages: pdfTargets.pages.length ? pdfTargets.pages : [schedulePage],
          // Keep Excel Notes as a secondary location, but navigation prefers PDF.
          sheetName: excelData.notesSheetName || excelData.sheetName || null,
          showScheduleTable: true,
          scheduleComparison: scheduleComparisonWithShare,
          math: {
            periodCount: scheduleComparisonWithShare.length,
            hasDeficit: comparison.hasDeficit,
            periodCountMismatch: comparison.periodCountMismatch,
            deficitPeriods: deficitYears,
            rolledUpPeriods: rolledUp.map((p) => p.periodLabel),
            cumulativeDistributorCost: roundMoney(totalCost),
            cumulativeCustomerBilling: roundMoney(totalBilling),
            scheduleAlignmentSuggestion,
            scheduleFixOptions,
          },
          highlightTerms: pdfTargets.terms,
          highlightPairs: pdfTargets.pairs,
          message:
            'Payment Schedule / Cash-Flow Discrepancy. The customer billing schedule does not align with the distributor payment terms. One or more periods create a negative net cash-flow position for Dynamix before profit is recovered in later installments. Click for breakdown.',
        }),
      )
    }
  }

  // Pass-through / omitted distributor notes (Excel Notes → PDF)
  const notes = String(excelData.notes || '')
  const pdfCorpus = [
    pdfText,
    JSON.stringify(pdfData || {}),
    ...(pdfData.groups || []).flatMap((g) => [
      g.groupTitle,
      ...(g.billingSchedule || []).map((b) =>
        [b.periodLabel, b.label, b.year, b.amount].filter(Boolean).join(' '),
      ),
    ]),
  ].join('\n')

  const feeMatch = notes.match(/\$\s*(\d+(?:\.\d{2})?)\s*per\s+appliance/i)
  if (feeMatch) {
    const fee = toNumber(feeMatch[1])
    if (
      fee != null &&
      !pdfCorpus.includes(String(fee)) &&
      !new RegExp(`\\$${fee}\\b`).test(pdfCorpus)
    ) {
      errors.push(
        makeError({
          type: 'UNCAPTURED_PASSTHROUGH_FEE',
          severity: 'WARNING',
          page: 1,
          sheetName: excelData.notesSheetName || excelData.sheetName || null,
          message: `${DISTRIBUTOR_QUOTE} Notes call for about $${fee} shipping per appliance, and that does not show up on the ${CUSTOMER_QUOTE}.`,
        }),
      )
    }
  }

  const omittedNotes = findOmittedDistributorNotes(
    notes,
    pdfCorpus,
    excelData.notesLines || null,
  )
  if (omittedNotes.length > 0) {
    const firstRow =
      omittedNotes.find((n) => n.excelRow != null)?.excelRow ?? null
    const count = omittedNotes.length
    errors.push(
      makeError({
        type: 'OMITTED_DISTRIBUTOR_NOTE',
        severity: 'WARNING',
        page: null,
        sheetName: excelData.notesSheetName || 'Notes',
        excelRow: firstRow,
        excelCol: 'A',
        omittedTerms: omittedNotes,
        detailLines: omittedNotes.map((n) => n.text),
        math: {
          omittedCount: count,
        },
        message:
          count === 1
            ? 'Distributor Notes call out a billing or compliance term that did not make it onto the customer PDF. Click for breakdown.'
            : `Distributor Notes call out ${count} billing or compliance terms that did not make it onto the customer PDF. Click for breakdown.`,
      }),
    )
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

  return finalizeAuditResult(errors, {
    lines: analysis.lines,
    meanMargin: analysis.meanMargin,
    stdDevMargin: analysis.stdDevMargin,
    meanMarginRounded: analysis.meanMarginRounded,
    stdDevMarginRounded: analysis.stdDevMarginRounded,
    skuOverlapPercent: analysis.skuOverlapPercent,
    matchedSkuCount: analysis.matchedSkuCount,
    pdfSkuCount: analysis.pdfSkuCount,
    excelSkuCount: analysis.excelSkuCount,
  })
}

function finalizeAuditResult(errors, analysis) {
  const sorted = [...errors].sort((a, b) => {
    const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sr !== 0) return sr
    return String(a.sku || '').localeCompare(String(b.sku || ''))
  })

  const ranked = sorted.map((e, i) => ({
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
    analysis,
    summaryCounts: {
      critical: criticalCount,
      warning: warningCount,
      notice: visible.filter((e) => e.severity === 'NOTICE').length,
      total: visible.length,
    },
  }
}

/** Blocked check (unrecognized PDF, etc.) — surfaces as CRITICAL, not a thrown 500. */
export function buildBlockedCheckResult({ type, message }) {
  return finalizeAuditResult(
    [
      makeError({
        type,
        severity: 'CRITICAL',
        page: 1,
        message,
      }),
    ],
    {
      ...emptyAnalysis(),
      halted: true,
      haltReason: type,
    },
  )
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
