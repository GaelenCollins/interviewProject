import {
  ArrowLeft,
  Calculator,
  ChartColumn,
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
  'flex items-center gap-2 py-1.5 px-3 rounded-lg text-[11px] font-medium text-brand-main/55 bg-transparent border border-transparent hover:text-brand-main hover:bg-brand-main/8 transition-colors duration-200'

const primaryBtnClass =
  'flex items-center gap-2 py-1.5 px-3 rounded-lg text-[11px] font-semibold bg-brand-main text-brand-secondary border border-brand-main hover:border-brand-acc2 hover:shadow-[0_0_0_1px_rgba(114,201,209,0.45)] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none disabled:hover:border-brand-main disabled:hover:shadow-none'

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

  return (
    <header className="shrink-0 flex items-center justify-between px-5 h-[52px] bg-brand-secondary text-brand-main border-b-2 border-brand-main/15">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-brand-main flex items-center justify-center shadow-sm shrink-0">
          <Layers className="w-4.5 h-4.5 text-brand-secondary" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="font-bold leading-tight text-[15px]">
            Dynamix Sales Quote Checker
          </div>
          <div className="text-xs leading-tight text-brand-main/55">
            Automated Quote Checking & Verification
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showNewCheck && !onDashboard ? (
          <button
            type="button"
            onClick={onNewCheck}
            className="py-1.5 px-3 rounded-lg text-xs font-medium bg-brand-main/10 border border-brand-main/20 hover:bg-brand-main/15 transition-colors"
          >
            ← New Check
          </button>
        ) : null}

        {/* Group 1: Support & system utilities */}
        <div
          className="flex items-center gap-1"
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
          className="border-r border-slate-700 h-5 mx-1"
          aria-hidden="true"
        />

        {/* Group 2: Active quote tools */}
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
            <Calculator className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            <span className="whitespace-nowrap">Calculator</span>
          </button>
          <button
            type="button"
            onClick={onOpenEmail}
            disabled={emailDisabled}
            className={primaryBtnClass}
            title="Generate Email"
            aria-label="Generate email"
          >
            <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            <span className="whitespace-nowrap">Generate Email</span>
          </button>
        </div>
      </div>
    </header>
  )
}
