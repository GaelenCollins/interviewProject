import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { computeVerdict } from '../utils/auditEngine'

export default function StatusBanner({ errors = [] }) {
  const active = errors.filter((e) => !e.hidden)
  const verdict = computeVerdict(active)
  const critical = active.filter((e) => e.severity === 'CRITICAL')
  const warnings = active.filter((e) => e.severity === 'WARNING')

  if (verdict === 'UNSAFE_TO_SEND') {
    return (
      <div className="shrink-0 px-4 py-2.5 bg-brand-acc1 text-white flex items-start gap-3 border-b border-brand-acc1/40">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-bold text-sm">
            Unsafe to send
          </div>
          <div className="text-xs text-white/90 mt-0.5">
            {critical.length} critical issue{critical.length !== 1 ? 's' : ''}:{' '}
            {critical
              .slice(0, 3)
              .map((e) => e.sku || e.type || 'issue')
              .join(' · ')}
            {critical.length > 3 ? '…' : ''}
          </div>
        </div>
      </div>
    )
  }

  if (verdict === 'REQUIRES_APPROVAL') {
    return (
      <div className="shrink-0 px-4 py-2.5 bg-brand-acc2 text-[#1a1a00] flex items-start gap-3 border-b border-brand-acc2/50">
        <ShieldQuestion className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-bold text-sm">
            Needs manager approval
          </div>
          <div className="text-xs mt-0.5 opacity-90">
            {warnings.length} warning{warnings.length !== 1 ? 's' : ''} need review
            before send.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 px-4 py-2.5 bg-brand-acc3 text-brand-main flex items-start gap-3 border-b border-brand-acc3/50">
      <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="font-bold text-sm">Safe to send</div>
        <div className="text-xs mt-0.5 opacity-80">
          No critical or warning issues in the active error list.
        </div>
      </div>
    </div>
  )
}
