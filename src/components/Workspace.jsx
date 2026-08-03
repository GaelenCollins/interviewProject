import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import PdfViewer from './PdfViewer'
import ExcelViewer from './ExcelViewer'
import ErrorFeed from './ErrorFeed'
import AiAssistant from './AiAssistant'
import StatusBanner from './StatusBanner'
import { CUSTOMER_QUOTE, DISTRIBUTOR_QUOTE } from '../constants/labels'

export default function Workspace({
  pdfFile,
  pdfUrl,
  excelFile,
  errors,
  activeErrorId,
  errorFocusKey,
  analysis,
  meanMarginPercent,
  activePage,
  zoom,
  chatMessages,
  onPageChange,
  onZoomChange,
  onSelectError,
  onErrorAction,
  onIgnoreError,
  onUnignoreError,
  onSendChat,
  chatDisabled = false,
  isChecking = false,
  checkStatus = '',
  exportRequestKey = 0,
}) {
  const [docView, setDocView] = useState('pdf') // pdf | excel
  const lastSwitchedFocusRef = useRef(0)
  const lastExportKeyRef = useRef(0)

  // Chat / UI can request annotated PDF export — ensure PDF view is active.
  useEffect(() => {
    if (!exportRequestKey || exportRequestKey === lastExportKeyRef.current) return
    lastExportKeyRef.current = exportRequestKey
    setDocView('pdf')
  }, [exportRequestKey])

  // When user picks an issue, jump to the view that can show it.
  // PDF-only → PDF; Excel-only → Excel. Mixed stays on current view.
  useEffect(() => {
    if (!errorFocusKey || activeErrorId == null) return
    if (errorFocusKey === lastSwitchedFocusRef.current) return
    lastSwitchedFocusRef.current = errorFocusKey
    const error = errors.find((e) => e.id === activeErrorId && !e.hidden)
    if (!error) return
    const hasPdf = error.page != null || (error.pdfPages || []).length > 0
    const hasExcelSheet = Boolean(error.sheetName) || error.excelRow != null
    // Billing schedule issues live on the PDF — open PDF, not Excel.
    const isScheduleIssue = /PAYMENT_SCHEDULE|CASH.?FLOW|SCHEDULE_UNBALANCED|PENNY_SCHEDULE/i.test(
      error.type || '',
    )
    // Notes / omitted-terms issues open Excel Notes.
    const preferExcel =
      !isScheduleIssue &&
      (/OMITTED_DISTRIBUTOR|UNCAPTURED_PASSTHROUGH/i.test(error.type || '') ||
        /notes/i.test(error.sheetName || ''))
    if (isScheduleIssue && hasPdf) setDocView('pdf')
    else if (preferExcel && hasExcelSheet) setDocView('excel')
    else if (hasPdf && !hasExcelSheet) setDocView('pdf')
    else if (hasExcelSheet && !hasPdf) setDocView('excel')
  }, [errorFocusKey, activeErrorId, errors])

  const hasFindings = (errors || []).length > 0
  // Keep the chat analysis streaming, but unblock findings as soon as they arrive.
  const showCheckChrome = isChecking && !hasFindings

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {hasFindings ? (
        <StatusBanner errors={errors} />
      ) : null}
      {isChecking && (
        <div className="shrink-0 px-4 py-2.5 bg-brand-secondary text-brand-main flex items-center gap-3 border-b border-brand-main/15">
          <div className="w-4 h-4 rounded-full border-2 border-brand-main/30 border-t-brand-main animate-spin" />
          <div className="text-sm font-medium truncate">
            {hasFindings
              ? checkStatus || 'Writing analysis…'
              : checkStatus || 'Running quote check…'}
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 overflow-hidden w-[40%] min-w-[300px] border-r border-white/10">
          <div className="shrink-0 px-3 py-2 bg-black/20 border-b border-white/[0.06] flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-black/30 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setDocView('pdf')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                  docView === 'pdf'
                    ? 'bg-brand-secondary text-brand-main'
                    : 'text-white/55 hover:text-white/80'
                }`}
                title={CUSTOMER_QUOTE}
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                type="button"
                onClick={() => setDocView('excel')}
                disabled={!excelFile}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all disabled:opacity-40 ${
                  docView === 'excel'
                    ? 'bg-brand-acc3 text-brand-main'
                    : 'text-white/55 hover:text-white/80'
                }`}
                title={DISTRIBUTOR_QUOTE}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </button>
            </div>
            <span className="text-[11px] text-white/45 truncate min-w-0">
              {docView === 'pdf' ? CUSTOMER_QUOTE : DISTRIBUTOR_QUOTE}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {docView === 'excel' ? (
              <ExcelViewer
                excelFile={excelFile}
                errors={errors}
                activeErrorId={activeErrorId}
                errorFocusKey={errorFocusKey}
                onSelectError={onSelectError}
              />
            ) : (
              <PdfViewer
                pdfFile={pdfFile}
                pdfUrl={pdfUrl}
                activePage={activePage}
                onPageChange={onPageChange}
                activeErrorId={activeErrorId}
                errorFocusKey={errorFocusKey}
                errors={errors}
                zoom={zoom}
                onZoomChange={onZoomChange}
                onSelectError={onSelectError}
                exportRequestKey={exportRequestKey}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden w-[35%] min-w-[260px] relative">
          {showCheckChrome && (
            <div className="absolute inset-0 z-10 bg-slate-100/70 backdrop-blur-[1px] flex items-center justify-center p-6">
              <div className="text-center space-y-2">
                <div className="w-8 h-8 mx-auto rounded-full border-2 border-brand-main/20 border-t-brand-main animate-spin" />
                <div className="text-sm font-medium text-brand-main">
                  Checking quotes
                </div>
                <div className="text-xs text-slate-500 max-w-[220px]">
                  {checkStatus || 'Parsing files and running deterministic checks…'}
                </div>
              </div>
            </div>
          )}
          <ErrorFeed
            errors={errors}
            activeErrorId={activeErrorId}
            analysis={analysis}
            meanMarginPercent={meanMarginPercent}
            onSelectError={onSelectError}
            onAction={onErrorAction}
            onIgnore={onIgnoreError}
            onUnignore={onUnignoreError}
          />
        </div>

        <div className="flex flex-col overflow-hidden w-[25%] min-w-[220px]">
          <AiAssistant
            messages={chatMessages}
            onSend={onSendChat}
            disabled={chatDisabled}
            isChecking={isChecking}
            statusLine={checkStatus}
          />
        </div>
      </div>
    </div>
  )
}
