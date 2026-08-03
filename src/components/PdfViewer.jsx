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
import { findHighlightRects } from '../utils/pdfHighlights'
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
}) {
  const [numPages, setNumPages] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [markerPercents, setMarkerPercents] = useState([])
  const [pageHighlights, setPageHighlights] = useState({})
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const scrollRef = useRef(null)
  const pageRefs = useRef({})
  const highlightAnchorRefs = useRef({})
  const suppressScrollSync = useRef(false)

  const totalPages = numPages || 1
  const safePage = Math.min(Math.max(activePage, 1), totalPages)
  const renderScale = zoom * BASE_SCALE

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
      // Schedule issues: highlightTerms already scoped to problem years + payment amounts
      const terms = error.highlightTerms?.length
        ? error.highlightTerms
        : [error.sku].filter(Boolean)
      const rects = findHighlightRects(el, terms)
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

  const measureMarkers = () => {
    const root = scrollRef.current
    if (!root || !numPages) return

    const contentHeight = root.scrollHeight
    if (contentHeight <= 0) return

    const next = visibleErrors
      .filter((error) => error.page >= 1 && error.page <= numPages)
      .map((error) => {
        const anchor = highlightAnchorRefs.current[error.id]
        const el = pageRefs.current[error.page]
        if (anchor && root.contains(anchor)) {
          const top = anchor.offsetTop + (el?.offsetTop || 0) + anchor.offsetHeight / 2
          return {
            id: error.id,
            page: error.page,
            severity: error.severity,
            percent: Math.min(98, Math.max(1, (top / contentHeight) * 100)),
          }
        }
        if (!el) {
          return {
            id: error.id,
            page: error.page,
            severity: error.severity,
            percent: ((error.page - 0.5) / numPages) * 100,
          }
        }
        const top = el.offsetTop + el.offsetHeight * 0.15
        return {
          id: error.id,
          page: error.page,
          severity: error.severity,
          percent: Math.min(98, Math.max(1, (top / contentHeight) * 100)),
        }
      })

    setMarkerPercents(next)
  }

  useEffect(() => {
    measureMarkers()
    const root = scrollRef.current
    if (!root) return undefined

    const onResize = () => {
      measureAllHighlights()
      measureMarkers()
    }
    window.addEventListener('resize', onResize)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(root)

    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, visibleErrors, zoom, pdfUrl, pageHighlights])

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

  return (
    <div className="flex flex-col h-full min-h-0 bg-brand-main overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 shrink-0 bg-black/25 border-b border-white/10">
        <span
          className="text-xs font-medium text-white/50 font-mono truncate min-w-0"
          title={pdfFile?.name}
        >
          {pdfFile?.name || 'customer_quote.pdf'}
        </span>
        <button
          type="button"
          onClick={handleExportAnnotated}
          disabled={!pdfFile || exporting}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-brand-secondary/20 text-brand-secondary hover:bg-brand-secondary/30 disabled:opacity-40 transition-colors"
          title="Export Annotated PDF"
          aria-label="Export Annotated PDF"
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? 'Exporting…' : 'Export Annotated PDF'}
        </button>
      </div>
      {exportError ? (
        <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand-acc1 bg-brand-acc1/10 border-b border-brand-acc1/30">
          {exportError}
        </div>
      ) : null}

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="pdf-scroll absolute inset-0 overflow-y-scroll overflow-x-auto p-4"
          style={{ scrollbarGutter: 'stable' }}
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
                <div className="bg-white rounded shadow-2xl w-[420px] min-h-[540px] mx-auto flex items-center justify-center text-sm text-slate-500">
                  Loading PDF…
                </div>
              }
              error={
                <div className="bg-white rounded shadow-2xl w-[420px] min-h-[200px] mx-auto flex items-center justify-center text-sm text-brand-acc1 px-6 text-center">
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
              <div className="mx-auto w-max flex flex-col gap-4">
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
                      className="relative"
                    >
                      {pageErrors.map((error, idx) => (
                        <button
                          key={`badge-${error.id}`}
                          type="button"
                          onClick={() => onSelectError?.(error.id)}
                          className={`absolute -left-2 z-20 w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold font-mono shadow-lg transition-transform ${
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
                          style={{ top: `${12 + idx * 28}px` }}
                          title={`${error.severity} #${error.id}${error.sku ? ` · ${error.sku}` : ''}`}
                        >
                          {error.id}
                        </button>
                      ))}

                      <Page
                        pageNumber={pageNumber}
                        scale={renderScale}
                        className="shadow-2xl rounded overflow-hidden bg-white"
                        renderTextLayer
                        renderAnnotationLayer
                        onRenderSuccess={() => {
                          // Text layer paints slightly after canvas
                          window.requestAnimationFrame(() => {
                            measureHighlightsForPage(pageNumber)
                            measureMarkers()
                          })
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
                className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md transition-transform hover:scale-125 cursor-pointer ${
                  marker.severity === 'CRITICAL'
                    ? 'bg-brand-acc1'
                    : marker.severity === 'WARNING'
                      ? 'bg-brand-acc2'
                      : 'bg-slate-500'
                } ${
                  activeErrorId === marker.id
                    ? 'scale-125 ring-2 ring-white/60'
                    : ''
                }`}
                style={{ top: `${marker.percent}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 z-20 flex items-center justify-between px-4 py-2.5 bg-black/40 border-t border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            disabled={safePage <= 1}
            className="p-1.5 rounded text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs px-2 text-white/60 font-mono">
            Page {safePage} of {totalPages}
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
