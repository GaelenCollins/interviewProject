import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, FileText, X, AlertCircle } from 'lucide-react'

function isPdf(file) {
  const name = file.name.toLowerCase()
  return file.type === 'application/pdf' || name.endsWith('.pdf')
}

function isExcel(file) {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type.includes('sheet') ||
    file.type.includes('excel') ||
    file.type === 'application/vnd.ms-excel'
  )
}

function classifyFiles(fileList) {
  let pdf = null
  let excel = null
  const skipped = []

  for (const file of fileList) {
    if (isPdf(file) && !pdf) pdf = file
    else if (isExcel(file) && !excel) excel = file
    else skipped.push(file.name)
  }

  return { pdf, excel, skipped }
}

export default function FileUpload({ onFilesReady }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [pdfFile, setPdfFile] = useState(null)
  const [excelFile, setExcelFile] = useState(null)
  const [error, setError] = useState('')

  const mergeSelection = (incoming) => {
    const { pdf, excel, skipped } = classifyFiles(incoming)
    setError('')

    if (pdf) setPdfFile(pdf)
    if (excel) setExcelFile(excel)

    if (!pdf && !excel) {
      setError('Please select a PDF and an Excel file (.xlsx / .xls).')
      return
    }

    if (skipped.length > 0) {
      setError(`Skipped unsupported file(s): ${skipped.join(', ')}`)
    }
  }

  const openPicker = () => {
    inputRef.current?.click()
  }

  const handleInputChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length) mergeSelection(files)
    // Allow re-selecting the same files later
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) mergeSelection(files)
  }

  const canStart = Boolean(pdfFile && excelFile)

  const handleStart = () => {
    if (!canStart) {
      setError('Select both a customer PDF and a distributor Excel file to continue.')
      openPicker()
      return
    }
    onFilesReady({ pdfFile, excelFile })
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-brand-main">
      <div className="text-center space-y-5 px-4 w-full max-w-lg">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleInputChange}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`transition-all rounded-2xl p-10 border-2 border-dashed ${
            dragging
              ? 'border-brand-secondary bg-brand-secondary/10'
              : 'border-brand-secondary/35 bg-white/[0.03]'
          }`}
        >
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-brand-secondary/15">
              <Upload className="w-8 h-8 text-brand-secondary" strokeWidth={1.5} />
            </div>
          </div>
          <p className="font-semibold mb-1 text-white/90 text-base">
            Upload files to get started!
          </p>
          <p className="text-xs mb-5 text-white/40">
            Select a distributor Excel quote and a customer PDF quote
          </p>
          <button
            type="button"
            className="px-8 py-2.5 rounded-lg font-semibold text-sm bg-brand-acc3 text-brand-main hover:opacity-90 active:scale-95 transition-all"
            onClick={openPicker}
          >
            Select files
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          <FileChip
            icon={<FileSpreadsheet className="w-4 h-4 text-brand-acc3" />}
            label="Distributor Excel"
            file={excelFile}
            emptyHint=".xlsx / .xls"
            onClear={() => setExcelFile(null)}
            onPick={openPicker}
          />
          <FileChip
            icon={<FileText className="w-4 h-4 text-brand-secondary" />}
            label="Customer PDF"
            file={pdfFile}
            emptyHint=".pdf"
            onClear={() => setPdfFile(null)}
            onPick={openPicker}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-left text-xs text-brand-acc2 bg-brand-acc2/10 border border-brand-acc2/30 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className="w-full sm:w-auto px-8 py-2.5 rounded-lg font-semibold text-sm bg-brand-secondary text-brand-main hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Run quote check
        </button>
      </div>
    </div>
  )
}

function FileChip({ icon, label, file, emptyHint, onClear, onPick }) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        file
          ? 'border-brand-secondary/40 bg-white/5'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 text-xs text-white/55">
          {icon}
          <span>{label}</span>
        </div>
        {file ? (
          <button
            type="button"
            onClick={onClear}
            className="text-white/40 hover:text-white transition-colors"
            aria-label={`Remove ${label}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onPick}
            className="text-[10px] text-brand-secondary hover:underline"
          >
            Choose
          </button>
        )}
      </div>
      <div className="text-xs font-medium text-white/85 truncate" title={file?.name}>
        {file ? file.name : emptyHint}
      </div>
    </div>
  )
}
