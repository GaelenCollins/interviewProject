import { extractPdfText } from './pdf.js'
import { parseDistributorExcel } from '../../src/utils/excelParser.js'
import { EMPTY_PDF_QUOTE } from '../../src/utils/pdfSchema.js'
import { auditQuote, toNumber } from '../../src/utils/auditEngine.js'
import {
  CUSTOMER_QUOTE,
  DISTRIBUTOR_QUOTE,
} from '../../src/constants/labels.js'
import {
  extractPdfSchema,
  streamChatWithSonnet,
  streamInitialAnalysisWithSonnet,
  streamQuickActionWithHaiku,
} from './claude.js'

const sessions = new Map()

export function getSession(sessionId) {
  return sessions.get(sessionId) || null
}

/**
 * Check pipeline with progress callbacks.
 * Audit math is deterministic; opening analysis is Sonnet-written.
 * PDF schema: Haiku primary → Sonnet fallback → regex.
 */
export async function runQuoteCheck({
  excelBuffer,
  excelFilename,
  pdfBuffer,
  pdfFilename,
  onProgress,
}) {
  const emit = (stage, message) => {
    try {
      onProgress?.({ stage, message })
    } catch {
      /* ignore */
    }
  }

  const warnings = []

  emit('start', 'Got your files. Opening the workspace…')

  // Parallel: Excel parse + PDF text extract
  emit(
    'parse',
    `Reading the ${DISTRIBUTOR_QUOTE} and extracting the ${CUSTOMER_QUOTE}…`,
  )
  const [excelResult, pdfResult] = await Promise.allSettled([
    Promise.resolve().then(() => parseDistributorExcel(excelBuffer, excelFilename)),
    extractPdfText(pdfBuffer, pdfFilename),
  ])

  if (excelResult.status !== 'fulfilled') {
    throw new Error(
      `${DISTRIBUTOR_QUOTE} parse failed: ${excelResult.reason?.message || excelResult.reason}`,
    )
  }
  const excelData = excelResult.value

  let pdfText = { markdown: '', pages: [], provider: 'unavailable', pageCount: 0 }
  if (pdfResult.status === 'fulfilled') {
    pdfText = pdfResult.value
    emit(
      'pdf',
      `${CUSTOMER_QUOTE} text ready (${pdfText.pageCount || pdfText.pages?.length || '?'} pages).`,
    )
  } else {
    warnings.push(
      `${CUSTOMER_QUOTE} text extraction failed: ${pdfResult.reason?.message || pdfResult.reason}`,
    )
    emit(
      'pdf',
      `${CUSTOMER_QUOTE} text extraction hit a snag; continuing with what we have…`,
    )
  }

  // Dual-stage schema: Haiku → Sonnet → regex
  let pdfData = { ...EMPTY_PDF_QUOTE }
  if (pdfText.markdown) {
    emit('schema', `Structuring the ${CUSTOMER_QUOTE}…`)
    try {
      const extracted = await extractPdfSchema(pdfText.markdown)
      pdfData = extracted.pdfData
      if (extracted.fallbackFrom === 'haiku') {
        warnings.push(
          `${CUSTOMER_QUOTE} Haiku schema failed (${extracted.haikuError || 'invalid JSON'}); used Sonnet.`,
        )
        emit('schema', `${CUSTOMER_QUOTE} structure ready (Sonnet fallback).`)
      } else {
        emit('schema', `${CUSTOMER_QUOTE} structure ready.`)
      }
    } catch (err) {
      warnings.push(`${CUSTOMER_QUOTE} schema extraction failed: ${err.message}`)
      pdfData = regexFallbackPdf(pdfText.markdown)
      emit('schema', `Fell back to a lighter ${CUSTOMER_QUOTE} parse.`)
    }
  }

  emit('audit', 'Running deterministic checks…')
  const auditResult = auditQuote(excelData, pdfData)
  emit(
    'audit',
    `Found ${auditResult.summaryCounts.total} issue(s). Writing analysis…`,
  )

  const sessionId = crypto.randomUUID()
  const session = {
    id: sessionId,
    createdAt: Date.now(),
    excelData,
    pdfData,
    pdfText,
    auditResult,
    errors: auditResult.errors,
    analysis: auditResult.analysis,
    verdict: auditResult.verdict,
    warnings,
    files: { excelFilename, pdfFilename },
    chatHistory: [],
    meta: {
      excel: {
        supplierQuoteNumber: excelData.supplierQuoteNumber,
        contractDates: excelData.contractDates,
        totalResellerCost: excelData.totalResellerCost,
        lineCount: excelData.lineItems.length,
      },
      customer: {
        quoteNumber: pdfData.quoteNumber,
        projectHeader: pdfData.projectHeader,
        grandTotal: pdfData.grandTotal,
        groupCount: pdfData.groups.length,
      },
      meanMarginPercent: auditResult.analysis.meanMarginRounded,
      pdfProvider: pdfText.provider,
      verdict: auditResult.verdict,
    },
  }
  sessions.set(sessionId, session)

  const quoteDossier = buildQuoteDossier(session)
  let summary = ''
  try {
    for await (const token of streamInitialAnalysisWithSonnet({
      auditResult,
      quoteDossier,
      meta: session.meta,
      warnings,
    })) {
      summary += token
      emit('summary', summary)
    }
  } catch (err) {
    warnings.push(`Opening analysis failed: ${err.message || err}`)
    summary =
      `I finished the check (${auditResult.summaryCounts.total} finding(s), verdict ${auditResult.verdict}). ` +
      `Ask me about any SKU or issue and I will walk through the dossier.`
    emit('summary', summary)
  }

  session.chatHistory = [{ role: 'assistant', text: summary }]
  session.warnings = warnings

  return {
    sessionId,
    summary,
    errors: auditResult.errors,
    verdict: auditResult.verdict,
    summaryCounts: auditResult.summaryCounts,
    analysis: auditResult.analysis,
    warnings,
    meta: session.meta,
    excelData,
    pdfData,
  }
}

