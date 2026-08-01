import { formatMoney } from '../utils/auditEngine'

export default function MarginBreakdown({
  analysis,
  focusSku = null,
  meanMarginPercent = null,
}) {
  const lines = (analysis?.lines || []).filter((l) => l.inExcel && l.inPdf)

  if (!lines.length) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-brand-main">
          Margin anomaly breakdown
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          <span className="font-mono">clean mean {meanMarginPercent ?? '—'}%</span>
          <span className="ml-2">target 8–12%</span>
        </div>
      </div>

      <div className="overflow-x-auto max-h-48 overflow-y-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">SKU</th>
              <th className="py-1 pr-2 font-medium text-right">Cost</th>
              <th className="py-1 pr-2 font-medium text-right">Sell</th>
              <th className="py-1 font-medium text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => {
              const hot =
                row.sku === focusSku ||
                row.margin <= 0 ||
                (row.margin != null && (row.margin < 5 || row.margin > 20))
              const marginText =
                row.margin == null
                  ? '—'
                  : row.margin === 0 || Object.is(row.margin, -0)
                    ? '0%'
                    : `${row.marginRounded ?? '—'}%`
              return (
                <tr
                  key={row.sku}
                  className={`border-t border-slate-100 ${
                    hot ? 'bg-brand-acc1/10' : ''
                  }`}
                >
                  <td className="py-1 pr-2 font-mono text-brand-main">{row.sku}</td>
                  <td className="py-1 pr-2 text-right font-mono">
                    {formatMoney(row.resellerUnitCost)}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">
                    {formatMoney(row.unitPrice)}
                  </td>
                  <td
                    className={`py-1 text-right font-mono font-semibold ${
                      row.margin != null && row.margin <= 0
                        ? 'text-brand-acc1'
                        : row.margin != null && row.margin < 5
                          ? 'text-[#b07d00]'
                          : 'text-slate-700'
                    }`}
                  >
                    {marginText}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
