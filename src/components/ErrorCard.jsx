import { AlertTriangle, Info, RotateCcw } from 'lucide-react'
import { CUSTOMER_QUOTE, DISTRIBUTOR_QUOTE, skuLabel } from '../constants/labels'

function cleanMessage(error) {
  return String(error.message || '')
    .replace(/^(CRITICAL|WARNING|NOTICE):\s*/i, '')
    .replace(/\s*\[[^\]]*Excel[^\]]*\]\s*$/i, '')
    .trim()
}

function LocationBlock({ error, styles }) {
  const parts = error.locationParts || null
  const hasExcel =
    parts &&
    (parts.sheetName || parts.excelCol || parts.excelRow != null || parts.excelLabel)
  const hasPdf = parts?.page != null || parts?.pdfLabel

  if (!hasExcel && !hasPdf && !error.locations) return null

  return (
    <div
      className={`rounded-lg px-2.5 py-2 text-[11px] leading-snug border ${styles.border} bg-white/70`}
    >
      <div className="font-semibold text-slate-600 mb-1">Where to look</div>
      {hasExcel && (
        <div className="text-slate-700">
          <span className="font-medium text-slate-500">{DISTRIBUTOR_QUOTE}</span>
          <div className="mt-0.5">
            {parts.sheetName ? (
              <span>
                sheet <span className="font-semibold text-brand-main">"{parts.sheetName}"</span>
              </span>
            ) : (
              <span>workbook</span>
            )}
            {parts.excelCol != null && (
              <>
                {' · '}
                column <span className="font-semibold text-brand-main">{parts.excelCol}</span>
              </>
            )}
            {parts.excelRow != null && (
              <>
                {' · '}
                row <span className="font-semibold text-brand-main">{parts.excelRow}</span>
              </>
            )}
          </div>
        </div>
      )}
      {hasPdf && (
        <div className={`text-slate-700 ${hasExcel ? 'mt-1.5' : ''}`}>
          <span className="font-medium text-slate-500">{CUSTOMER_QUOTE}</span>
          <div className="mt-0.5">
            page <span className="font-semibold text-brand-main">{parts.page}</span>
          </div>
        </div>
      )}
      {!hasExcel && !hasPdf && error.locations && (
        <div className="text-slate-700">{error.locations}</div>
      )}
    </div>
  )
}

export default function ErrorCard({
  error,
  isActive,
  isIgnored = false,
  onAction,
  onIgnore,
  onUnignore,
  onSelect,
}) {
  const severity = error.severity || 'NOTICE'
  const styles = {
    CRITICAL: {
      border: 'border-brand-acc1/40',
      bg: 'bg-brand-acc1/[0.08]',
      label: 'text-brand-acc1',
      badge: 'bg-brand-acc1',
      ring: 'ring-2 ring-brand-acc1/40',
    },
    WARNING: {
      border: 'border-brand-acc2/45',
      bg: 'bg-brand-acc2/[0.10]',
      label: 'text-[#b07d00]',
      badge: 'bg-brand-acc2',
      ring: 'ring-2 ring-brand-acc2/40',
    },
    NOTICE: {
      border: 'border-slate-300',
      bg: 'bg-slate-50',
      label: 'text-slate-600',
      badge: 'bg-slate-500',
      ring: 'ring-2 ring-slate-300',
    },
  }[severity]

  const Icon = severity === 'NOTICE' ? Info : AlertTriangle
  const severityLabel =
    severity === 'CRITICAL' ? 'Critical' : severity === 'WARNING' ? 'Warning' : 'Notice'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      className={`rounded-xl p-4 space-y-3 border-[1.5px] transition-all cursor-pointer ${styles.bg} ${styles.border} ${
        isActive ? styles.ring : ''
      } ${isIgnored ? 'opacity-90' : ''}`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${styles.label}`} strokeWidth={2} />
        <div className="min-w-0 space-y-2 flex-1">
          <p className="text-sm leading-snug text-slate-800">
            <span className={`font-bold ${styles.label}`}>{severityLabel}: </span>
            {cleanMessage(error)}
          </p>
          <LocationBlock error={error} styles={styles} />
        </div>
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
          {(error.actions || []).map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAction(action, error)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-white/85 border transition-all hover:opacity-80 active:scale-95 text-slate-800 ${styles.border}`}
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
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed transition-all hover:opacity-80 active:scale-95 bg-transparent ${styles.label} ${styles.border}`}
          >
            Hide / Ignore
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white font-bold text-[9px] font-mono ${styles.badge}`}
        >
          {error.id}
        </span>
        <span className="text-xs text-slate-400">
          {error.sku ? skuLabel(error.sku) : 'Issue'}
          {isIgnored ? ' · Ignored' : ''}
        </span>
      </div>
    </div>
  )
}
