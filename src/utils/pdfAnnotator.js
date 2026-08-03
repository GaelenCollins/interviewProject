/**
 * Google Docs-style annotated PDF export:
 * - expand right gutter for comments (never cover body text with solid boxes)
 * - translucent in-place highlights over SKU/price text
 * - sidebar callouts + leader lines
 * Pure pdf-lib + pdfjs — no LLM.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { computeVerdict, formatMoney } from './auditEngine.js'

const SIDEBAR_WIDTH = 180
const HIGHLIGHT_OPACITY = 0.35

if (typeof window !== 'undefined' && import.meta?.env?.BASE_URL != null) {
  GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`
}

const COLORS = {
  critical: rgb(198 / 255, 79 / 255, 30 / 255),
  criticalHl: rgb(1, 0.85, 0.78),
  warning: rgb(242 / 255, 169 / 255, 15 / 255),
  warningHl: rgb(1, 0.94, 0.7),
  notice: rgb(100 / 255, 116 / 255, 139 / 255),
  noticeHl: rgb(0.9, 0.93, 0.96),
  white: rgb(1, 1, 1),
  dark: rgb(0.15, 0.17, 0.2),
  gutter: rgb(0.97, 0.97, 0.98),
  rule: rgb(0.82, 0.84, 0.87),
  bannerRed: rgb(0.72, 0.18, 0.12),
  bannerAmber: rgb(0.85, 0.55, 0.08),
  bannerSafe: rgb(0.45, 0.62, 0.12),
}

function stripSeverityPrefix(message) {
  return String(message || '')
    .replace(/^(CRITICAL|WARNING|NOTICE):\s*/i, '')
    .trim()
}

function toPdfText(text) {
  return String(text || '')
    .replace(/[—–−]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .replace(/¢/g, 'c')
    .replace(/€/g, 'EUR')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E]/g, '?')
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next
    } else {
      if (current) lines.push(current)
      // hard-break very long tokens
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          const tryChunk = chunk + ch
          if (font.widthOfTextAtSize(tryChunk, fontSize) <= maxWidth) chunk = tryChunk
          else {
            if (chunk) lines.push(chunk)
            chunk = ch
          }
        }
        current = chunk
      } else {
        current = word
      }
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function severityColor(severity) {
  if (severity === 'CRITICAL') return COLORS.critical
  if (severity === 'WARNING') return COLORS.warning
  return COLORS.notice
}

function highlightColor(severity) {
  if (severity === 'CRITICAL') return COLORS.criticalHl
  if (severity === 'WARNING') return COLORS.warningHl
  return COLORS.noticeHl
}

function bannerForVerdict(verdict) {
  if (verdict === 'UNSAFE_TO_SEND') {
    return { label: 'UNSAFE TO SEND', fill: COLORS.bannerRed, text: COLORS.white }
  }
  if (verdict === 'REQUIRES_APPROVAL') {
    return { label: 'REQUIRES APPROVAL', fill: COLORS.bannerAmber, text: COLORS.dark }
  }
  return { label: 'SAFE TO SEND', fill: COLORS.bannerSafe, text: COLORS.dark }
}

