import { useMemo, useState } from 'react'
import { Check, EyeOff, Star } from 'lucide-react'
import ErrorCard from './ErrorCard'

const SEVERITY_FILTERS = [
  {
    key: 'CRITICAL',
    label: 'Critical',
    accent: 'accent-brand-acc1 text-brand-acc1',
  },
  {
    key: 'WARNING',
    label: 'Warning',
    accent: 'accent-[#d4a017] text-[#b07d00]',
  },
  {
    key: 'NOTICE',
    label: 'Notice',
    accent: 'accent-slate-500 text-slate-600',
  },
]

export default function ErrorFeed({
  errors,
  activeErrorId,
  analysis,
  meanMarginPercent,
  onSelectError,
  onAction,
  onIgnore,
  onUnignore,
}) {
  const [tab, setTab] = useState('active')
  const [severityOn, setSeverityOn] = useState({
    CRITICAL: true,
    WARNING: true,
    NOTICE: true,
  })

  const activeErrors = errors.filter((e) => !e.hidden)
  const ignoredErrors = errors.filter((e) => e.hidden)

  const severityCounts = useMemo(() => {
    const counts = { CRITICAL: 0, WARNING: 0, NOTICE: 0 }
    for (const e of activeErrors) {
      const key = String(e.severity || '').toUpperCase()
      if (counts[key] != null) counts[key] += 1
    }
    return counts
  }, [activeErrors])

  const shown = useMemo(() => {
    const base = tab === 'active' ? activeErrors : ignoredErrors
    if (tab !== 'active') return base
    return base.filter((e) => severityOn[String(e.severity || '').toUpperCase()])
  }, [tab, activeErrors, ignoredErrors, severityOn])

  const toggleSeverity = (key) => {
    setSeverityOn((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      // Keep at least one severity visible so the list never goes blank by accident
      if (!next.CRITICAL && !next.WARNING && !next.NOTICE) {
        return prev
      }
      return next
    })
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 border-r border-slate-200">
      <div className="shrink-0 px-3 md:px-4 py-2 md:py-3 bg-white border-b border-slate-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-semibold border transition-all ${
              tab === 'active'
                ? activeErrors.some((e) => e.severity === 'CRITICAL')
                  ? 'bg-brand-acc1/[0.10] text-brand-acc1 border-brand-acc1/40 shadow-sm'
                  : activeErrors.length
                    ? 'bg-brand-acc2/15 text-[#b07d00] border-brand-acc2/40 shadow-sm'
                    : 'bg-brand-acc3/15 text-[#5a7a00] border-brand-acc3/35 shadow-sm'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Star className="w-3.5 h-3.5" strokeWidth={2} />
            {activeErrors.length} issue{activeErrors.length !== 1 ? 's' : ''}
            <span className="hidden md:inline"> found</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('ignored')}
            className={`inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg text-[11px] md:text-xs font-medium border transition-all ${
              tab === 'ignored'
                ? 'bg-brand-main text-white border-brand-main shadow-sm'
                : 'bg-white text-brand-main border-slate-200 hover:bg-slate-50'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="md:hidden">Ignored</span>
            <span className="hidden md:inline">Ignored Errors</span>
            {ignoredErrors.length > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center bg-slate-200 text-slate-600">
                {ignoredErrors.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'active' && activeErrors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <span className="hidden md:inline text-[10px] font-medium text-slate-400">
              Filter by severity
            </span>
            {SEVERITY_FILTERS.map((f) => {
              const on = severityOn[f.key]
              const count = severityCounts[f.key] || 0
              const disabled = count === 0
              return (
                <label
                  key={f.key}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold select-none ${
                    disabled
                      ? 'opacity-35 cursor-not-allowed'
                      : `cursor-pointer ${f.accent}`
                  }`}
                  title={
                    disabled
                      ? `No ${f.label.toLowerCase()} issues`
                      : `${on ? 'Hide' : 'Show'} ${f.label.toLowerCase()} issues`
                  }
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded border-slate-300"
                    checked={on && !disabled}
                    disabled={disabled}
                    onChange={() => toggleSeverity(f.key)}
                  />
                  <span>
                    {f.label}
                    <span className="ml-1 font-mono text-[10px] opacity-70">
                      ({count})
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {shown.length === 0 && tab === 'active' && (
          <div className="text-center py-10 space-y-2">
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full bg-brand-acc3/15 flex items-center justify-center">
                <Check className="w-5 h-5 text-brand-acc3" strokeWidth={2.5} />
              </div>
            </div>
            <div className="font-medium text-sm text-brand-main">
              {activeErrors.length === 0
                ? 'No active issues'
                : 'No issues match these filters'}
            </div>
            <div className="text-xs text-slate-400">
              {activeErrors.length === 0
                ? ignoredErrors.length > 0
                  ? `${ignoredErrors.length} ignored — open Ignored Errors to restore`
                  : 'Upload files to run a check'
                : 'Turn a severity filter back on to see matching cards'}
            </div>
          </div>
        )}

        {shown.length === 0 && tab === 'ignored' && (
          <div className="text-center py-10 space-y-2">
            <div className="font-medium text-sm text-brand-main">No ignored errors</div>
          </div>
        )}

        {shown.map((error) => (
          <ErrorCard
            key={error.id}
            error={error}
            isActive={activeErrorId === error.id}
            isIgnored={tab === 'ignored'}
            analysis={analysis}
            meanMarginPercent={meanMarginPercent}
            onSelect={() => onSelectError(error.id)}
            onAction={onAction}
            onIgnore={onIgnore}
            onUnignore={(id) => {
              onUnignore(id)
              setTab('active')
            }}
          />
        ))}
      </div>
    </div>
  )
}
