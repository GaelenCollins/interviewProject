import { AlertTriangle, Info, RotateCcw } from 'lucide-react'
import { CUSTOMER_QUOTE, DISTRIBUTOR_QUOTE, skuLabel } from '../constants/labels'
import PaymentScheduleBreakdown from './PaymentScheduleBreakdown'
import MarginBreakdown from './MarginBreakdown'

function cleanMessage(error) {
  return String(error.message || '')
    .replace(/^(CRITICAL|WARNING|NOTICE):\s*/i, '')
    .replace(/\s*\[[^\]]*Excel[^\]]*\]\s*$/i, '')
    .trim()
}

function hasBreakdown(error) {
  return Boolean(
    error?.showScheduleTable ||
      error?.scheduleComparison?.length ||
      error?.showMarginTable ||
      error?.omittedTerms?.length ||
      error?.detailLines?.length ||
      /MARGIN|ZERO|NEGATIVE|FLOOR|CEILING|OUTLIER|TARGET_BAND|PAYMENT_SCHEDULE|CASH.?FLOW|OMITTED_DISTRIBUTOR/i.test(
        error?.type || '',
      ),
  )
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

function noteTopicLabel(term) {
  const blob = `${term?.text || ''} ${(term?.keywords || []).join(' ')}`.toLowerCase()
  if (/payment|due|net\s*\d+|billing/.test(blob)) return 'Payment terms'
  if (/ship|shipment|ship-to|address/.test(blob)) return 'Shipping / ship-to'
  if (/license|version|support/.test(blob)) return 'License / support'
  if (/renewal|coterm/.test(blob)) return 'Renewal / coterm'
  return 'Distributor note'
}

function shortQuote(text, max = 140) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function OmittedTermsDetail({ terms = [] }) {
  if (!terms.length) return null
  return (
    <div
      className="rounded-xl border border-brand-acc2/40 bg-white p-3 space-y-2.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div className="text-xs font-semibold text-brand-main">
        What is missing from the PDF
      </div>
      <p className="text-[11px] text-slate-500 leading-snug">
        The distributor Excel Notes mention these points, but the customer quote
        does not. Worth confirming before send.
      </p>
      <ul className="space-y-2">
        {terms.map((term, i) => (
          <li
            key={i}
            className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2"
          >
            <div className="text-[11px] font-semibold text-brand-main">
              {noteTopicLabel(term)}
            </div>
            <div className="text-[11px] text-slate-700 leading-snug mt-0.5">
              “{shortQuote(term.text)}”
            </div>
            {term.excelRow != null ? (
              <div className="text-[10px] text-slate-400 mt-1">
                Excel Notes · row {term.excelRow}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
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
  analysis = null,
  meanMarginPercent = null,
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

  const showMargin =
    isActive &&
    !isIgnored &&
    (error.showMarginTable ||
      /MARGIN|ZERO|NEGATIVE|FLOOR|CEILING|OUTLIER|TARGET_BAND/i.test(error.type || ''))
  const showSchedule =
    isActive &&
    !isIgnored &&
    (error.showScheduleTable || error.scheduleComparison?.length) &&
    error.scheduleComparison?.length
  const showOmitted =
    isActive &&
    !isIgnored &&
    (error.omittedTerms?.length ||
      /OMITTED_DISTRIBUTOR/i.test(error.type || ''))

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
            {!isActive &&
              hasBreakdown(error) &&
              !/click for breakdown/i.test(error.message || '') && (
                <span className="text-slate-500"> Click for breakdown.</span>
              )}
          </p>
          <LocationBlock error={error} styles={styles} />
          {showMargin ? (
            <MarginBreakdown
              analysis={analysis}
              focusSku={error.sku}
              meanMarginPercent={meanMarginPercent}
            />
          ) : null}
          {showSchedule ? (
            <PaymentScheduleBreakdown
              scheduleComparison={error.scheduleComparison}
            />
          ) : null}
          {showOmitted ? (
            <OmittedTermsDetail
              terms={error.omittedTerms || []}
            />
          ) : null}
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
