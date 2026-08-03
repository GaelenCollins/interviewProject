import { useEffect, useRef, useState } from 'react'
import { Calculator, X } from 'lucide-react'

function parseNum(value) {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function formatMoney(value) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const inputClass =
  'w-full rounded-lg px-3 py-2 text-sm outline-none border-[1.5px] border-slate-200 focus:border-brand-secondary font-mono text-brand-main'

const TABS = [
  { id: 'calculator', label: 'Calculator' },
  { id: 'sale-price', label: 'Sale Price' },
  { id: 'margin', label: 'Margin %' },
]

/** Pure JS scientific evaluator — no LLM. Degrees for trig. */
function evaluateScientific(raw) {
  let expr = String(raw || '')
    .trim()
    .replace(/=/g, '')
  if (!expr) return null

  expr = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\^/g, '**')
    .replace(/π/g, `(${Math.PI})`)
    .replace(/√\s*\(/g, 'sqrt(')

  // Protect scientific notation (2.4e+10 / 2.4E-3) before Euler "e" rewrite.
  const sciSlots = []
  expr = expr.replace(
    /(\d+(?:\.\d+)?)([eE][+-]?\d+)/g,
    (_m, mant, expPart) => {
      const i = sciSlots.length
      sciSlots.push(`(${mant}${expPart})`)
      return `__NUM${i}__`
    },
  )

  // Bare Euler constant (button "e"), not part of 1e10
  expr = expr.replace(
    /(^|[^A-Za-z0-9_.])e(?![A-Za-z0-9_.])/g,
    `$1(${Math.E})`,
  )

  // Percent: 50% → (50/100); also after restored nums via placeholder later
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
  expr = expr.replace(/(__NUM\d+__)\s*%/g, '($1/100)')

  // Implicit multiply: 2(3), (2)(3), 2π already handled via π→(PI)
  expr = expr
    .replace(/(\d)\s*\(/g, '$1*(')
    .replace(/\)\s*\(/g, ')*(')
    .replace(/\)\s*(\d)/g, ')*$1')
    .replace(/(__NUM\d+__)\s*\(/g, '$1*(')
    .replace(/\)\s*(__NUM\d+__)/g, ')*$1')

  // Degrees → radians for trig
  expr = expr
    .replace(/sin\s*\(/g, '__sin(')
    .replace(/cos\s*\(/g, '__cos(')
    .replace(/tan\s*\(/g, '__tan(')
    .replace(/ln\s*\(/g, '__ln(')
    .replace(/log\s*\(/g, '__log(')
    .replace(/sqrt\s*\(/g, '__sqrt(')

  expr = expr.replace(/__NUM(\d+)__/g, (_m, i) => sciSlots[Number(i)])

  // Only allow safe tokens after rewrite (sci e/E ok inside numbers)
  const stripped = expr.replace(/__(?:sin|cos|tan|ln|log|sqrt)/g, '')
  if (!/^[\d+\-*/().,eE\s]+$/.test(stripped)) {
    throw new Error('Invalid expression')
  }

  const fn = new Function(
    '__sin',
    '__cos',
    '__tan',
    '__ln',
    '__log',
    '__sqrt',
    `"use strict"; return (${expr});`,
  )

  const value = fn(
    (x) => Math.sin((x * Math.PI) / 180),
    (x) => Math.cos((x * Math.PI) / 180),
    (x) => Math.tan((x * Math.PI) / 180),
    (x) => Math.log(x),
    (x) => Math.log10(x),
    (x) => Math.sqrt(x),
  )

  if (!Number.isFinite(value)) throw new Error('Not a finite number')
  return value
}

function formatCalcDisplay(value) {
  if (!Number.isFinite(value)) return 'Error'
  const abs = Math.abs(value)
  // Prefer plain decimals when short enough; else scientific (reusable in next calc).
  if (abs !== 0 && (abs >= 1e10 || abs < 1e-6)) {
    return value.toExponential(6)
  }
  const rounded = Math.round(value * 1e10) / 1e10
  return String(rounded)
}

function ScientificCalculator() {
  const [expression, setExpression] = useState('')
  const [display, setDisplay] = useState('0')
  const [history, setHistory] = useState('')
  const [error, setError] = useState('')
  // Ref avoids Strict Mode double-invoking nested setState updaters (which doubled keys).
  const justEvaluatedRef = useRef(false)

  const append = (chunk) => {
    setError('')
    if (justEvaluatedRef.current) {
      const startFresh = /^[0-9.πe(]/.test(chunk)
      justEvaluatedRef.current = false
      setHistory('')
      if (startFresh) {
        setExpression(chunk)
        return
      }
      // Operator after = continues from the answer (Google-style).
      setExpression(`${display || '0'}${chunk}`)
      return
    }
    setExpression((prev) => prev + chunk)
  }

  const clearAll = () => {
    setExpression('')
    setDisplay('0')
    setHistory('')
    setError('')
    justEvaluatedRef.current = false
  }

  const backspace = () => {
    setError('')
    justEvaluatedRef.current = false
    setHistory('')
    setExpression((prev) => {
      if (prev) return prev.slice(0, -1)
      return ''
    })
  }

  const equals = () => {
    const source = expression || display
    try {
      const value = evaluateScientific(source)
      if (value == null) return
      const formatted = formatCalcDisplay(value)
      setHistory(`${source} =`)
      setDisplay(formatted)
      setExpression('')
      justEvaluatedRef.current = true
      setError('')
    } catch {
      setHistory(source ? `${source} =` : '')
      setError('Invalid expression')
      setDisplay('Error')
      setExpression('')
      justEvaluatedRef.current = true
    }
  }

  const appendRef = useRef(append)
  const equalsRef = useRef(equals)
  const clearAllRef = useRef(clearAll)
  const backspaceRef = useRef(backspace)
  appendRef.current = append
  equalsRef.current = equals
  clearAllRef.current = clearAll
  backspaceRef.current = backspace

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) {
        return
      }

      const { key } = e

      if (key >= '0' && key <= '9') {
        e.preventDefault()
        appendRef.current(key)
        return
      }

      switch (key) {
        case '.':
          e.preventDefault()
          appendRef.current('.')
          break
        case '+':
          e.preventDefault()
          appendRef.current('+')
          break
        case '-':
          e.preventDefault()
          appendRef.current('-')
          break
        case '*':
          e.preventDefault()
          appendRef.current('×')
          break
        case '/':
          e.preventDefault()
          appendRef.current('÷')
          break
        case '(':
        case ')':
        case '^':
        case '%':
          e.preventDefault()
          appendRef.current(key)
          break
        case 'Enter':
        case '=':
          e.preventDefault()
          equalsRef.current()
          break
        case 'Backspace':
          e.preventDefault()
          backspaceRef.current()
          break
        case 'Delete':
        case 'c':
        case 'C':
          e.preventDefault()
          clearAllRef.current()
          break
        case 'e':
        case 'E':
          e.preventDefault()
          appendRef.current('e')
          break
        case 'p':
        case 'P':
          e.preventDefault()
          appendRef.current('π')
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Google-style: while typing show the equation large; after = show equation above, answer large.
  const shown = error ? 'Error' : expression !== '' ? expression : display || '0'

  const btn =
    'h-10 rounded-lg text-sm font-semibold transition-all active:scale-95 select-none'
  const numBtn = `${btn} bg-slate-100 text-brand-main hover:bg-slate-200`
  const opBtn = `${btn} bg-brand-secondary/20 text-brand-main hover:bg-brand-secondary/35`
  const sciBtn = `${btn} bg-brand-main text-white/90 hover:bg-brand-main/90 text-xs`
  const eqBtn = `${btn} bg-brand-acc3 text-brand-main hover:opacity-90`

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-[1.5px] border-slate-200 bg-slate-50 px-3 py-3 text-right">
        <div className="min-h-[1.1rem] text-xs font-mono text-slate-400 break-all leading-tight">
          {history || '\u00a0'}
        </div>
        <div className="text-2xl font-bold font-mono text-brand-main break-all leading-tight min-h-[2rem] mt-0.5">
          {shown}
        </div>
        {error ? (
          <div className="text-[11px] text-brand-acc1 mt-1">{error}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {[
          ['sin(', 'sin'],
          ['cos(', 'cos'],
          ['tan(', 'tan'],
          ['log(', 'log'],
          ['ln(', 'ln'],
          ['√(', '√'],
          ['^', '^'],
          ['π', 'π'],
          ['e', 'e'],
          ['%', '%'],
        ].map(([token, label]) => (
          <button
            key={label}
            type="button"
            className={sciBtn}
            onClick={() => append(token)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" className={opBtn} onClick={clearAll}>
          AC
        </button>
        <button type="button" className={opBtn} onClick={backspace}>
          ⌫
        </button>
        <button type="button" className={opBtn} onClick={() => append('(')}>
          (
        </button>
        <button type="button" className={opBtn} onClick={() => append(')')}>
          )
        </button>

        {['7', '8', '9'].map((d) => (
          <button key={d} type="button" className={numBtn} onClick={() => append(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={opBtn} onClick={() => append('÷')}>
          ÷
        </button>

        {['4', '5', '6'].map((d) => (
          <button key={d} type="button" className={numBtn} onClick={() => append(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={opBtn} onClick={() => append('×')}>
          ×
        </button>

        {['1', '2', '3'].map((d) => (
          <button key={d} type="button" className={numBtn} onClick={() => append(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={opBtn} onClick={() => append('-')}>
          −
        </button>

        <button type="button" className={numBtn} onClick={() => append('0')}>
          0
        </button>
        <button type="button" className={numBtn} onClick={() => append('.')}>
          .
        </button>
        <button
          type="button"
          className={opBtn}
          onClick={() => {
            setError('')
            justEvaluatedRef.current = false
            setExpression((prev) => {
              if (!prev) return '-'
              if (/^-?\d*\.?\d+$/.test(prev)) {
                return prev.startsWith('-') ? prev.slice(1) : `-${prev}`
              }
              return `-(${prev})`
            })
          }}
        >
          ±
        </button>
        <button type="button" className={opBtn} onClick={() => append('+')}>
          +
        </button>

        <button type="button" className={`${eqBtn} col-span-4`} onClick={equals}>
          =
        </button>
      </div>
    </div>
  )
}

function SalePriceTab() {
  const [cost, setCost] = useState('')
  const [marginInput, setMarginInput] = useState('')

  const costNum = parseNum(cost)
  const marginNum = parseNum(marginInput)

  const sellFromMargin =
    costNum !== null && marginNum !== null && marginNum < 100
      ? costNum / (1 - marginNum / 100)
      : null

  const markupFromTarget =
    sellFromMargin !== null && costNum !== null && costNum !== 0
      ? (((sellFromMargin - costNum) / costNum) * 100).toFixed(2)
      : null

  const isLowMargin = marginNum !== null && marginNum < 5

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500 leading-snug">
        Sale price from cost and target gross margin. Pure math: Cost ÷ (1 − Margin/100).
      </p>
      <div>
        <label className="block text-xs font-medium mb-1.5 text-brand-main">
          Cost / Price ($)
        </label>
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5 text-brand-main">
          Desired Margin (%)
        </label>
        <input
          type="number"
          value={marginInput}
          onChange={(e) => setMarginInput(e.target.value)}
          placeholder="10"
          className={inputClass}
        />
      </div>

      {sellFromMargin !== null && (
        <div className="space-y-3">
          <div
            className={`rounded-lg p-3 border-[1.5px] ${
              isLowMargin
                ? 'bg-brand-acc1/10 border-brand-acc1/35'
                : 'bg-brand-acc3/10 border-brand-acc3/40'
            }`}
          >
            <div
              className={`text-xs font-medium mb-0.5 ${
                isLowMargin ? 'text-brand-acc1' : 'text-[#5a7a00]'
              }`}
            >
              Sale Price
            </div>
            <div
              className={`text-2xl font-bold font-mono ${
                isLowMargin ? 'text-brand-acc1' : 'text-brand-main'
              }`}
            >
              ${formatMoney(sellFromMargin)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 leading-snug">
              Cost ÷ (1 − Margin/100)
            </div>
          </div>
          <div className="rounded-lg p-3 border-[1.5px] bg-brand-secondary/10 border-brand-secondary/40">
            <div className="text-xs font-medium mb-0.5 text-brand-main">
              Equivalent Markup %
            </div>
            <div className="text-lg font-bold font-mono text-brand-main">
              {markupFromTarget ?? '—'}%
            </div>
          </div>
        </div>
      )}

      {marginNum !== null && marginNum >= 100 && (
        <div className="text-xs text-brand-acc1">
          Margin should be less than 100% to solve for sale price.
        </div>
      )}

      {isLowMargin && sellFromMargin !== null && (
        <div className="text-xs text-brand-acc1">
          Below the usual 5% hard floor for Dynamix margin.
        </div>
      )}
    </div>
  )
}

function MarginPercentTab() {
  const [cost, setCost] = useState('')
  const [sellPrice, setSellPrice] = useState('')

  const costNum = parseNum(cost)
  const sellNum = parseNum(sellPrice)

  const marginFromPrices =
    costNum !== null && sellNum !== null && sellNum !== 0
      ? (((sellNum - costNum) / sellNum) * 100).toFixed(2)
      : null

  const markupFromPrices =
    costNum !== null && sellNum !== null && costNum !== 0
      ? (((sellNum - costNum) / costNum) * 100).toFixed(2)
      : null

  const isLowMargin =
    marginFromPrices !== null && parseFloat(marginFromPrices) < 5
  const isHighMargin =
    marginFromPrices !== null && parseFloat(marginFromPrices) > 20

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500 leading-snug">
        Gross margin and markup from cost and sell. Pure math only.
      </p>
      <div>
        <label className="block text-xs font-medium mb-1.5 text-brand-main">
          Cost / Price ($)
        </label>
        <input
          type="number"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5 text-brand-main">
          Sell Price ($)
        </label>
        <input
          type="number"
          value={sellPrice}
          onChange={(e) => setSellPrice(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>

      {(marginFromPrices !== null || markupFromPrices !== null) && (
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`rounded-lg p-3 border-[1.5px] ${
              isLowMargin || isHighMargin
                ? 'bg-brand-acc1/10 border-brand-acc1/35'
                : 'bg-brand-acc3/10 border-brand-acc3/40'
            }`}
          >
            <div
              className={`text-xs font-medium mb-0.5 ${
                isLowMargin || isHighMargin ? 'text-brand-acc1' : 'text-[#5a7a00]'
              }`}
            >
              Margin %
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                isLowMargin || isHighMargin ? 'text-brand-acc1' : 'text-brand-acc3'
              }`}
            >
              {marginFromPrices ?? '—'}%
            </div>
            <div className="text-[10px] text-slate-500 mt-1 leading-snug">
              ((Sell − Cost) / Sell) × 100
            </div>
          </div>
          <div className="rounded-lg p-3 border-[1.5px] bg-brand-secondary/10 border-brand-secondary/40">
            <div className="text-xs font-medium mb-0.5 text-brand-main">
              Markup %
            </div>
            <div className="text-xl font-bold font-mono text-brand-main">
              {markupFromPrices ?? '—'}%
            </div>
            <div className="text-[10px] text-slate-500 mt-1 leading-snug">
              ((Sell − Cost) / Cost) × 100
            </div>
          </div>
        </div>
      )}

      {isLowMargin && (
        <div className="text-xs text-brand-acc1">
          Below the usual 5% hard floor (Dynamix margin risk).
        </div>
      )}
      {isHighMargin && (
        <div className="text-xs text-brand-acc1">
          Above the usual 20% hard ceiling (customer / bid risk).
        </div>
      )}
    </div>
  )
}

export default function MarginCalculatorModal({ onClose }) {
  const [tab, setTab] = useState('calculator')

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="rounded-2xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto bg-white border-2 border-brand-secondary"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-title"
      >
        <div className="flex items-center justify-between px-5 py-4 rounded-t-2xl bg-brand-main sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Calculator className="w-4.5 h-4.5 text-brand-secondary" />
            <span id="calc-title" className="font-semibold text-white text-[15px]">
              Calculator
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close calculator"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === t.id
                    ? 'bg-white text-brand-main shadow-sm'
                    : 'text-slate-500 hover:text-brand-main'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'calculator' && <ScientificCalculator />}
          {tab === 'sale-price' && <SalePriceTab />}
          {tab === 'margin' && <MarginPercentTab />}
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg text-sm font-semibold bg-brand-acc3 text-brand-main hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
