import PdfViewer from './PdfViewer'
import ErrorFeed from './ErrorFeed'
import AiAssistant from './AiAssistant'

export default function Workspace({
  pdfFile,
  pdfUrl,
  excelFile,
  errors,
  activeErrorId,
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
}) {
  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Column 1 — PDF Viewer (~40%) */}
      <div className="flex flex-col min-h-0 overflow-hidden w-[40%] min-w-[300px] border-r border-white/10">
        <div className="shrink-0 px-4 py-2 bg-black/20 border-b border-white/[0.06] flex items-center justify-between gap-2">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-brand-secondary/20 text-brand-secondary">
            Customer PDF
          </span>
          {excelFile && (
            <span
              className="text-[10px] text-white/40 font-mono truncate max-w-[45%]"
              title={excelFile.name}
            >
              Excel: {excelFile.name}
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PdfViewer
            pdfFile={pdfFile}
            pdfUrl={pdfUrl}
            activePage={activePage}
            onPageChange={onPageChange}
            activeErrorId={activeErrorId}
            errors={errors}
            zoom={zoom}
            onZoomChange={onZoomChange}
            onSelectError={onSelectError}
          />
        </div>
      </div>

      {/* Column 2 — Error Feed (~35%) */}
      <div className="flex flex-col overflow-hidden w-[35%] min-w-[260px]">
        <ErrorFeed
          errors={errors}
          activeErrorId={activeErrorId}
          onSelectError={onSelectError}
          onAction={onErrorAction}
          onIgnore={onIgnoreError}
          onUnignore={onUnignoreError}
        />
      </div>

      {/* Column 3 — AI Assistant (~25%) */}
      <div className="flex flex-col overflow-hidden w-[25%] min-w-[220px]">
        <AiAssistant messages={chatMessages} onSend={onSendChat} />
      </div>
    </div>
  )
}
