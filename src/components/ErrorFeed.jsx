import { useState } from 'react'
import { Check, EyeOff, Star } from 'lucide-react'
import ErrorCard from './ErrorCard'

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

  const activeErrors = errors.filter((e) => !e.hidden)
  const ignoredErrors = errors.filter((e) => e.hidden)
  const shown = tab === 'active' ? activeErrors : ignoredErrors

  return (
    <div className="flex flex-col h-full bg-slate-100 border-r border-slate-200">
      <div className="shrink-0 px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
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
            {activeErrors.length} issue{activeErrors.length !== 1 ? 's' : ''} found
          </button>

          <button
            type="button"
            onClick={() => setTab('ignored')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              tab === 'ignored'
                ? 'bg-brand-main text-white border-brand-main shadow-sm'
                : 'bg-white text-brand-main border-slate-200 hover:bg-slate-50'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" strokeWidth={2} />
            Ignored Errors
            {ignoredErrors.length > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center bg-slate-200 text-slate-600">
                {ignoredErrors.length}
              </span>
            )}
          </button>
        </div>
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
              No active issues
            </div>
            <div className="text-xs text-slate-400">
              {ignoredErrors.length > 0
                ? `${ignoredErrors.length} ignored — open Ignored Errors to restore`
                : 'Upload files to run a check'}
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