/** Compact line-by-line Excel + PDF dossier for the chatbot. */
export function buildQuoteDossier(session) {
  const excel = session?.excelData || {}
  const pdf = session?.pdfData || {}
  const lines = session?.analysis?.lines || []

  const excelLines = (excel.lineItems || []).map((l) => ({
    line: l.line,
    sku: l.sku,
    description: l.description,
    qty: l.qty,
    resellerUnitCost: l.resellerUnitCost,
    resellerExtCost: l.resellerExtCost,
    discountPercent: l.discountPercent,
    serialNumber: l.serialNumber,
    coverageStart: l.coverageStart,
    coverageEnd: l.coverageEnd,
    sheetName: l.sheetName,
    excelRow: l.excelRow,
  }))

  const pdfLines = []
  for (const g of pdf.groups || []) {
    for (const item of g.lineItems || []) {
      pdfLines.push({
        groupTitle: g.groupTitle,
        groupSerial: g.serialNumber,
        groupCoverageStart: g.coverageDates?.start ?? null,
        groupCoverageEnd: g.coverageDates?.end ?? null,
        billingSchedule: g.billingSchedule || [],
        groupTotal: g.groupTotal,
        page: item.page ?? g.page ?? null,
        sku: item.sku,
        description: item.description,
        qty: item.qty,
        unitPrice: item.unitPrice,
        extendedPrice: item.extendedPrice,
      })
    }
  }

  const compared = lines.map((l) => ({
    sku: l.sku,
    description: l.description,
    inExcel: l.inExcel,
    inPdf: l.inPdf,
    excelQty: l.excelQty,
    pdfQty: l.pdfQty,
    resellerUnitCost: l.resellerUnitCost,
    unitPrice: l.unitPrice,
    marginRounded: l.marginRounded,
    excelSerial: l.excelSerial,
    pdfSerial: l.pdfSerial,
    coverageEnd: l.coverageEnd,
    page: l.page,
    line: l.line,
  }))

  const missingFromPdf = compared.filter((l) => l.inExcel && !l.inPdf).map((l) => l.sku)
  const missingFromExcel = compared.filter((l) => l.inPdf && !l.inExcel).map((l) => l.sku)

  const pdfMarkdown = String(session?.pdfText?.markdown || '')
  const termSnippet = pdfMarkdown
    ? pdfMarkdown.slice(0, 12000)
    : null

  return {
    distributorQuote: {
      supplierQuoteNumber: excel.supplierQuoteNumber,
      contractDates: excel.contractDates,
      totalResellerCost: excel.totalResellerCost,
      notes: excel.notes || '',
      lineItems: excelLines,
    },
    customerQuote: {
      quoteNumber: pdf.quoteNumber,
      projectHeader: pdf.projectHeader,
      grandTotal: pdf.grandTotal,
      groups: (pdf.groups || []).map((g) => ({
        groupTitle: g.groupTitle,
        serialNumber: g.serialNumber,
        page: g.page,
        coverageDates: g.coverageDates,
        billingSchedule: g.billingSchedule,
        groupTotal: g.groupTotal,
        lineItemCount: (g.lineItems || []).length,
      })),
      lineItems: pdfLines,
      extractedTextSnippet: termSnippet,
    },
    comparedLines: compared,
    termGaps: {
      skusInExcelMissingFromPdf: missingFromPdf,
      skusInPdfMissingFromExcel: missingFromExcel,
    },
    checkFindings: (session?.errors || []).map((e) => ({
      id: e.id,
      severity: e.severity,
      type: e.type,
      sku: e.sku,
      page: e.page,
      message: e.message,
      locations: e.locations,
    })),
  }
}

