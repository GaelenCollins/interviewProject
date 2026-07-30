import { Calculator, Layers } from 'lucide-react'

export default function Header({ onOpenCalculator, showNewCheck, onNewCheck }) {
  return (
    <header className="shrink-0 flex items-center justify-between px-5 h-[52px] bg-brand-secondary text-brand-main border-b-2 border-brand-main/15">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-main flex items-center justify-center shadow-sm">
          <Layers className="w-4.5 h-4.5 text-brand-secondary" strokeWidth={2} />
        </div>
        <div>
          <div className="font-bold leading-tight text-[15px]">
            Dynamix Sales Quote Checker
          </div>
          <div className="text-xs leading-tight text-brand-main/55">
            Automated Quote Checking & Verification
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showNewCheck && (
          <button
            type="button"
            onClick={onNewCheck}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-brand-main/10 border border-brand-main/20 hover:bg-brand-main/15 transition-colors"
          >
            ← New Check
          </button>
        )}
        <button
          type="button"
          onClick={onOpenCalculator}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-brand-main text-brand-secondary hover:opacity-90 active:scale-95 transition-all"
          title="Margin Calculator"
          aria-label="Open margin calculator"
        >
          <Calculator className="w-[18px] h-[18px]" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  )
}