function recommendedFix(error) {
  const type = String(error?.type || '')
  if (/ZERO_OR_NEGATIVE_MARGIN|MARGIN_BELOW/i.test(type)) {
    return 'Review customer-quote sell vs Excel cost; use Calculator (Sale Price tab) for a target margin.'
  }
  if (/MARGIN_ABOVE|CEILING|TARGET_BAND/i.test(type)) {
    return 'Confirm high margin is intentional; customer may push back on price.'
  }
  if (/PAYMENT_SCHEDULE|CASH.?FLOW/i.test(type)) {
    return 'Align customer billing periods with distributor payment terms so no period puts Dynamix in a cash-flow deficit.'
  }
  if (/OMITTED_DISTRIBUTOR_NOTE/i.test(type)) {
    return 'Carry critical Excel Notes billing/compliance terms onto the customer quote PDF.'
  }
  if (/PENNY_SCHEDULE|SCHEDULE_UNBALANCED/i.test(type)) {
    return 'Adjust a billing-year amount on the customer quote so the schedule equals the section total.'
  }
  if (/EXTENSION_MATH|GROUP_TOTAL|GRAND_TOTAL/i.test(type)) {
    return 'Fix qty x unit or totals on the customer quote so extensions add up exactly.'
  }
  if (/QTY_MISMATCH/i.test(type)) {
    return 'Align PDF quantity with the Distributor Quote (Excel Source) qty.'
  }
  if (/MISSING_SKU|GHOST_SKU/i.test(type)) {
    return 'Reconcile SKU presence between Excel and the customer quote PDF.'
  }
  if (/COTERM|COVERAGE|EXPIRED/i.test(type)) {
    return 'Verify coterm / coverage / expiration dates on the customer quote before send.'
  }
  if (/PROJECT_MISMATCH|UNRECOGNIZED/i.test(type)) {
    return 'Upload the matching Distributor Quote and Dynamix Customer Quote pair.'
  }
  if (/CURRENCY/i.test(type)) {
    return 'Confirm currency and exchange-rate handling before send.'
  }
  return 'Review this finding on the customer quote and confirm before send.'
}

function mergeRects(rects, gap = 2) {
  if (!rects.length) return []
  const sorted = [...rects].sort((a, b) => b.y - a.y || a.x - b.x)
  const out = []
  for (const box of sorted) {
    const prev = out[out.length - 1]
    if (
      prev &&
      Math.abs(prev.y - box.y) < gap &&
      box.x <= prev.x + prev.width + gap
    ) {
      const right = Math.max(prev.x + prev.width, box.x + box.width)
      const top = Math.max(prev.y + prev.height, box.y + box.height)
      prev.x = Math.min(prev.x, box.x)
      prev.y = Math.min(prev.y, box.y)
      prev.width = right - prev.x
      prev.height = top - prev.y
    } else {
      out.push({ ...box })
    }
  }
  return out
}

/** PDF-user-space rects for term matches on one page (origin bottom-left). */
async function findTermRectsOnPage(pdfJsPage, terms = []) {
  const content = await pdfJsPage.getTextContent()
  const items = (content.items || []).filter((it) => it?.str)

  let full = ''
  const map = []
  for (const item of items) {
    const str = item.str || ''
    for (let i = 0; i < str.length; i++) {
      full += str[i]
      map.push(item)
    }
  }

  const hay = full.toUpperCase()
  const seen = new Set()
  const rects = []

  for (const term of terms) {
    const needle = String(term || '')
      .trim()
      .toUpperCase()
    if (needle.length < 2) continue
    let from = 0
    while (from < hay.length) {
      const idx = hay.indexOf(needle, from)
      if (idx === -1) break
      const key = `${idx}:${needle}`
      if (!seen.has(key)) {
        seen.add(key)
        const itemSet = new Set()
        for (let i = idx; i < idx + needle.length && i < map.length; i++) {
          itemSet.add(map[i])
        }
        for (const item of itemSet) {
          const t = item.transform || [1, 0, 0, 1, 0, 0]
          const x = t[4]
          const y = t[5]
          const scaleX = Math.hypot(t[0], t[1]) || 1
          const fontH = Math.hypot(t[2], t[3]) || 9
          const w = Math.max((item.width || 0) * scaleX, needle.length * fontH * 0.35)
          const h = Math.max(fontH * 1.15, 8)
          rects.push({
            x,
            y: y - fontH * 0.2,
            width: w,
            height: h,
          })
        }
      }
      from = idx + Math.max(1, needle.length)
    }
  }

  return mergeRects(rects)
}

