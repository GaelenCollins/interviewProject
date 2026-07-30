import { useState } from 'react'
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

export default function MarginCalculatorModal({ onClose }) {
  const [mode, setMode] = useState('find-margin')
  const [cost, setCost] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [marginInput, setMarginInput] = useState('')

  const costNum = parseNum(cost)
  const sellNum = parseNum(sellPrice)
  const marginNum = parseNum(marginInput)

  // Mode A: Cost + Sell → Margin / Markup
  const marginFromPrices =
    costNum !== null && sellNum !== null && sellNum !== 0
      ? (((sellNum - costNum) / sellNum) * 100).toFixed(2)
      : null

  const markupFromPrices =
    costNum !== null && sellNum !== null && costNum !== 0
      ? (((sellNum - costNum) / costNum) * 100).toFixed(2)
      : null

  // Mode B: Cost + Margin % → Sale Price
  // Sell = Cost / (1 - margin/100)
  const sellFromMargin =
    costNum !== null &&
    marginNum !== null &&
    marginNum < 100 &&
    marginNum > -Infinity
      ? costNum / (1 - marginNum / 100)
      : null

  const markupFromTarget =
    sellFromMargin !== null && costNum !== null && costNum !== 0
      ? (((sellFromMargin - costNum) / costNum) * 100).toFixed(2)
      : null

  const isLowMargin =
    mode === 'find-margin'
      ? marginFromPrices !== null && parseFloat(marginFromPrices) < 5
      : marginNum !== null && marginNum < 5

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="rounded-2xl shadow-2xl w-[400px] bg-white border-2 border-brand-secondary"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="margin-calc-title"
      >
        <div className="flex items-center justify-between px-5 py-4 rounded-t-2xl bg-brand-main">
          <div className="flex items-center gap-2">
            <Calculator className="w-4.5 h-4.5 text-brand-secondary" />
            <span
              id="margin-calc-title"
              className="font-semibold text-white text-[15px]"
            >
              Margin Calculator
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
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100">
            <button
              type="button"
              onClick={() => setMode('find-margin')}
              className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                mode === 'find-margin'
                  ? 'bg-white text-brand-main shadow-sm'
                  : 'text-slate-500 hover:text-brand-main'
              }`}
            >
              Find Margin %
            </button>
            <button
              type="button"
              onClick={() => setMode('find-sell')}
              className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                mode === 'find-sell'
                  ? 'bg-white text-brand-main shadow-sm'
                  : 'text-slate-500 hover:text-brand-main'
              }`}
            >
              Find Sale Price
            </button>
          </div>

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

          {mode === 'find-margin' ? (
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
          ) : (
            <div>
              <label className="block text-xs font-medium mb-1.5 text-brand-main">
                Desired Margin (%)
              </label>
              <input
                type="number"
                value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                placeholder="10.02"
                className={inputClass}
              />
            </div>
          )}

          {mode === 'find-margin' && (marginFromPrices !== null || markupFromPrices !== null) && (
            <div className="grid grid-cols-2 gap-3">
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
                  Margin %
                </div>
                <div
                  className={`text-xl font-bold font-mono ${
                    isLowMargin ? 'text-brand-acc1' : 'text-brand-acc3'
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

          {mode === 'find-sell' && sellFromMargin !== null && (
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

          {mode === 'find-sell' &&
            marginNum !== null &&
            marginNum >= 100 && (
              <div className="text-xs text-brand-acc1">
                Margin must be less than 100% to solve for sale price.
              </div>
            )}

          {isLowMargin &&
            ((mode === 'find-margin' && marginFromPrices !== null) ||
              (mode === 'find-sell' && sellFromMargin !== null)) && (
              <div className="text-xs text-brand-acc1">
                ⚠ Below acceptable margin threshold (5%)
              </div>
            )}
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
