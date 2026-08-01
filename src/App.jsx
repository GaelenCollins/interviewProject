import { useCallback, useEffect, useState } from 'react'
import Header from './components/Header'
import FileUpload from './components/FileUpload'
import Workspace from './components/Workspace'
import AiAssistant from './components/AiAssistant'
import MarginCalculatorModal from './components/MarginCalculatorModal'
import { AI_RESPONSES } from './data/mockData'
import { runCheckStream, sendChatStream } from './api/client'

export default function App() {
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
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: AI_RESPONSES.welcome },
  ])
  const [errors, setErrors] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [meanMarginPercent, setMeanMarginPercent] = useState(null)
  const [activePage, setActivePage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [errorFocusKey, setErrorFocusKey] = useState(0)
  const [isChatBusy, setIsChatBusy] = useState(false)

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
    setMeanMarginPercent(null)
    setActiveErrorId(null)
    setActivePage(1)
    setZoom(1)
    setChatMessages([
      {
        role: 'assistant',
        text: 'Got both files. The Dynamix Customer Quote (PDF) is up on the left while I run the check. You can switch to the Distributor Quote (Excel Source) anytime.',
        streaming: true,
      },
    ])

    try {
      const result = await runCheckStream({
        pdfFile: nextPdf,
        excelFile: nextExcel,
        onProgress: ({ stage, message }) => {
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

      const nextErrors = (result.errors || []).map((e) => ({ ...e, hidden: false }))
      setSessionId(result.sessionId)
      setErrors(nextErrors)
      setAnalysis(result.analysis || null)
      setMeanMarginPercent(
        result.meta?.meanMarginPercent ?? result.analysis?.meanMarginRounded ?? null,
      )

      setActiveErrorId(null)

      const note =
        result.warnings?.length > 0
          ? `\n\nNotes:\n${result.warnings.map((w) => `  • ${w}`).join('\n')}`
          : ''

      upsertStreamingAssistant(
        `${result.summary || 'Check finished.'}${note}`,
        true,
      )
    } catch (err) {
      setCheckError(err.message || 'Check failed')
      upsertStreamingAssistant(
        `Something went wrong: ${err.message || 'Unknown error'}. Make sure the API is running and ANTHROPIC_API_KEY is set.`,
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
    setMeanMarginPercent(null)
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
      await sendChatStream({
        sessionId,
        message: text,
        mode,
        errorId,
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
    askAssistant({ text, mode: 'chat' })
  }

  const handleSelectError = (id) => {
    const error = errors.find((e) => e.id === id && !e.hidden)
    if (!error) return
    setActiveErrorId(id)
    setActivePage(error.page || 1)
    setErrorFocusKey((key) => key + 1)
  }

  const handleErrorAction = (action, errorFromCard) => {
    const error =
      errorFromCard ||
      errors.find((e) => e.actions?.some((a) => a.label === action.label))
    if (error) {
      setActiveErrorId(error.id)
      setActivePage(error.page || 1)
      setErrorFocusKey((key) => key + 1)
    }
    askAssistant({
      text: action.query || action.label,
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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-brand-main">
      <Header
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        showNewCheck={hasUploadedFiles}
        onNewCheck={handleNewCheck}
      />

      {hasUploadedFiles ? (
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
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <FileUpload
            onFilesReady={handleFilesReady}
            isChecking={isChecking}
            checkError={checkError}
          />
          <div className="flex flex-col overflow-hidden shrink-0 w-[260px]">
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