async function buildPageTermIndex(pdfBytes) {
  const data =
    pdfBytes instanceof Uint8Array
      ? pdfBytes
      : new Uint8Array(pdfBytes)

  const loadingTask = getDocument({
    data: data.slice(0),
    useSystemFonts: true,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages
  const pages = []

  for (let p = 1; p <= pageCount; p++) {
    pages.push(await pdf.getPage(p))
  }

  return {
    pageCount,
    async rectsFor(pageNumber, terms) {
      const page = pages[pageNumber - 1]
      if (!page) return []
      return findTermRectsOnPage(page, terms)
    },
    async destroy() {
      try {
        await pdf.destroy()
      } catch {
        /* ignore */
      }
    },
  }
}

/**
 * @param {ArrayBuffer|Uint8Array} pdfArrayBuffer
 * @param {{ errors?: Array, verdict?: string }} auditResults
 * @returns {Promise<Uint8Array>}
 */
export async function generateAnnotatedPdf(pdfArrayBuffer, auditResults = {}) {
  const bytes =
    pdfArrayBuffer instanceof Uint8Array
      ? pdfArrayBuffer
      : new Uint8Array(pdfArrayBuffer)

  const activeErrors = (auditResults.errors || []).filter((e) => !e.hidden)
  const verdict =
    auditResults.verdict || computeVerdict(activeErrors) || 'SAFE_TO_SEND'

  const termIndex = await buildPageTermIndex(bytes)
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const pages = pdfDoc.getPages()

  // Expand every page with a right comment gutter (content unchanged on the left).
  const contentWidths = pages.map((page) => {
    const { width, height } = page.getSize()
    const contentWidth = width
    page.setSize(contentWidth + SIDEBAR_WIDTH, height)
    try {
      page.setMediaBox(0, 0, contentWidth + SIDEBAR_WIDTH, height)
    } catch {
      /* older pdf-lib path */
    }
    return contentWidth
  })

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const contentWidth = contentWidths[i]
    const { height } = page.getSize()
    const pageNumber = i + 1

    // Sidebar background + divider (gutter only — never over body text)
    page.drawRectangle({
      x: contentWidth,
      y: 0,
      width: SIDEBAR_WIDTH,
      height,
      color: COLORS.gutter,
    })
    page.drawLine({
      start: { x: contentWidth, y: 0 },
      end: { x: contentWidth, y: height },
      thickness: 0.75,
      color: COLORS.rule,
    })

    // Verdict chip lives in the sidebar (page 1), not over document text
    let sidebarTop = height - 12
    if (pageNumber === 1) {
      const banner = bannerForVerdict(verdict)
      const chipH = 22
      const chipX = contentWidth + 8
      const chipW = SIDEBAR_WIDTH - 16
      page.drawRectangle({
        x: chipX,
        y: height - 10 - chipH,
        width: chipW,
        height: chipH,
        color: banner.fill,
      })
      const label = toPdfText(`AUDIT: ${banner.label}`)
      const size = 8
      const tw = helveticaBold.widthOfTextAtSize(label, size)
      page.drawText(label, {
        x: chipX + Math.max(4, (chipW - tw) / 2),
        y: height - 10 - chipH + 7,
        size,
        font: helveticaBold,
        color: banner.text,
      })
      sidebarTop = height - 10 - chipH - 10
    }

    const pageErrors = activeErrors.filter((e) => {
      if (Array.isArray(e.pdfPages) && e.pdfPages.length) {
        return e.pdfPages.some((p) => Number(p) === pageNumber)
      }
      return (
        Math.min(Math.max(Number(e.page) || 1, 1), pages.length) === pageNumber
      )
    })

    const commentLayouts = []
    const fontSize = 7
    const lineHeight = 8.5
    const pad = 5
    const boxWidth = SIDEBAR_WIDTH - 16
    const boxX = contentWidth + 8
    let cursorY = sidebarTop

    for (const error of pageErrors) {
      const isSchedule = /PAYMENT_SCHEDULE|CASH.?FLOW/i.test(error.type || '')
      const terms = error.highlightTerms?.length
        ? error.highlightTerms
        : [error.sku].filter(Boolean)

      const hlRects = await termIndex.rectsFor(pageNumber, terms)
      // Clamp highlights to content area only
      const clamped = hlRects
        .map((r) => ({
          ...r,
          width: Math.min(r.width, Math.max(0, contentWidth - r.x - 2)),
        }))
        .filter((r) => r.width > 1 && r.height > 1 && r.x < contentWidth)
        .sort((a, b) => b.y - a.y || a.x - b.x) // top-of-page first (PDF y grows up)

      for (const r of clamped) {
        page.drawRectangle({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          color: highlightColor(error.severity),
          opacity: HIGHLIGHT_OPACITY,
          borderWidth: 0,
        })
      }

      // Schedule issues: only draw sidebar/leader where Year/Payment text was found.
      // Never point at a summary group total on the wrong page.
      if (isSchedule && !clamped.length) continue

      const color = severityColor(error.severity)
      const title = toPdfText(
        isSchedule
          ? 'Payment schedule / cash-flow'
          : error.sku
            ? `SKU ${error.sku}`
            : error.type || 'Finding',
      )
      const badge = toPdfText(error.severity || 'NOTICE')
      const body = toPdfText(stripSeverityPrefix(error.message))
      const fix = toPdfText(`Fix: ${recommendedFix(error)}`)

      const titleLines = wrapText(title, helveticaBold, fontSize, boxWidth - pad * 2)
      const bodyLines = wrapText(body, helvetica, fontSize, boxWidth - pad * 2).slice(0, 5)
      const fixLines = wrapText(fix, helvetica, fontSize, boxWidth - pad * 2).slice(0, 3)

      const boxH =
        pad * 2 +
        10 + // badge row
        titleLines.length * lineHeight +
        bodyLines.length * lineHeight +
        3 +
        fixLines.length * lineHeight

      if (cursorY - boxH < 10) {
        // No more vertical room — stop stacking (avoid overlap)
        break
      }

      const boxY = cursorY - boxH
      commentLayouts.push({
        error,
        color,
        boxX,
        boxY,
        boxW: boxWidth,
        boxH,
        titleLines,
        bodyLines,
        fixLines,
        badge,
        anchor: clamped[0] || {
          x: contentWidth - 24,
          y: boxY + boxH / 2,
          width: 12,
          height: 8,
        },
      })

      cursorY = boxY - 8
    }

    // Draw comments + leader lines (sidebar only for cards)
    for (const layout of commentLayouts) {
      const {
        color,
        boxX,
        boxY,
        boxW,
        boxH,
        titleLines,
        bodyLines,
        fixLines,
        badge,
        anchor,
      } = layout

      // Leader: highlight → sidebar card
      const startX = Math.min(anchor.x + anchor.width, contentWidth - 2)
      const startY = anchor.y + anchor.height / 2
      const endX = boxX
      const endY = boxY + boxH / 2
      page.drawLine({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        thickness: 0.7,
        color,
        opacity: 0.75,
      })
      // small anchor dot on highlight side
      page.drawCircle({
        x: startX,
        y: startY,
        size: 1.6,
        color,
        opacity: 0.9,
      })

      // Comment card in gutter only
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        color: COLORS.white,
        borderColor: color,
        borderWidth: 1,
      })
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: 2.5,
        height: boxH,
        color,
      })

      // Severity badge
      const badgeSize = 6.5
      const badgeW = helveticaBold.widthOfTextAtSize(badge, badgeSize) + 6
      page.drawRectangle({
        x: boxX + pad,
        y: boxY + boxH - pad - 9,
        width: badgeW,
        height: 9,
        color,
      })
      page.drawText(badge, {
        x: boxX + pad + 3,
        y: boxY + boxH - pad - 7,
        size: badgeSize,
        font: helveticaBold,
        color: COLORS.white,
      })

      let textY = boxY + boxH - pad - 9 - lineHeight - 2
      for (const line of titleLines) {
        page.drawText(line, {
          x: boxX + pad + 2,
          y: textY,
          size: fontSize,
          font: helveticaBold,
          color: COLORS.dark,
        })
        textY -= lineHeight
      }
      for (const line of bodyLines) {
        page.drawText(line, {
          x: boxX + pad + 2,
          y: textY,
          size: fontSize,
          font: helvetica,
          color: COLORS.dark,
        })
        textY -= lineHeight
      }
      textY -= 2
      for (const line of fixLines) {
        page.drawText(line, {
          x: boxX + pad + 2,
          y: textY,
          size: fontSize,
          font: helvetica,
          color: color,
        })
        textY -= lineHeight
      }
    }
  }

  // Appendix: payment schedule / cash-flow breakdown table on a new last page
  const scheduleError = activeErrors.find(
    (e) =>
      /PAYMENT_SCHEDULE|CASH.?FLOW/i.test(e.type || '') &&
      Array.isArray(e.scheduleComparison) &&
      e.scheduleComparison.length,
  )
  if (scheduleError) {
    const base = pages[0]?.getSize?.() || { width: 612 + SIDEBAR_WIDTH, height: 792 }
    const pageW = base.width
    const pageH = base.height
    const contentW = Math.max(400, pageW - SIDEBAR_WIDTH)
    const appendix = pdfDoc.addPage([pageW, pageH])

    appendix.drawRectangle({
      x: contentW,
      y: 0,
      width: SIDEBAR_WIDTH,
      height: pageH,
      color: COLORS.gutter,
    })
    appendix.drawLine({
      start: { x: contentW, y: 0 },
      end: { x: contentW, y: pageH },
      thickness: 0.75,
      color: COLORS.rule,
    })

    appendix.drawText(toPdfText('AUDIT APPENDIX: Payment schedule / cash-flow'), {
      x: 36,
      y: pageH - 40,
      size: 12,
      font: helveticaBold,
      color: COLORS.dark,
    })
    appendix.drawText(
      toPdfText(
        stripSeverityPrefix(scheduleError.message).slice(0, 140),
      ),
      {
        x: 36,
        y: pageH - 56,
        size: 8,
        font: helvetica,
        color: COLORS.notice,
      },
    )

    const cols = [
      { key: 'period', label: 'Period', x: 36, w: 70 },
      { key: 'dist', label: 'Distributor due', x: 110, w: 90 },
      { key: 'cust', label: 'Customer billed', x: 210, w: 90 },
      { key: 'net', label: 'Net position', x: 310, w: 80 },
      { key: 'status', label: 'Status', x: 400, w: 50 },
    ]
    let y = pageH - 84
    appendix.drawRectangle({
      x: 30,
      y: y - 4,
      width: contentW - 48,
      height: 16,
      color: rgb(0.93, 0.94, 0.96),
    })
    for (const col of cols) {
      appendix.drawText(toPdfText(col.label), {
        x: col.x,
        y,
        size: 7,
        font: helveticaBold,
        color: COLORS.dark,
      })
    }
    y -= 18

    for (const row of scheduleError.scheduleComparison) {
      if (y < 48) break
      const net = Number(row.netCashFlow) || 0
      const deficit = row.hasDeficit || net < -0.005
      const status = deficit ? 'Deficit' : net > 0.005 ? 'Surplus' : 'Even'
      if (deficit) {
        appendix.drawRectangle({
          x: 30,
          y: y - 3,
          width: contentW - 48,
          height: 14,
          color: rgb(1, 0.92, 0.88),
        })
      }
      const distShare =
        row.distributorSharePercent != null
          ? ` (${row.distributorSharePercent}%)`
          : ''
      const custShare =
        row.customerSharePercent != null
          ? ` (${row.customerSharePercent}%)`
          : ''
      const cells = [
        row.periodLabel || 'Period',
        `${formatMoney(row.distributorCost)}${distShare}`,
        `${formatMoney(row.customerBilling)}${custShare}`,
        formatMoney(net),
        status,
      ]
      cells.forEach((text, i) => {
        appendix.drawText(toPdfText(text), {
          x: cols[i].x,
          y,
          size: 7,
          font: deficit && i === 4 ? helveticaBold : helvetica,
          color: deficit ? COLORS.critical : COLORS.dark,
        })
      })
      y -= 14
    }

    y -= 10
    appendix.drawText(
      toPdfText(
        'Problem years are highlighted on the subscription Billing Schedule detail pages above. This table summarizes distributor vs customer cash-flow by period.',
      ),
      {
        x: 36,
        y: Math.max(28, y),
        size: 7,
        font: helvetica,
        color: COLORS.notice,
      },
    )
  }

  await termIndex.destroy()
  return pdfDoc.save()
}

export function buildAnnotatedFilename(originalName = 'customer_quote.pdf') {
  const base = String(originalName || 'customer_quote.pdf').replace(
    /\.pdf$/i,
    '',
  )
  return `${base}_AUDIT_MARKUP.pdf`
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