export async function* streamChat({ sessionId, message, mode = 'chat', errorId = null }) {
  const session = getSession(sessionId)
  if (!session) throw new Error('Check session not found. Upload files again.')

  const error = session.errors.find((e) => e.id === errorId) || null
  const quoteDossier = buildQuoteDossier(session)

  if (mode === 'quick') {
    const skuKey = String(error?.sku || '').trim().toUpperCase()
    const excelSource =
      error?.excelSource ||
      (session.excelData?.lineItems || []).find(
        (l) => String(l.sku || '').trim().toUpperCase() === skuKey,
      ) ||
      null
    const comparedLine =
      (session.analysis?.lines || []).find(
        (l) => String(l.sku || '').trim().toUpperCase() === skuKey,
      ) || null

    const healthyMargins = (session.analysis?.lines || [])
      .map((l) => l.margin)
      .filter((m) => m != null && m > 0)
    const minHealthyMarginPercent =
      healthyMargins.length > 0
        ? Math.round(Math.min(...healthyMargins) * 100) / 100
        : null

    let full = ''
    for await (const token of streamQuickActionWithHaiku({
      question: message,
      error,
      context: {
        math: error?.math || {
          meanMarginPercent: session.analysis?.meanMarginRounded,
        },
        meta: session.meta,
        excelSource,
        excelHints: error?.excelHints || [],
        discountContext: error?.discountContext || null,
        comparedLine,
        minHealthyMarginPercent,
        quoteDossier,
      },
    })) {
      full += token
      yield token
    }
    const history = session.chatHistory || []
    history.push({ role: 'user', text: message })
    history.push({ role: 'assistant', text: full })
    session.chatHistory = history
    return
  }

  // Free chat → Sonnet for deeper reasoning / synthesis
  const history = session.chatHistory || []
  history.push({ role: 'user', text: message })
  let full = ''
  for await (const token of streamChatWithSonnet({
    messages: history,
    context: session,
    quoteDossier,
  })) {
    full += token
    yield token
  }
  history.push({ role: 'assistant', text: full })
  session.chatHistory = history
}

function regexFallbackPdf(markdown) {
  const groups = [
    {
      groupTitle: 'Extracted line items',
      serialNumber: null,
      page: 1,
      coverageDates: { start: null, end: null },
      billingSchedule: [],
      lineItems: [],
      groupTotal: null,
    },
  ]

  const re =
    /\b(RS-[A-Z0-9-]+)\b[\s\S]{0,160}?\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+\.[0-9]{2})/g
  let match
  const seen = new Set()
  while ((match = re.exec(markdown)) !== null) {
    const sku = match[1]
    if (seen.has(sku)) continue
    seen.add(sku)
    const unitPrice = toNumber(match[2])
    groups[0].lineItems.push({
      sku,
      description: '',
      qty: 1,
      unitPrice,
      extendedPrice: unitPrice,
      page: pageForOffset(markdown, match.index),
    })
  }

  const coterm =
    markdown.match(/coterm[^\d]*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i) ||
    markdown.match(/Coverage through\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i)

  let cotermDate = null
  if (coterm) {
    const yyyy = coterm[3].length === 2 ? `20${coterm[3]}` : coterm[3]
    cotermDate = `${yyyy}-${coterm[1].padStart(2, '0')}-${coterm[2].padStart(2, '0')}`
  }

  return {
    quoteNumber: null,
    projectHeader: {
      title: null,
      cotermDate,
      expirationDate: null,
    },
    groups,
    grandTotal: null,
  }
}

function pageForOffset(markdown, offset) {
  const before = markdown.slice(0, offset)
  const markers = [...before.matchAll(/<!-- page (\d+) -->/g)]
  if (!markers.length) return 1
  return Number(markers[markers.length - 1][1]) || 1
}

