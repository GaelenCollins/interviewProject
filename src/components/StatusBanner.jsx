import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { computeVerdict } from '../utils/auditEngine'

export default function StatusBanner({ errors = [] }) {
  const active = errors.filter((e) => !e.hidden)
  const verdict = computeVerdict(active)
  const critical = active.filter((e) => e.severity === 'CRITICAL')
  const warnings = active.filter((e) => e.severity === 'WARNING')

  if (verdict === 'UNSAFE_TO_SEND') {
    return (
      <div className="shrink-0 px-3 md:px-4 py-1.5 md:py-2.5 bg-brand-acc1 text-white flex items-center gap-2 md:gap-3 border-b border-brand-acc1/40">
        <ShieldAlert className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          <div className="font-bold text-xs md:text-sm">Unsafe to send</div>
          <div className="hidden md:block text-xs text-white/90">
            {critical.length === 1 && !critical[0].sku
              ? String(critical[0].message || '')
                  .replace(/^(CRITICAL|WARNING|NOTICE):\s*/i, '')
              : `${critical.length} critical issue${critical.length !== 1 ? 's' : ''}: ${critical
                  .slice(0, 3)
                  .map((e) => e.sku || e.type || 'issue')
                  .join(' · ')}${critical.length > 3 ? '…' : ''}`}
          </div>
        </div>
      </div>
    )
  }

  if (verdict === 'REQUIRES_APPROVAL') {
    return (
      <div className="shrink-0 px-3 md:px-4 py-1.5 md:py-2.5 bg-brand-acc2 text-[#1a1a00] flex items-center gap-2 md:gap-3 border-b border-brand-acc2/50">
        <ShieldQuestion className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          <div className="font-bold text-xs md:text-sm">Needs manager approval</div>
          <div className="hidden md:block text-xs opacity-90">
            {warnings.length} warning{warnings.length !== 1 ? 's' : ''} need review
            before send.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 px-3 md:px-4 py-1.5 md:py-2.5 bg-brand-acc3 text-brand-main flex items-center gap-2 md:gap-3 border-b border-brand-acc3/50">
      <ShieldCheck className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
      <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
        <div className="font-bold text-xs md:text-sm">Safe to send</div>
        <div className="hidden md:block text-xs opacity-80">
          No critical or warning issues in the active error list.
        </div>
      </div>
    </div>
  )
}
