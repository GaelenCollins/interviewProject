import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  FileSpreadsheet,
  FileText,
  TriangleAlert,
} from 'lucide-react'
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
  const [activeMobileTab, setActiveMobileTab] = useState('pdf') // pdf | findings | assistant
  const lastSwitchedFocusRef = useRef(0)
  const lastExportKeyRef = useRef(0)

  // Chat / UI can request annotated PDF export — ensure PDF view is active.
  useEffect(() => {
    if (!exportRequestKey || exportRequestKey === lastExportKeyRef.current) return
    lastExportKeyRef.current = exportRequestKey
    setDocView('pdf')
    setActiveMobileTab('pdf')
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
  const visibleFindingCount = (errors || []).filter((e) => !e.hidden).length
  // Keep the chat analysis streaming, but unblock findings as soon as they arrive.
  const showCheckChrome = isChecking && !hasFindings

  const handleSelectError = (id) => {
    onSelectError?.(id)
    // On phones, jump to the document so highlights are visible.
    setActiveMobileTab('pdf')
  }

  const handleAction = (action, error) => {
    // Quick prompts open the AI assistant chat on mobile.
    setActiveMobileTab('assistant')
    onErrorAction?.(action, error)
  }

  const mobileTabs = [
    { id: 'pdf', label: 'Quote', icon: FileText },
    { id: 'findings', label: 'Findings', icon: TriangleAlert, badge: visibleFindingCount },
    { id: 'assistant', label: 'AI', icon: Bot },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden max-w-[100vw]">
      {hasFindings ? (
        <StatusBanner errors={errors} />
      ) : null}
      {isChecking && (
        <div className="shrink-0 px-3 md:px-4 py-1.5 md:py-2.5 bg-brand-secondary text-brand-main flex items-center gap-2 md:gap-3 border-b border-brand-main/15">
          <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full border-2 border-brand-main/30 border-t-brand-main animate-spin shrink-0" />
          <div className="text-xs md:text-sm font-medium truncate">
            {hasFindings
              ? checkStatus || 'Writing analysis…'
              : checkStatus || 'Running quote check…'}
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden pb-[calc(3.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Document viewer */}
        <div
          className={`${
            activeMobileTab === 'pdf' ? 'flex' : 'hidden'
          } md:flex flex-col min-h-0 overflow-hidden flex-1 w-full md:w-[40%] md:min-w-[300px] md:flex-none border-r border-white/10`}
        >
          <div className="shrink-0 px-2 md:px-3 py-1 md:py-2 bg-black/20 border-b border-white/[0.06] flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-black/30 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setDocView('pdf')}
                className={`inline-flex items-center gap-1 px-2 py-1 md:px-2.5 md:py-1.5 rounded-md text-[11px] font-medium transition-all ${
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
                className={`inline-flex items-center gap-1 px-2 py-1 md:px-2.5 md:py-1.5 rounded-md text-[11px] font-medium transition-all disabled:opacity-40 ${
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
            <span className="text-[11px] text-white/45 truncate min-w-0 hidden md:inline">
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
                onSelectError={handleSelectError}
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
                onSelectError={handleSelectError}
                exportRequestKey={exportRequestKey}
              />
            )}
          </div>
        </div>

        {/* Findings */}
        <div
          className={`${
            activeMobileTab === 'findings' ? 'flex' : 'hidden'
          } md:flex flex-col overflow-hidden flex-1 w-full md:w-[35%] md:min-w-[260px] md:flex-none relative`}
        >
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
            onSelectError={handleSelectError}
            onAction={handleAction}
            onIgnore={onIgnoreError}
            onUnignore={onUnignoreError}
          />
        </div>

        {/* AI Assistant */}
        <div
          className={`${
            activeMobileTab === 'assistant' ? 'flex' : 'hidden'
          } md:flex flex-col overflow-hidden flex-1 w-full md:w-[25%] md:min-w-[220px] md:flex-none`}
        >
          <AiAssistant
            messages={chatMessages}
            onSend={onSendChat}
            disabled={chatDisabled}
            isChecking={isChecking}
            statusLine={checkStatus}
          />
        </div>
      </div>

      {/* Mobile bottom tab bar — compact for iPhone */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-brand-main border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile workspace views"
      >
        <div className="grid grid-cols-3 max-w-[430px] mx-auto">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon
            const active = activeMobileTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMobileTab(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                  active
                    ? 'text-brand-secondary bg-white/5 border-t-2 border-brand-secondary'
                    : 'text-white/55 border-t-2 border-transparent hover:text-white/80'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-4.5 h-4.5" strokeWidth={active ? 2.2 : 1.8} />
                <span>{tab.label}</span>
                {tab.badge > 0 ? (
                  <span className="absolute top-1 right-[calc(50%-1.5rem)] min-w-[1rem] h-[1rem] px-0.5 rounded-full bg-brand-acc1 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
