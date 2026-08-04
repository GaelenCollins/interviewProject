import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  findHighlightRects,
  findPairedScheduleHighlightRects,
} from '../utils/pdfHighlights'
import {
  buildAnnotatedFilename,
  downloadBytes,
  generateAnnotatedPdf,
} from '../utils/pdfAnnotator'
import { computeVerdict } from '../utils/auditEngine'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

/** Previous 140% becomes the new 100% baseline. */
const BASE_SCALE = 1.4
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1

function moneySearchTerms(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return []
  const plain = n.toFixed(2)
  const withComma = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return [plain, withComma, `$${withComma}`, `$${plain}`]
}

/** Build / normalize Year↔amount pairs for schedule PDF highlights. */
function resolveScheduleHighlightPairs(error) {
  if (Array.isArray(error?.highlightPairs) && error.highlightPairs.length) {
    return error.highlightPairs
  }

  const rows = Array.isArray(error?.scheduleComparison)
    ? error.scheduleComparison
    : []
  const deficit =
    rows.filter((p) => p.hasDeficit).length > 0
      ? rows.filter((p) => p.hasDeficit)
      : (error?.math?.deficitPeriods || []).map((label) => ({
          periodLabel: label,
        }))

  const focus = deficit.length
    ? deficit
    : rows.filter((p) => p.hasDeficit || p.periodCountMismatch)

  const byYear = new Map()
  for (const p of focus.length ? focus : rows) {
    const num = String(p.periodLabel || '').match(/\d+/)?.[0]
    if (!num) continue
    if (!byYear.has(num)) {
      byYear.set(num, {
        yearNums: [num],
        labels: [`Year ${num}`, `Yr ${num}`, `Period ${num}`, `Payment ${num}`],
        amounts: new Set(),
      })
    }
    const entry = byYear.get(num)
    if (p.periodLabel) entry.labels.push(String(p.periodLabel))
    const billing = p.customerBilling ?? p.amount
    for (const t of moneySearchTerms(billing)) entry.amounts.add(t)
    for (const c of p.contributions || []) {
      for (const t of moneySearchTerms(c.amount)) entry.amounts.add(t)
    }
  }

  return [...byYear.values()].map((p) => ({
    yearNums: p.yearNums,
    labels: [...new Set(p.labels)],
    amounts: [...p.amounts],
  }))
}
const SCROLLBAR_WIDTH = 12

function severityFill(severity, active) {
  if (severity === 'CRITICAL') {
    return active ? 'rgba(198, 79, 30, 0.45)' : 'rgba(198, 79, 30, 0.28)'
  }
  if (severity === 'WARNING') {
    return active ? 'rgba(242, 169, 15, 0.45)' : 'rgba(242, 169, 15, 0.28)'
  }
  return active ? 'rgba(100, 116, 139, 0.40)' : 'rgba(100, 116, 139, 0.22)'
}

function severityRing(severity) {
  if (severity === 'CRITICAL') return 'rgba(198, 79, 30, 0.9)'
  if (severity === 'WARNING') return 'rgba(242, 169, 15, 0.95)'
  return 'rgba(100, 116, 139, 0.9)'
}

