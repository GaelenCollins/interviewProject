import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

/** Previous 140% becomes the new 100% baseline. */
const BASE_SCALE = 1.4
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1
const SCROLLBAR_WIDTH = 12

export default function PdfViewer({
  pdfFile,
  pdfUrl,
  activePage,
  onPageChange,
  activeErrorId,
  errors = [],
  zoom,
  onZoomChange,
  onSelectError,
}) {
  const [numPages, setNumPages] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [markerPercents, setMarkerPercents] = useState([])

  const scrollRef = useRef(null)
  const pageRefs = useRef({})
  const suppressScrollSync = useRef(false)

  const totalPages = numPages || 1
  const safePage = Math.min(Math.max(activePage, 1), totalPages)
  const renderScale = zoom * BASE_SCALE

  const visibleErrors = errors.filter((e) => !e.hidden)

  useEffect(() => {
    setNumPages(null)
    setLoadError('')
    setMarkerPercents([])
    pageRefs.current = {}
  }, [pdfUrl])

  useEffect(() => {
    if (numPages && activePage > numPages) {
      onPageChange(numPages)
    }
  }, [numPages, activePage, onPageChange])

  const measureMarkers = () => {
    const root = scrollRef.current
    if (!root || !numPages) return

    const contentHeight = root.scrollHeight
    if (contentHeight <= 0) return

    const next = visibleErrors
      .filter((error) => error.page >= 1 && error.page <= numPages)
      .map((error) => {
        const el = pageRefs.current[error.page]
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

    const onResize = () => measureMarkers()
    window.addEventListener('resize', onResize)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(root)

    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, visibleErrors, zoom, pdfUrl])

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

  const isPageInView = (page) => {
    const el = pageRefs.current[page]
    const root = scrollRef.current
    if (!el || !root) return false
    const viewTop = root.scrollTop
    const viewBottom = viewTop + root.clientHeight
    const elTop = el.offsetTop
    const elBottom = elTop + el.offsetHeight
    return elTop < viewBottom - 80 && elBottom > viewTop + 80
  }

  useEffect(() => {
    if (!numPages) return
    // Jump only when the target page isn't already on screen (avoids fighting scroll)
    if (!isPageInView(safePage)) {
      scrollToPage(safePage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, numPages])

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

  return (
    <div className="flex flex-col h-full min-h-0 bg-brand-main overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 bg-black/25 border-b border-white/10 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
        </div>
        <span
          className="text-xs font-medium text-white/50 font-mono truncate px-2"
          title={pdfFile?.name}
        >
          {pdfFile?.name || 'customer_quote.pdf'}
        </span>
        <div className="w-12 shrink-0" />
      </div>

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
                    (e) => e.page === pageNumber,
                  )
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
                          key={error.id}
                          type="button"
                          onClick={() => onSelectError?.(error.id)}
                          className={`absolute -left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold font-mono shadow-lg transition-transform ${
                            error.severity === 'CRITICAL'
                              ? 'bg-brand-acc1'
                              : 'bg-brand-acc2'
                          } ${
                            activeErrorId === error.id
                              ? 'scale-125 ring-[3px] ring-white/30'
                              : 'hover:scale-110'
                          }`}
                          style={{ top: `${12 + idx * 28}px` }}
                          title={`${error.severity} error #${error.id}`}
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
                        onRenderSuccess={measureMarkers}
                      />
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/50 text-[10px] text-white/80 font-mono">
                        {pageNumber}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Document>
          )}
        </div>

        {/* Error markers over the always-visible scrollbar track */}
        {markerPercents.length > 0 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-20"
            style={{ right: 0, width: SCROLLBAR_WIDTH }}
            aria-hidden={false}
          >
            {markerPercents.map((marker) => (
              <button
                key={marker.id}
                type="button"
                title={`${marker.severity} on page ${marker.page}`}
                onClick={() => {
                  onSelectError?.(marker.id)
                  onPageChange(marker.page)
                }}
                className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white/80 shadow-md transition-transform hover:scale-125 ${
                  marker.severity === 'CRITICAL'
                    ? 'bg-brand-acc1'
                    : 'bg-brand-acc2'
                } ${
                  activeErrorId === marker.id
                    ? 'scale-125 ring-2 ring-white/50'
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
