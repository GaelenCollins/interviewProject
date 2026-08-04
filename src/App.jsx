import { useCallback, useEffect, useRef, useState } from 'react'
import Header from './components/Header'
import FileUpload from './components/FileUpload'
import Workspace from './components/Workspace'
import AiAssistant from './components/AiAssistant'
import MarginCalculatorModal from './components/MarginCalculatorModal'
import ToolUsageDashboard from './components/ToolUsageDashboard'
import { AI_RESPONSES } from './data/mockData'
import { runCheckStream, sendChatStream, streamEmailDraft } from './api/client'
import { computeVerdict } from './utils/auditEngine'
import {
  buildOutlookDraft,
  downloadOutlookDraft,
  generateDeterministicEmail,
  parseLlmEmailDraft,
} from './utils/outlookDraftBuilder'
import {
  detectAppIntent,
  messageForAppIntent,
} from './utils/appIntents'

export default function App() {
  const [appTab, setAppTab] = useState('checker')
  const [hasUploadedFiles, setHasUploadedFiles] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [checkStatus, setCheckStatus] = useState('')
  const [checkError, setCheckError] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [excelFile, setExcelFile] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [activeErrorId, setActiveErrorId] = useState(null)
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)
  const [emailExport, setEmailExport] = useState(null)
  const emailExportBusy = useRef(false)
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: AI_RESPONSES.welcome },
  ])
  const [errors, setErrors] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [quoteNumber, setQuoteNumber] = useState(null)
  const [meanMarginPercent, setMeanMarginPercent] = useState(null)
  const [activePage, setActivePage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [errorFocusKey, setErrorFocusKey] = useState(0)
  const [isChatBusy, setIsChatBusy] = useState(false)
  const [exportRequestKey, setExportRequestKey] = useState(0)

  useEffect(() => {
    if (!pdfFile) {
      setPdfUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(pdfFile)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pdfFile])

  const appendAssistant = (text) => {
    setChatMessages((prev) => [...prev, { role: 'assistant', text }])
  }

  const upsertStreamingAssistant = (text, done = false) => {
    setChatMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        next[next.length - 1] = { role: 'assistant', text, streaming: !done }
        return next
      }
      return [...next, { role: 'assistant', text, streaming: !done }]
    })
  }

  const handleFilesReady = useCallback(async ({ pdfFile: nextPdf, excelFile: nextExcel }) => {
    setCheckError('')
    setIsChecking(true)
    setCheckStatus('Opening the Dynamix Customer Quote (PDF)…')
    setPdfFile(nextPdf)
    setExcelFile(nextExcel)
    setHasUploadedFiles(true)
    setErrors([])
    setAnalysis(null)
    setQuoteNumber(null)
    setMeanMarginPercent(null)
    setActiveErrorId(null)
    setEmailExport(null)
    setActivePage(1)
    setZoom(1)
    setChatMessages([
      {
        role: 'assistant',
        text: 'Got both files. The Dynamix Customer Quote (PDF) is up on the left while I run the check. You can switch to the Distributor Quote (Excel Source) anytime.',
        streaming: true,
      },
    ])

    const applyCheckFindings = (payload) => {
      if (!payload) return
      if (payload.sessionId) setSessionId(payload.sessionId)
      if (payload.errors) {
        setErrors(payload.errors.map((e) => ({ ...e, hidden: false })))
      }
      if (payload.analysis) setAnalysis(payload.analysis)
      setQuoteNumber(
        payload.meta?.customer?.quoteNumber ||
          payload.pdfData?.quoteNumber ||
          null,
      )
      setMeanMarginPercent(
        payload.meta?.meanMarginPercent ??
          payload.analysis?.meanMarginRounded ??
          null,
      )
      setActiveErrorId(null)
    }

    try {
      const result = await runCheckStream({
        pdfFile: nextPdf,
        excelFile: nextExcel,
        onProgress: (payload) => {
          const { stage, message } = payload || {}
          if (stage === 'findings') {
            applyCheckFindings(payload)
            if (message) {
              setCheckStatus(message)
              upsertStreamingAssistant(message, false)
            }
            return
          }
          if (!message) return
          if (stage === 'summary') {
            setCheckStatus('Writing analysis…')
            upsertStreamingAssistant(message, false)
            return
          }
          setCheckStatus(message)
          upsertStreamingAssistant(message, false)
        },
      })

      // Final payload may refine meta; findings already painted earlier.
      applyCheckFindings(result)

      const note =
        result.warnings?.length > 0
          ? `\n\nNotes:\n${result.warnings.map((w) => `  • ${w}`).join('\n')}`
          : ''

      upsertStreamingAssistant(
        `${result.summary || 'Check finished.'}${note}`,
        true,
      )
    } catch (err) {
      const msg = err.message || 'Check failed'
      setCheckError(msg)
      setSessionId(null)
      setErrors([
        {
          id: 1,
          type: /unrecognized|not match|sales quote/i.test(msg)
            ? 'UNRECOGNIZED_DOCUMENT'
            : /project mismatch|0 matching|unrelated/i.test(msg)
              ? 'PROJECT_MISMATCH'
              : 'CHECK_FAILED',
          severity: 'CRITICAL',
          message: msg.startsWith('CRITICAL') ? msg : `CRITICAL: ${msg}`,
          sku: null,
          page: 1,
          hidden: false,
          actions: [],
        },
      ])
      const isDocIssue =
        /unrecognized|password|scanned|encrypted|15MB|project mismatch|unrelated|sales quote|SNAP/i.test(
          msg,
        )
      upsertStreamingAssistant(
        isDocIssue
          ? msg
          : `Something went wrong: ${msg}. Make sure the API is running and ANTHROPIC_API_KEY is set.`,
        true,
      )
    } finally {
      setIsChecking(false)
      setCheckStatus('')
    }
  }, [])

  const handleNewCheck = () => {
    setHasUploadedFiles(false)
    setIsChecking(false)
    setCheckStatus('')
    setCheckError('')
    setSessionId(null)
    setPdfFile(null)
    setExcelFile(null)
    setActiveErrorId(null)
    setActivePage(1)
    setZoom(1)
    setErrors([])
    setAnalysis(null)
    setQuoteNumber(null)
    setMeanMarginPercent(null)
    setEmailExport(null)
    setChatMessages([{ role: 'assistant', text: AI_RESPONSES.welcome }])
  }

  const askAssistant = async ({ text, mode = 'chat', errorId = null }) => {
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: '', streaming: true },
    ])

    if (!sessionId) {
      upsertStreamingAssistant(
        'Upload a Distributor Quote (Excel Source) and Dynamix Customer Quote (PDF) first so I have check context.',
        true,
      )
      return
    }

    setIsChatBusy(true)
    try {
      const hiddenErrorIds = errors
        .filter((e) => e.hidden)
        .map((e) => e.id)
      await sendChatStream({
        sessionId,
        message: text,
        mode,
        errorId,
        hiddenErrorIds,
        onToken: (_token, full) => upsertStreamingAssistant(full, false),
      })
      setChatMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, streaming: false }
        }
        return next
      })
    } catch (err) {
      upsertStreamingAssistant(`Couldn't answer that: ${err.message}`, true)
    } finally {
      setIsChatBusy(false)
    }
  }

  const handleSendChat = (text) => {
    if (isChatBusy || isChecking) return

    // Start in-app actions from chat (same as clicking header / toolbar controls).
    const intent = detectAppIntent(text)
    if (intent) {
      const reply = messageForAppIntent(intent, { hasPdf: Boolean(pdfFile) })
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', text },
        { role: 'assistant', text: reply },
      ])
      if (intent === 'email' && pdfFile) {
        handleEmailDownload()
      } else if (intent === 'calculator') {
        setIsCalculatorOpen(true)
      } else if (intent === 'annotated_pdf' && pdfFile) {
        setExportRequestKey((k) => k + 1)
      }
      return
    }

    askAssistant({ text, mode: 'chat' })
  }

  const handleSelectError = (id) => {
    const error = errors.find((e) => e.id === id && !e.hidden)
    if (!error) return
    setActiveErrorId(id)
    const pdfPage =
      error.page ||
      (Array.isArray(error.pdfPages) && error.pdfPages[0]) ||
      1
    setActivePage(pdfPage)
    setErrorFocusKey((key) => key + 1)
  }

  const handleErrorAction = (action, errorFromCard) => {
    const error =
      errorFromCard ||
      errors.find((e) => e.actions?.some((a) => a.label === action.label))
    if (error) {
      setActiveErrorId(error.id)
      const pdfPage =
        error.page ||
        (Array.isArray(error.pdfPages) && error.pdfPages[0]) ||
        1
      setActivePage(pdfPage)
      setErrorFocusKey((key) => key + 1)
    }
    // Always name the source issue so chat stays anchored to this card.
    const issueBits = [
      error?.id != null ? `issue #${error.id}` : null,
      error?.type || null,
      error?.sku || null,
      error?.severity || null,
    ].filter(Boolean)
    const issueRef = issueBits.length ? issueBits.join(' · ') : 'the selected issue'
    const base = String(action.query || action.label || '').trim()
    const text = base
      ? `Regarding ${issueRef}: ${base}`
      : `Tell me about ${issueRef}.`
    askAssistant({
      text,
      mode: 'quick',
      errorId: error?.id ?? null,
    })
  }

  const handleIgnoreError = (id) => {
    setErrors((prev) =>
      prev.map((e) => (e.id === id ? { ...e, hidden: true } : e)),
    )
    if (activeErrorId === id) setActiveErrorId(null)
  }

  const handleUnignoreError = (id) => {
    setErrors((prev) =>
      prev.map((e) => (e.id === id ? { ...e, hidden: false } : e)),
    )
    const error = errors.find((e) => e.id === id)
    setActiveErrorId(id)
    if (error) setActivePage(error.page || 1)
    setErrorFocusKey((key) => key + 1)
  }

  const handleEmailDownload = useCallback(async () => {
    if (!pdfFile || emailExportBusy.current) return
    emailExportBusy.current = true

    const activeErrors = (errors || []).filter((e) => !e.hidden)
    const hiddenErrorIds = (errors || [])
      .filter((e) => e.hidden)
      .map((e) => e.id)
    const pdfName = pdfFile.name || 'customer_quote.pdf'
    const quoteRef =
      quoteNumber ||
      String(pdfName).replace(/\.pdf$/i, '') ||
      'Quote'
    const safeRef = String(quoteRef)
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80)
    const downloadName = `Quote_Revision_${safeRef || 'Draft'}.eml`
    const fallbackBody = generateDeterministicEmail({
      errors: activeErrors,
      pdfFileName: pdfName,
      quoteNumber: quoteRef,
    })

    setEmailExport({
      phase: 'drafting',
      progress: 12,
        message: 'Drafting your email…',
        fileName: downloadName,
      })

    let subject = `Quote review: ${quoteRef}`
    let body = fallbackBody

    try {
      if (sessionId) {
        try {
          const { answer } = await streamEmailDraft({
            sessionId,
            hiddenErrorIds,
            onToken: () => {
              setEmailExport((prev) =>
                prev
                  ? {
                      ...prev,
                      progress: Math.min(55, (prev.progress || 12) + 2),
                      message: 'Drafting your email…',
                    }
                  : prev,
              )
            },
          })
          const parsed = parseLlmEmailDraft(answer)
          if (parsed.subject) subject = parsed.subject
          if (parsed.body) body = parsed.body
        } catch {
          // Keep deterministic fallback
        }
      }

      setEmailExport({
        phase: 'building',
        progress: 70,
        message: excelFile
          ? 'Building annotated PDF, attaching Excel, and preparing download…'
          : 'Building annotated PDF and download…',
        fileName: downloadName,
      })

      const pdfArrayBuffer = await pdfFile.arrayBuffer()
      const excelArrayBuffer = excelFile ? await excelFile.arrayBuffer() : null
      const blob = await buildOutlookDraft({
        to: '',
        subject,
        bodyText: body,
        pdfArrayBuffer,
        auditResults: {
          errors: activeErrors,
          verdict: computeVerdict(activeErrors),
        },
        fileName: pdfName,
        excelArrayBuffer,
        excelFileName: excelFile?.name || 'distributor_quote.xlsx',
        excelContentType: excelFile?.type || '',
      })

      downloadOutlookDraft(blob, downloadName)

      setEmailExport({
        phase: 'done',
        progress: 100,
        message: `Download ready — open ${downloadName} to add the recipient in your email app and send.`,
        fileName: downloadName,
      })
    } catch (err) {
      setEmailExport({
        phase: 'error',
        progress: 100,
        message: err?.message || 'Could not prepare the email download.',
        fileName: downloadName,
      })
    } finally {
      emailExportBusy.current = false
    }
  }, [pdfFile, excelFile, errors, sessionId, quoteNumber])

  const emailBannerTone =
    emailExport?.phase === 'error'
      ? 'bg-brand-acc1 border-brand-acc1 text-white'
      : emailExport?.phase === 'done'
        ? 'bg-brand-acc3 border-brand-acc3 text-brand-main'
        : 'bg-brand-secondary border-brand-secondary text-brand-main'

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-brand-main">
      <Header
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        onOpenEmail={handleEmailDownload}
        emailDisabled={!pdfFile || isChecking || emailExport?.phase === 'drafting' || emailExport?.phase === 'building'}
        showNewCheck={hasUploadedFiles}
        onNewCheck={handleNewCheck}
        appTab={appTab}
        onToggleAppTab={() =>
          setAppTab((t) => (t === 'dashboard' ? 'checker' : 'dashboard'))
        }
      />

      {emailExport ? (
        <div
          className={`shrink-0 border-b px-3 md:px-5 py-1.5 md:py-2.5 ${emailBannerTone}`}
          role="status"
        >
          <div className="flex items-center justify-between gap-3 mb-1 md:mb-1.5">
            <p className="text-[11px] md:text-xs font-medium leading-snug line-clamp-2 md:line-clamp-none">
              {emailExport.message}
            </p>
            {emailExport.phase === 'done' || emailExport.phase === 'error' ? (
              <button
                type="button"
                onClick={() => setEmailExport(null)}
                className={`text-[11px] font-semibold shrink-0 underline-offset-2 hover:underline ${
                  emailExport.phase === 'error'
                    ? 'text-white/90 hover:text-white'
                    : 'text-brand-main/80 hover:text-brand-main'
                }`}
              >
                Dismiss
              </button>
            ) : null}
          </div>
          <div
            className={`h-1.5 rounded-full overflow-hidden ${
              emailExport.phase === 'error' ? 'bg-white/25' : 'bg-brand-main/15'
            }`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                emailExport.phase === 'error'
                  ? 'bg-white'
                  : emailExport.phase === 'done'
                    ? 'bg-brand-main'
                    : 'bg-brand-main'
              }`}
              style={{ width: `${emailExport.progress || 0}%` }}
            />
          </div>
        </div>
      ) : null}

      {appTab === 'dashboard' ? (
        <div className="flex-1 min-h-0 overflow-hidden bg-slate-100">
          <ToolUsageDashboard />
        </div>
      ) : hasUploadedFiles ? (
        <Workspace
          pdfFile={pdfFile}
          pdfUrl={pdfUrl}
          excelFile={excelFile}
          errors={errors}
          activeErrorId={activeErrorId}
          errorFocusKey={errorFocusKey}
          analysis={analysis}
          meanMarginPercent={meanMarginPercent}
          activePage={activePage}
          zoom={zoom}
          chatMessages={chatMessages}
          onPageChange={setActivePage}
          onZoomChange={setZoom}
          onSelectError={handleSelectError}
          onErrorAction={handleErrorAction}
          onIgnoreError={handleIgnoreError}
          onUnignoreError={handleUnignoreError}
          onSendChat={handleSendChat}
          chatDisabled={isChatBusy || isChecking}
          isChecking={isChecking}
          checkStatus={checkStatus}
          exportRequestKey={exportRequestKey}
        />
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          <FileUpload
            onFilesReady={handleFilesReady}
            isChecking={isChecking}
            checkError={checkError}
          />
          <div className="flex flex-col overflow-hidden shrink-0 w-full md:w-[260px] h-[40%] md:h-auto border-t md:border-t-0 border-white/10">
            <AiAssistant
              messages={chatMessages}
              onSend={handleSendChat}
              disabled={isChatBusy || isChecking}
              isChecking={isChecking}
              statusLine={checkStatus}
            />
          </div>
        </div>
      )}

      {isCalculatorOpen && (
        <MarginCalculatorModal onClose={() => setIsCalculatorOpen(false)} />
      )}
    </div>
  )
}
