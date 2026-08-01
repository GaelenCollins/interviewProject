import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { FileSpreadsheet, StretchHorizontal } from 'lucide-react'
import { DISTRIBUTOR_QUOTE } from '../constants/labels'
import { excelColLetter } from '../utils/excelCols'

const MIN_COL_PX = 40
const MAX_COL_PX = 480
const DEFAULT_COL_PX = 96
const ROW_NUM_PX = 40
const DEFAULT_ROW_PX = 24
const MIN_ROW_PX = 16
const MAX_ROW_PX = 120

function colLetterToIndex(letter) {
  if (!letter) return null
  let n = 0
  const s = String(letter).toUpperCase()
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64)
  }
  return n - 1
}

function measureContentWidths(rows, colCount) {
  if (typeof document === 'undefined') {
    return Array.from({ length: colCount }, () => DEFAULT_COL_PX)
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
  const widths = []
  for (let c = 0; c < colCount; c++) {
    let max = ctx.measureText(excelColLetter(c) || 'A').width
    for (const row of rows) {
      const text = String(row?.[c] ?? '')
      if (!text) continue
      max = Math.max(max, ctx.measureText(text).width)
    }
    widths.push(Math.min(MAX_COL_PX, Math.max(MIN_COL_PX, Math.ceil(max) + 22)))
  }
  return widths
}

function severityClass(severity, active) {
  // Solid light fills so text stays readable on the dark panel behind the sheet
  if (severity === 'CRITICAL') {
    return active
      ? 'bg-[#fde8df] text-slate-900 ring-2 ring-brand-acc1'
      : 'bg-[#fff1eb] text-slate-900'
  }
  if (severity === 'WARNING') {
    return active
      ? 'bg-[#fff3cc] text-slate-900 ring-2 ring-brand-acc2'
      : 'bg-[#fff8e1] text-slate-900'
  }
  return active
    ? 'bg-slate-200 text-slate-900 ring-2 ring-slate-400'
    : 'bg-slate-100 text-slate-900'
}

function rowToneClass(hasErrors, active) {
  if (!hasErrors) return ''
  return active
    ? 'bg-[#fff4ee] text-slate-900'
    : 'bg-[#fffaf0] text-slate-900'
}

export default function ExcelViewer({
  excelFile,
  errors = [],
  activeErrorId,
  errorFocusKey = 0,
  onSelectError,
}) {
  const [sheetName, setSheetName] = useState('')
  const [sheetNames, setSheetNames] = useState([])
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState('')
  const [colWidths, setColWidths] = useState([])
  const [rowHeights, setRowHeights] = useState({})
  const cellRefs = useRef({})
  const lastFocusKeyRef = useRef(0)
  const dragRef = useRef(null)

  const visibleErrors = useMemo(
    () => errors.filter((e) => !e.hidden && e.excelRow != null),
    [errors],
  )

  const colCount = Math.max(1, ...rows.map((r) => (r || []).length), 1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadError('')
      setRows([])
      setSheetNames([])
      setSheetName('')
      setRowHeights({})
      if (!excelFile) return
      try {
        const buffer = await excelFile.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
        const names = workbook.SheetNames || []
        if (!names.length) {
          setLoadError('No sheets found in this workbook.')
          return
        }
        const preferred =
          names.find((n) => /quote\s*renewal/i.test(n)) || names[0]
        if (cancelled) return
        setSheetNames(names)
        setSheetName(preferred)
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Could not open Excel file')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [excelFile])

  useEffect(() => {
    let cancelled = false
    async function loadSheet() {
      if (!excelFile || !sheetName) return
      try {
        const buffer = await excelFile.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
        const sheet = workbook.Sheets[sheetName]
        if (!sheet) {
          setRows([])
          return
        }
        const data = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
        })
        if (!cancelled) {
          setRows(data)
          setRowHeights({})
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Could not read sheet')
      }
    }
    loadSheet()
    return () => {
      cancelled = true
    }
  }, [excelFile, sheetName])

  const sizeColumnsToContent = () => {
    if (!colCount || !rows.length) return
    setColWidths(measureContentWidths(rows, colCount))
  }

  useEffect(() => {
    if (!rows.length || !colCount) return
    setColWidths(measureContentWidths(rows, colCount))
  }, [rows, colCount, sheetName])

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current
      if (!drag) return
      if (drag.kind === 'col') {
        const next = Math.max(MIN_COL_PX, Math.min(MAX_COL_PX, drag.startSize + (e.clientX - drag.start)))
        setColWidths((prev) => {
          const copy = [...prev]
          copy[drag.index] = next
          return copy
        })
      } else if (drag.kind === 'row') {
        const next = Math.max(MIN_ROW_PX, Math.min(MAX_ROW_PX, drag.startSize + (e.clientY - drag.start)))
        setRowHeights((prev) => ({ ...prev, [drag.index]: next }))
      }
    }
    const onUp = () => {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startColResize = (index, e) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      kind: 'col',
      index,
      start: e.clientX,
      startSize: colWidths[index] ?? DEFAULT_COL_PX,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const startRowResize = (index, e) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      kind: 'row',
      index,
      start: e.clientY,
      startSize: rowHeights[index] ?? DEFAULT_ROW_PX,
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  const highlightsByCell = useMemo(() => {
    const map = new Map()
    for (const error of visibleErrors) {
      if (error.sheetName && sheetName && error.sheetName !== sheetName) continue
      const rowIdx = Number(error.excelRow) - 1
      const colIdx = colLetterToIndex(error.excelCol)
      if (rowIdx < 0 || colIdx == null) continue
      const key = `${rowIdx}:${colIdx}`
      const prev = map.get(key) || []
      prev.push(error)
      map.set(key, prev)
    }
    return map
  }, [visibleErrors, sheetName])

  const rowHighlights = useMemo(() => {
    const map = new Map()
    for (const error of visibleErrors) {
      if (error.sheetName && sheetName && error.sheetName !== sheetName) continue
      const rowIdx = Number(error.excelRow) - 1
      if (rowIdx < 0) continue
      const prev = map.get(rowIdx) || []
      prev.push(error)
      map.set(rowIdx, prev)
    }
    return map
  }, [visibleErrors, sheetName])

  useEffect(() => {
    if (!errorFocusKey || activeErrorId == null) return
    if (errorFocusKey === lastFocusKeyRef.current) return
    lastFocusKeyRef.current = errorFocusKey
    const error = visibleErrors.find((e) => e.id === activeErrorId)
    if (!error) return
    if (error.sheetName && error.sheetName !== sheetName) {
      setSheetName(error.sheetName)
      return
    }
    const rowIdx = Number(error.excelRow) - 1
    const colIdx = colLetterToIndex(error.excelCol)
    const el =
      (colIdx != null && cellRefs.current[`${rowIdx}:${colIdx}`]) ||
      cellRefs.current[`row:${rowIdx}`]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, [errorFocusKey, activeErrorId, visibleErrors, sheetName, rows])

  const tableWidth =
    ROW_NUM_PX + colWidths.reduce((sum, w) => sum + (w || DEFAULT_COL_PX), 0)

  return (
    <div className="flex flex-col h-full min-h-0 bg-brand-main overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 shrink-0 bg-black/25 border-b border-white/10 gap-2">
        <span className="text-xs font-medium text-white/50 truncate min-w-0" title={excelFile?.name}>
          {excelFile?.name || DISTRIBUTOR_QUOTE}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={sizeColumnsToContent}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white/10 text-white/70 hover:bg-white/15"
            title="Resize columns to fit cell contents"
          >
            <StretchHorizontal className="w-3 h-3" />
            Fit contents
          </button>
          {sheetNames.length > 1 && (
            <select
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              className="text-[11px] bg-white/10 text-white/80 border border-white/15 rounded px-2 py-1 max-w-[140px]"
            >
              {sheetNames.map((name) => (
                <option key={name} value={name} className="text-slate-900">
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div
        className="excel-scroll flex-1 min-h-0 overflow-auto p-2"
        style={{ scrollbarGutter: 'stable' }}
      >
        {!excelFile ? (
          <div className="flex flex-col items-center justify-center h-full text-white/40 gap-2">
            <FileSpreadsheet className="w-8 h-8" />
            <span className="text-sm">No Excel loaded</span>
          </div>
        ) : loadError ? (
          <div className="bg-white rounded shadow-2xl p-6 text-sm text-brand-acc1">
            {loadError}
          </div>
        ) : (
          <div className="bg-white rounded shadow-2xl">
            <table
              className="border-collapse text-[10px] font-mono table-fixed"
              style={{ width: tableWidth }}
            >
              <colgroup>
                <col style={{ width: ROW_NUM_PX }} />
                {Array.from({ length: colCount }, (_, i) => (
                  <col key={i} style={{ width: colWidths[i] ?? DEFAULT_COL_PX }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-100">
                  <th className="sticky left-0 z-30 bg-slate-200 border border-slate-300 px-1 py-1 text-[9px] text-slate-500 font-semibold">
                    #
                  </th>
                  {Array.from({ length: colCount }, (_, colIdx) => (
                    <th
                      key={colIdx}
                      className="relative border border-slate-300 px-1 py-1 text-[10px] text-slate-600 font-bold bg-slate-100"
                    >
                      {excelColLetter(colIdx)}
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        onMouseDown={(e) => startColResize(colIdx, e)}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-brand-secondary/60"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const rowErrors = rowHighlights.get(rowIdx) || []
                  const rowActive = rowErrors.some((e) => e.id === activeErrorId)
                  const h = rowHeights[rowIdx] ?? DEFAULT_ROW_PX
                  return (
                    <tr
                      key={rowIdx}
                      ref={(el) => {
                        if (el) cellRefs.current[`row:${rowIdx}`] = el
                      }}
                      style={{ height: h }}
                      className={
                        rowErrors.length
                          ? rowToneClass(true, rowActive)
                          : rowIdx % 2
                            ? 'bg-slate-50 text-slate-800'
                            : 'bg-white text-slate-800'
                      }
                    >
                      <td
                        className={`relative sticky left-0 z-10 px-1 text-[9px] border border-slate-100 text-right align-top ${
                          rowErrors.length
                            ? rowActive
                              ? 'bg-[#fff4ee] text-slate-600'
                              : 'bg-[#fffaf0] text-slate-600'
                            : rowIdx % 2
                              ? 'bg-slate-50 text-slate-400'
                              : 'bg-white text-slate-400'
                        }`}
                        style={{ height: h }}
                      >
                        {rowIdx + 1}
                        <span
                          role="separator"
                          aria-orientation="horizontal"
                          onMouseDown={(e) => startRowResize(rowIdx, e)}
                          className="absolute left-0 right-0 bottom-0 h-1.5 cursor-row-resize hover:bg-brand-secondary/60"
                        />
                      </td>
                      {Array.from({ length: colCount }, (_, colIdx) => {
                        const cellKey = `${rowIdx}:${colIdx}`
                        const exact = highlightsByCell.get(cellKey) || []
                        const active = exact.some((e) => e.id === activeErrorId)
                        const top = exact[0]
                        const value = row?.[colIdx] ?? ''
                        return (
                          <td
                            key={colIdx}
                            ref={(el) => {
                              if (el) cellRefs.current[cellKey] = el
                            }}
                            onClick={() => {
                              if (exact[0]) onSelectError?.(exact[0].id)
                              else if (rowErrors[0]) onSelectError?.(rowErrors[0].id)
                            }}
                            style={{ height: h, maxHeight: h }}
                            className={`relative px-1.5 py-0.5 border border-slate-100 overflow-hidden text-ellipsis whitespace-nowrap align-top ${
                              exact.length
                                ? `cursor-pointer ${severityClass(top.severity, active)}`
                                : rowErrors.length
                                  ? 'cursor-pointer'
                                  : ''
                            }`}
                            title={
                              exact.length
                                ? exact.map((e) => `#${e.id} ${e.severity}`).join(' · ')
                                : String(value)
                            }
                          >
                            {String(value)}
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              onMouseDown={(e) => startColResize(colIdx, e)}
                              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-brand-secondary/50"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
