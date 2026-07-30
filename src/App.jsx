import { useEffect, useState } from 'react'
import Header from './components/Header'
import FileUpload from './components/FileUpload'
import Workspace from './components/Workspace'
import AiAssistant from './components/AiAssistant'
import MarginCalculatorModal from './components/MarginCalculatorModal'
import { AI_RESPONSES, MOCK_ERRORS } from './data/mockData'

function resolveAiResponse(text, responseKey) {
  if (responseKey && AI_RESPONSES[responseKey]) {
    return AI_RESPONSES[responseKey]
  }

  const lower = text.toLowerCase()
  if (lower.includes('margin') && lower.includes('breakdown')) {
    return AI_RESPONSES.margin_critical
  }
  if (lower.includes('caused') && lower.includes('margin')) {
    return AI_RESPONSES.cause_critical
  }
  if (
    lower.includes('changed') &&
    (lower.includes('rs-hw') || lower.includes('unit price') || lower.includes('margin'))
  ) {
    return AI_RESPONSES.fix_critical
  }
  if (lower.includes('caused') && lower.includes('coterm')) {
    return AI_RESPONSES.cause_warning
  }
  if (lower.includes('changed') && lower.includes('coterm')) {
    return AI_RESPONSES.fix_warning
  }
  return AI_RESPONSES.generic
}

export default function App() {
  const [hasUploadedFiles, setHasUploadedFiles] = useState(false)
  const [pdfFile, setPdfFile] = useState(null)
  const [excelFile, setExcelFile] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [activeErrorId, setActiveErrorId] = useState(null)
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: AI_RESPONSES.welcome },
  ])
  const [errors, setErrors] = useState(
    MOCK_ERRORS.map((e) => ({ ...e, hidden: false })),
  )
  const [activePage, setActivePage] = useState(1)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (!pdfFile) {
      setPdfUrl(null)
      return undefined
    }

    const url = URL.createObjectURL(pdfFile)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pdfFile])

  const handleFilesReady = ({ pdfFile: nextPdf, excelFile: nextExcel }) => {
    setPdfFile(nextPdf)
    setExcelFile(nextExcel)
    setHasUploadedFiles(true)
    setActiveErrorId(1)
    setActivePage(2)
    setZoom(1)
    setErrors(MOCK_ERRORS.map((e) => ({ ...e, hidden: false })))
    setChatMessages([
      {
        role: 'assistant',
        text: `Files uploaded and check complete.\n\n• PDF: **${nextPdf.name}**\n• Excel: **${nextExcel.name}**\n\nI've flagged **2 discrepancies**:\n\n1. CRITICAL: Zero-margin line item on page 2\n2. WARNING: Possible coterm date mismatch on page 1\n\nClick an error card action to dig in, or ask me anything.`,
      },
    ])
  }

  const handleNewCheck = () => {
    setHasUploadedFiles(false)
    setPdfFile(null)
    setExcelFile(null)
    setActiveErrorId(null)
    setActivePage(1)
    setZoom(1)
    setErrors(MOCK_ERRORS.map((e) => ({ ...e, hidden: false })))
    setChatMessages([{ role: 'assistant', text: AI_RESPONSES.welcome }])
  }

  const appendChat = (userText, responseKey) => {
    const reply = resolveAiResponse(userText, responseKey)
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', text: userText },
      { role: 'assistant', text: reply },
    ])
  }

  const handleSendChat = (text) => {
    appendChat(text)
  }

  const handleSelectError = (id) => {
    const error = errors.find((e) => e.id === id)
    if (!error) return
    setActiveErrorId(id)
    setActivePage(error.page)
  }

  const handleErrorAction = (action) => {
    const error = errors.find((e) =>
      e.actions.some((a) => a.label === action.label),
    )
    if (error) {
      setActiveErrorId(error.id)
      setActivePage(error.page)
    }
    appendChat(action.query, action.responseKey)
  }

  const handleIgnoreError = (id) => {
    setErrors((prev) =>
      prev.map((e) => (e.id === id ? { ...e, hidden: true } : e)),
    )
    if (activeErrorId === id) {
      setActiveErrorId(null)
    }
  }

  const handleUnignoreError = (id) => {
    setErrors((prev) =>
      prev.map((e) => (e.id === id ? { ...e, hidden: false } : e)),
    )
    const error = errors.find((e) => e.id === id)
    setActiveErrorId(id)
    if (error) setActivePage(error.page)
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
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <FileUpload onFilesReady={handleFilesReady} />
          <div className="flex flex-col overflow-hidden shrink-0 w-[260px]">
            <AiAssistant messages={chatMessages} onSend={handleSendChat} />
          </div>
        </div>
      )}

      {isCalculatorOpen && (
        <MarginCalculatorModal onClose={() => setIsCalculatorOpen(false)} />
      )}
    </div>
  )
}
