import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function ErrorCard({
  error,
  isActive,
  isIgnored = false,
  onAction,
  onIgnore,
  onUnignore,
  onSelect,
}) {
  const isCritical = error.severity === 'CRITICAL'
  const border = isCritical ? 'border-brand-acc1/40' : 'border-brand-acc2/45'
  const bg = isCritical ? 'bg-brand-acc1/[0.08]' : 'bg-brand-acc2/[0.10]'
  const labelColor = isCritical ? 'text-brand-acc1' : 'text-[#b07d00]'
  const badgeBg = isCritical ? 'bg-brand-acc1' : 'bg-brand-acc2'
  const ring = isActive
    ? isCritical
      ? 'ring-2 ring-brand-acc1/40'
      : 'ring-2 ring-brand-acc2/40'
    : ''

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      className={`rounded-xl p-4 space-y-3 border-[1.5px] transition-all cursor-pointer ${bg} ${border} ${ring} ${
        isIgnored ? 'opacity-90' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`w-4 h-4 shrink-0 mt-0.5 ${labelColor}`}
          strokeWidth={2}
        />
        <p className="text-sm leading-snug text-slate-800">
          <span className={`font-bold ${labelColor}`}>{error.severity}: </span>
          {error.message.replace(/^(CRITICAL|WARNING):\s*/, '')}
        </p>
      </div>

      {isIgnored ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onUnignore(error.id)
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-acc3 text-brand-main hover:opacity-90 active:scale-95 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.2} />
          Unignore and restore
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {error.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAction(action)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-white/85 border transition-all hover:opacity-80 active:scale-95 text-slate-800 ${
                isCritical ? 'border-brand-acc1/35' : 'border-brand-acc2/40'
              }`}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onIgnore(error.id)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed transition-all hover:opacity-80 active:scale-95 bg-transparent ${labelColor} ${
              isCritical ? 'border-brand-acc1/35' : 'border-brand-acc2/40'
            }`}
          >
            Click to Ignore and Hide
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white font-bold text-[9px] font-mono ${badgeBg}`}
        >
          {error.id}
        </span>
        <span className="text-xs text-slate-400">
          Badge {error.id} · Page {error.page}
          {isIgnored ? ' · Ignored' : ''}
        </span>
      </div>
    </div>
  )
}
