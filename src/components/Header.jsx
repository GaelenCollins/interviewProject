import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Calculator,
  ChartColumn,
  Ellipsis,
  Layers,
  Mail,
  MessageCircle,
} from 'lucide-react'

const CONTACT_HUMAN_HREF =
  'mailto:GaelenCollins@dynamixgroup.com?subject=' +
  encodeURIComponent('Sales Quote Checker — feedback / feature request') +
  '&body=' +
  encodeURIComponent(
    'Hi Gaelen,\n\nI have feedback or a feature request for the Sales Quote Checker:\n\n',
  )

const ghostBtnClass =
  'flex items-center gap-2 py-1.5 px-2.5 md:px-3 min-h-9 md:min-h-0 rounded-lg text-[11px] font-medium text-brand-main/55 bg-transparent border border-transparent hover:text-brand-main hover:bg-brand-main/8 transition-colors duration-200'

const primaryBtnClass =
  'flex items-center justify-center gap-1.5 md:gap-2 py-1.5 px-2.5 md:px-3 min-h-9 md:min-h-0 rounded-lg text-[11px] font-semibold bg-brand-main text-brand-secondary border border-brand-main hover:border-brand-acc2 hover:shadow-[0_0_0_1px_rgba(114,201,209,0.45)] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none disabled:hover:border-brand-main disabled:hover:shadow-none'

export default function Header({
  onOpenCalculator,
  onOpenEmail,
  showNewCheck,
  onNewCheck,
  emailDisabled = false,
  appTab = 'checker',
  onToggleAppTab,
}) {
  const onDashboard = appTab === 'dashboard'
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  useEffect(() => {
    if (!moreOpen) return
    const onPointer = (e) => {
      if (!moreRef.current?.contains(e.target)) setMoreOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  return (
    <header className="shrink-0 flex items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-5 min-h-[44px] md:min-h-[52px] py-1.5 md:py-2 bg-brand-secondary text-brand-main border-b-2 border-brand-main/15">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-brand-main flex items-center justify-center shadow-sm shrink-0">
          <Layers className="w-4 h-4 md:w-4.5 md:h-4.5 text-brand-secondary" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="font-bold leading-tight text-[12px] sm:text-[15px] truncate">
            <span className="sm:hidden">Quote Checker</span>
            <span className="hidden sm:inline">Dynamix Sales Quote Checker</span>
          </div>
          <div className="hidden md:block text-xs leading-tight text-brand-main/55">
            Automated Quote Checking & Verification
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {showNewCheck && !onDashboard ? (
          <button
            type="button"
            onClick={onNewCheck}
            className="py-1 px-2 sm:px-3 min-h-9 md:min-h-0 rounded-lg text-[11px] sm:text-xs font-medium bg-brand-main/10 border border-brand-main/20 hover:bg-brand-main/15 transition-colors"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">← New Check</span>
          </button>
        ) : null}

        {/* Mobile: secondary actions in overflow menu */}
        <div className="relative md:hidden" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className={ghostBtnClass}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label="More actions"
            title="More actions"
          >
            <Ellipsis className="w-4 h-4" strokeWidth={2} />
          </button>
          {moreOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-[60] w-56 rounded-xl border border-brand-main/15 bg-white shadow-xl py-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false)
                  onToggleAppTab?.()
                }}
                className="w-full flex items-center gap-2 px-3 py-3 text-left text-xs font-medium text-brand-main hover:bg-slate-50 min-h-11"
              >
                {onDashboard ? (
                  <ArrowLeft className="w-4 h-4 shrink-0" strokeWidth={2} />
                ) : (
                  <ChartColumn className="w-4 h-4 shrink-0" strokeWidth={2} />
                )}
                {onDashboard
                  ? 'Back to Quote Checker'
                  : 'Tool Usage'}
              </button>
              <a
                role="menuitem"
                href={CONTACT_HUMAN_HREF}
                onClick={() => setMoreOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-3 text-left text-xs font-medium text-brand-main hover:bg-slate-50 min-h-11"
              >
                <MessageCircle className="w-4 h-4 shrink-0" strokeWidth={2} />
                Send Tool Feedback
              </a>
            </div>
          ) : null}
        </div>

        {/* Desktop: support utilities */}
        <div
          className="hidden md:flex items-center gap-1"
          role="group"
          aria-label="Support and system utilities"
        >
          <button
            type="button"
            onClick={onToggleAppTab}
            className={ghostBtnClass}
            title={
              onDashboard
                ? 'Take me back to main Quote Checker App'
                : 'Tool Usage Dashboard (sample)'
            }
            aria-label={
              onDashboard
                ? 'Take me back to main Quote Checker App'
                : 'Open Tool Usage Dashboard sample'
            }
          >
            {onDashboard ? (
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            ) : (
              <ChartColumn className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            )}
            <span className="whitespace-nowrap">
              {onDashboard
                ? 'Take me back to main Quote Checker App'
                : 'Tool Usage'}
            </span>
          </button>
          <a
            href={CONTACT_HUMAN_HREF}
            className={ghostBtnClass}
            title="Email feedback or feature ideas"
            aria-label="Send tool feedback"
          >
            <MessageCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            <span className="whitespace-nowrap">Send Tool Feedback</span>
          </a>
        </div>

        <div
          className="hidden md:block border-r border-slate-700 h-5 mx-1"
          aria-hidden="true"
        />

        {/* Primary quote tools — always visible, 44px touch targets on mobile */}
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Active quote tools"
        >
          <button
            type="button"
            onClick={onOpenCalculator}
            className={primaryBtnClass}
            title="Calculator"
            aria-label="Open calculator"
          >
            <Calculator className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="whitespace-nowrap hidden sm:inline">
              Calculator
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenEmail}
            disabled={emailDisabled}
            className={primaryBtnClass}
            title="Generate Email"
            aria-label="Generate email"
          >
            <Mail className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="whitespace-nowrap hidden sm:inline">
              Generate Email
            </span>
            <span className="whitespace-nowrap sm:hidden">Email</span>
          </button>
        </div>
      </div>
    </header>
  )
}