export default function PdfViewer({
  pdfFile,
  pdfUrl,
  activePage,
  onPageChange,
  activeErrorId,
  errorFocusKey = 0,
  errors = [],
  zoom,
  onZoomChange,
  onSelectError,
  /** Bump from chat/header to start annotated PDF export without a button click */
  exportRequestKey = 0,
}) {
  const [numPages, setNumPages] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [markerPercents, setMarkerPercents] = useState([])
  const [pageHighlights, setPageHighlights] = useState({})
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  /** Fit-to-width page size for phone viewports (iPhone 16 ~393 CSS px). */
  const [fitWidth, setFitWidth] = useState(null)
  const [isPhone, setIsPhone] = useState(false)

  const scrollRef = useRef(null)
  const pageRefs = useRef({})
  const highlightAnchorRefs = useRef({})
  const suppressScrollSync = useRef(false)
  const markerTimerRef = useRef(null)
  const highlightTimersRef = useRef({})

  const totalPages = numPages || 1
  const safePage = Math.min(Math.max(activePage, 1), totalPages)
  const renderScale = zoom * BASE_SCALE
  const pageWidth = isPhone && fitWidth ? Math.round(fitWidth * zoom) : null

  const visibleErrors = errors.filter((e) => !e.hidden)

  useEffect(() => {
    setNumPages(null)
    setLoadError('')
    setMarkerPercents([])
    setPageHighlights({})
    pageRefs.current = {}
    highlightAnchorRefs.current = {}
  }, [pdfUrl])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const syncPhone = () => setIsPhone(mq.matches)
    syncPhone()
    mq.addEventListener('change', syncPhone)
    return () => mq.removeEventListener('change', syncPhone)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const measure = () => {
      const phone = window.matchMedia('(max-width: 767px)').matches
      const pad = phone ? 12 : 32
      setFitWidth(Math.max(260, el.clientWidth - pad))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pdfUrl])

  useEffect(() => {
    if (numPages && activePage > numPages) {
      onPageChange(numPages)
    }
  }, [numPages, activePage, onPageChange])

  const measureHighlightsForPage = (pageNumber) => {
    const el = pageRefs.current[pageNumber]
    if (!el) return

    const pageErrors = visibleErrors.filter(
      (e) =>
        e.page === pageNumber ||
        (Array.isArray(e.pdfPages) && e.pdfPages.includes(pageNumber)),
    )
    const next = []

    for (const error of pageErrors) {
      const isSchedule = /PAYMENT_SCHEDULE|CASH.?FLOW/i.test(error.type || '')
      let rects = []
      if (isSchedule) {
        // Y-pair Year N ↔ payment so equal $ on other years stay plain.
        const pairs = resolveScheduleHighlightPairs(error)
        if (pairs.length) {
          rects = findPairedScheduleHighlightRects(el, pairs)
        }
        if (!rects.length) {
          // Last resort: problem-year labels only (never flat dollar search)
          const labelTerms = [
            ...(error.highlightTerms || []),
            ...pairs.flatMap((p) => p.labels || []),
            ...pairs.flatMap((p) =>
              (p.yearNums || []).flatMap((y) => [
                `Year ${y}`,
                `Yr ${y}`,
                `Payment ${y}`,
              ]),
            ),
          ].filter((t) => t && !/[\$\d],?\d/.test(String(t)))
          rects = findHighlightRects(el, [...new Set(labelTerms)])
        }
      } else {
        const terms = error.highlightTerms?.length
          ? error.highlightTerms
          : [error.sku].filter(Boolean)
        rects = findHighlightRects(el, terms)
      }
      if (!rects.length && error.sku) {
        // Fallback: still mark near top of page via badge only
        continue
      }
      // Sort top-to-bottom so "first instance" navigation is stable
      const ordered = [...rects].sort(
        (a, b) => a.top - b.top || a.left - b.left,
      )
      for (const rect of ordered) {
        next.push({
          errorId: error.id,
          severity: error.severity,
          page: pageNumber,
          ...rect,
        })
      }
    }

    setPageHighlights((prev) => ({ ...prev, [pageNumber]: next }))
  }

  const measureAllHighlights = () => {
    if (!numPages) return
    // Reset first-instance anchors so problem-year highlights re-rank cleanly
    highlightAnchorRefs.current = {}
    for (let p = 1; p <= numPages; p++) {
      measureHighlightsForPage(p)
    }
  }

  /**
   * Scrollbar dots use stable page geometry only — never live highlight anchors.
   * Anchors remount while scrolling / text-layer paints and caused marker flash.
   */
  const measureMarkers = () => {
    const root = scrollRef.current
    if (!root || !numPages) return

    const contentHeight = root.scrollHeight
    if (contentHeight <= 0) return

    const next = []
    for (const error of visibleErrors) {
      const pageCandidates = [
        ...(Array.isArray(error.pdfPages) ? error.pdfPages : []),
        error.page,
      ]
        .map(Number)
        .filter((p) => Number.isFinite(p) && p >= 1 && p <= numPages)
      if (!pageCandidates.length) continue
      // One marker per issue at its earliest page (stable; no multi-dot flicker)
      const page = Math.min(...pageCandidates)
      const el = pageRefs.current[page]
      let percent
      if (el && el.offsetHeight > 0) {
        const top = el.offsetTop + el.offsetHeight * 0.12
        percent = (top / contentHeight) * 100
      } else {
        percent = ((page - 0.5) / numPages) * 100
      }
      percent = Math.round(Math.min(98, Math.max(1, percent)) * 10) / 10
      next.push({
        id: error.id,
        page,
        severity: error.severity,
        percent,
      })
    }

    setMarkerPercents((prev) => {
      if (
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            p.id === next[i].id &&
            p.page === next[i].page &&
            Math.abs(p.percent - next[i].percent) < 0.2,
        )
      ) {
        return prev
      }
      return next
    })
  }

  const scheduleMeasureMarkers = () => {
    if (markerTimerRef.current) window.clearTimeout(markerTimerRef.current)
    markerTimerRef.current = window.setTimeout(() => {
      markerTimerRef.current = null
      measureMarkers()
    }, 120)
  }

  // Remeasure highlights as soon as findings arrive (pages may already be painted).
  // Switching Excel→PDF used to be the only remount that triggered this.
  const errorHighlightKey = visibleErrors
    .map(
      (e) =>
        `${e.id}:${e.page}:${(e.pdfPages || []).join(',')}:${e.type}:${(e.highlightTerms || []).slice(0, 3).join('|')}`,
    )
    .join(';')

  useEffect(() => {
    if (!numPages) return undefined
    measureAllHighlights()
    scheduleMeasureMarkers()
    const timers = [120, 350, 700].map((ms) =>
      window.setTimeout(() => {
        measureAllHighlights()
        scheduleMeasureMarkers()
      }, ms),
    )
    return () => timers.forEach((id) => window.clearTimeout(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, errorHighlightKey, zoom, pdfUrl, pageWidth])

  useEffect(() => {
    scheduleMeasureMarkers()
    const root = scrollRef.current
    if (!root) return undefined

    const onWindowResize = () => {
      measureAllHighlights()
      scheduleMeasureMarkers()
    }
    window.addEventListener('resize', onWindowResize)
    // Only remeasure markers when the scroll content size changes (pages load),
    // not on every highlight overlay remount.
    let lastHeight = root.scrollHeight
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const h = root.scrollHeight
            if (Math.abs(h - lastHeight) < 8) return
            lastHeight = h
            scheduleMeasureMarkers()
          })
        : null
    ro?.observe(root)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      ro?.disconnect()
      if (markerTimerRef.current) window.clearTimeout(markerTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, zoom, pdfUrl])

  const scrollToPage = (page, { smooth = true } = {}) => {
    const el = pageRefs.current[page]
    const root = scrollRef.current
    if (!el || !root) return

    suppressScrollSync.current = true
    const top = el.offsetTop - 12
    root.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    window.setTimeout(() => {
      suppressScrollSync.current = false
    }, smooth ? 400 : 50)
  }

  const scrollToError = (error) => {
    if (!error) return
    const root = scrollRef.current
    const anchor = highlightAnchorRefs.current[error.id]
    if (!root) return false

    suppressScrollSync.current = true
    if (anchor) {
      const rootRect = root.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const top =
        root.scrollTop + (anchorRect.top - rootRect.top) - root.clientHeight * 0.3
      root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      window.setTimeout(() => {
        suppressScrollSync.current = false
      }, 450)
      return true
    }
    const page =
      error.page ||
      (Array.isArray(error.pdfPages) && error.pdfPages[0]) ||
      null
    if (page) scrollToPage(page)
    window.setTimeout(() => {
      suppressScrollSync.current = false
    }, 450)
    return false
  }

  // Only jump when the user explicitly picks an issue (errorFocusKey bumps).
  // Retry briefly until the first highlight rect exists (problem-year payments).
  const lastFocusKeyRef = useRef(0)
  useEffect(() => {
    if (!numPages || !errorFocusKey || activeErrorId == null) return
    if (errorFocusKey === lastFocusKeyRef.current) return
    lastFocusKeyRef.current = errorFocusKey
    const error = errors.find((e) => e.id === activeErrorId && !e.hidden)
    if (!error) return

    let cancelled = false
    let attempts = 0
    const tryScroll = () => {
      if (cancelled) return
      const ok = scrollToError(error)
      attempts += 1
      if (!ok && attempts < 10) {
        window.setTimeout(tryScroll, 120)
      }
    }
    const t = window.setTimeout(tryScroll, 80)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorFocusKey, numPages])

  useEffect(() => {
    const root = scrollRef.current
    if (!root || !numPages) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressScrollSync.current) return
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const best = visible[0]
        if (!best) return
        const page = Number(best.target.getAttribute('data-page'))
        if (page && page !== activePage) {
          onPageChange(page)
        }
      },
      {
        root,
        threshold: [0.25, 0.5, 0.75],
      },
    )

    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [numPages, activePage, onPageChange, zoom])

  const handlePrev = () => {
    const next = Math.max(1, safePage - 1)
    onPageChange(next)
  }

  const handleNext = () => {
    const next = Math.min(totalPages, safePage + 1)
    onPageChange(next)
  }

  const handleExportAnnotated = async () => {
    if (!pdfFile || exporting) return
    setExporting(true)
    setExportError('')
    try {
      const buffer = await pdfFile.arrayBuffer()
      const annotated = await generateAnnotatedPdf(buffer, {
        errors: visibleErrors,
        verdict: computeVerdict(visibleErrors),
      })
      downloadBytes(annotated, buildAnnotatedFilename(pdfFile.name))
    } catch (err) {
      setExportError(err?.message || 'Could not export annotated PDF')
    } finally {
      setExporting(false)
    }
  }

  const lastExportRequestRef = useRef(0)
  useEffect(() => {
    if (!exportRequestKey || exportRequestKey === lastExportRequestRef.current) {
      return
    }
    lastExportRequestRef.current = exportRequestKey
    handleExportAnnotated()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRequestKey])

  return (
    <div className="flex flex-col h-full min-h-0 bg-brand-main overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 md:px-4 py-1.5 md:py-2.5 shrink-0 bg-black/25 border-b border-white/10">
        <span
          className="text-[11px] md:text-xs font-medium text-white/50 font-mono truncate min-w-0"
          title={pdfFile?.name}
        >
          {pdfFile?.name || 'customer_quote.pdf'}
        </span>
        <button
          type="button"
          onClick={handleExportAnnotated}
          disabled={!pdfFile || exporting}
          className="shrink-0 inline-flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1 rounded-md text-[11px] font-semibold bg-brand-secondary/20 text-brand-secondary hover:bg-brand-secondary/30 disabled:opacity-40 transition-colors"
          title="Export Annotated PDF"
          aria-label="Export Annotated PDF"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="md:hidden">{exporting ? '…' : 'Export'}</span>
          <span className="hidden md:inline">
            {exporting ? 'Exporting…' : 'Export Annotated PDF'}
          </span>
        </button>
      </div>
      {exportError ? (
        <div className="shrink-0 px-3 md:px-4 py-1 md:py-1.5 text-[11px] text-brand-acc1 bg-brand-acc1/10 border-b border-brand-acc1/30">
          {exportError}
        </div>
      ) : null}

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="pdf-scroll absolute inset-0 overflow-y-scroll overflow-x-hidden md:overflow-x-auto p-1.5 md:p-4"
          style={{ scrollbarGutter: isPhone ? 'auto' : 'stable' }}
        >
          {!pdfUrl ? (
            <div className="flex flex-col items-center justify-center h-full text-white/40 gap-2">
              <FileText className="w-8 h-8" />
              <span className="text-sm">No PDF loaded</span>
            </div>
          ) : (
            <Document
              file={pdfUrl}
              loading={
                <div
                  className="bg-white rounded shadow-2xl min-h-[240px] md:min-h-[540px] mx-auto flex items-center justify-center text-sm text-slate-500"
                  style={{ width: pageWidth || 420 }}
                >
                  Loading PDF…
                </div>
              }
              error={
                <div
                  className="bg-white rounded shadow-2xl min-h-[160px] md:min-h-[200px] mx-auto flex items-center justify-center text-sm text-brand-acc1 px-6 text-center"
                  style={{ width: pageWidth || 420, maxWidth: '100%' }}
                >
                  {loadError || 'Could not load this PDF. Try another file.'}
                </div>
              }
              onLoadSuccess={({ numPages: next }) => {
                setNumPages(next)
                setLoadError('')
              }}
              onLoadError={(err) => {
                setLoadError(err?.message || 'Failed to load PDF')
              }}
            >
              <div className="mx-auto w-full md:w-max flex flex-col gap-2 md:gap-4 items-center">
                {Array.from({ length: totalPages }, (_, i) => {
                  const pageNumber = i + 1
                  const pageErrors = visibleErrors.filter(
                    (e) =>
                      e.page === pageNumber ||
                      (Array.isArray(e.pdfPages) &&
                        e.pdfPages.includes(pageNumber)),
                  )
                  const highlights = pageHighlights[pageNumber] || []
                  return (
                    <div
                      key={pageNumber}
                      data-page={pageNumber}
                      ref={(el) => {
                        if (el) pageRefs.current[pageNumber] = el
                        else delete pageRefs.current[pageNumber]
                      }}
                      className="relative max-w-full"
                    >
                      {pageErrors.map((error, idx) => (
                        <button
                          key={`badge-${error.id}`}
                          type="button"
                          onClick={() => onSelectError?.(error.id)}
                          className={`absolute z-20 w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-white text-[10px] md:text-[11px] font-bold font-mono shadow-lg transition-transform left-1 md:-left-2 top-auto ${
                            error.severity === 'CRITICAL'
                              ? 'bg-brand-acc1'
                              : error.severity === 'WARNING'
                                ? 'bg-brand-acc2'
                                : 'bg-slate-500'
                          } ${
                            activeErrorId === error.id
                              ? 'scale-125 ring-[3px] ring-white/30'
                              : 'hover:scale-110'
                          }`}
                          style={{ top: `${8 + idx * 24}px` }}
                          title={`${error.severity} #${error.id}${error.sku ? ` · ${error.sku}` : ''}`}
                        >
                          {error.id}
                        </button>
                      ))}

                      <Page
                        pageNumber={pageNumber}
                        {...(pageWidth
                          ? { width: pageWidth }
                          : { scale: renderScale })}
                        className="shadow-2xl rounded overflow-hidden bg-white max-w-full"
                        renderTextLayer
                        renderAnnotationLayer
                        onRenderSuccess={() => {
                          // Debounce text-layer highlight measure; markers stay page-based
                          const prev = highlightTimersRef.current[pageNumber] || []
                          prev.forEach((id) => window.clearTimeout(id))
                          const run = () => measureHighlightsForPage(pageNumber)
                          window.requestAnimationFrame(run)
                          highlightTimersRef.current[pageNumber] = [
                            window.setTimeout(run, 100),
                            window.setTimeout(() => {
                              run()
                              scheduleMeasureMarkers()
                            }, 280),
                          ]
                        }}
                      />

                      {/* Exact text highlights on the page */}
                      <div className="pointer-events-none absolute inset-0 z-10">
                        {highlights.map((h, idx) => {
                          const active = activeErrorId === h.errorId
                          return (
                            <button
                              key={`${h.errorId}-${idx}`}
                              type="button"
                              ref={(el) => {
                                if (!el) return
                                // Keep earliest page + topmost rect as the jump target
                                const prev = highlightAnchorRefs.current[h.errorId]
                                const prevMeta =
                                  highlightAnchorRefs.current[`${h.errorId}:meta`]
                                const meta = {
                                  page: h.page || pageNumber,
                                  top: h.top,
                                }
                                if (
                                  !prev ||
                                  !prevMeta ||
                                  meta.page < prevMeta.page ||
                                  (meta.page === prevMeta.page &&
                                    meta.top < prevMeta.top)
                                ) {
                                  highlightAnchorRefs.current[h.errorId] = el
                                  highlightAnchorRefs.current[`${h.errorId}:meta`] =
                                    meta
                                }
                              }}
                              onClick={() => onSelectError?.(h.errorId)}
                              className="pointer-events-auto absolute rounded-sm transition-all"
                              style={{
                                left: h.left - 2,
                                top: h.top - 1,
                                width: h.width + 4,
                                height: h.height + 2,
                                background: severityFill(h.severity, active),
                                boxShadow: active
                                  ? `0 0 0 2px ${severityRing(h.severity)}`
                                  : `inset 0 -2px 0 ${severityRing(h.severity)}`,
                              }}
                              title={`Issue #${h.errorId}`}
                            />
                          )
                        })}
                      </div>

                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/50 text-[10px] text-white/80 font-mono z-20">
                        {pageNumber}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Document>
          )}
        </div>

        {markerPercents.length > 0 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-30"
            style={{ right: SCROLLBAR_WIDTH, width: 16 }}
          >
            {markerPercents.map((marker) => (
              <button
                key={marker.id}
                type="button"
                title={`${marker.severity} on page ${marker.page}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onSelectError?.(marker.id)
                }}
                className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md hover:scale-110 cursor-pointer ${
                  marker.severity === 'CRITICAL'
                    ? 'bg-brand-acc1'
                    : marker.severity === 'WARNING'
                      ? 'bg-brand-acc2'
                      : 'bg-slate-500'
                } ${
                  activeErrorId === marker.id ? 'ring-2 ring-white/60 scale-110' : ''
                }`}
                style={{ top: `${marker.percent}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 z-20 flex items-center justify-between px-2 md:px-4 py-1.5 md:py-2.5 bg-black/40 border-t border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-0.5 md:gap-1">
          <button
            type="button"
            onClick={handlePrev}
            disabled={safePage <= 1}
            className="p-1.5 rounded text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] md:text-xs px-1.5 md:px-2 text-white/60 font-mono">
            {safePage}/{totalPages}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={safePage >= totalPages}
            className="p-1.5 rounded text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onZoomChange(Math.max(MIN_ZOOM, +(zoom - ZOOM_STEP).toFixed(1)))
            }
            disabled={zoom <= MIN_ZOOM}
            className="p-1.5 rounded text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs px-1.5 text-white/50 font-mono min-w-[3rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() =>
              onZoomChange(Math.min(MAX_ZOOM, +(zoom + ZOOM_STEP).toFixed(1)))
            }
            disabled={zoom >= MAX_ZOOM}
            className="p-1.5 rounded text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
