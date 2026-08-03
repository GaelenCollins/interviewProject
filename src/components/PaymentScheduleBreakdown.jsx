import { formatMoney } from '../utils/auditEngine'

function formatNetLabel(netCashFlow) {
  const n = Number(netCashFlow) || 0
  if (n < -0.005) return formatMoney(n)
  if (n > 0.005) return `+${formatMoney(n)}`
  return formatMoney(0)
}

function statusLabel(row) {
  const net = Number(row.netCashFlow) || 0
  if (row.hasDeficit || net < -0.005) return 'Deficit'
  if (net > 0.005) return 'Surplus'
  return 'Even'
}

function formatShare(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return null
  return `${Number(pct)}% of total`
}

function MoneyWithShare({ amount, sharePercent, emphasize = false }) {
  const share = formatShare(sharePercent)
  return (
    <div className={`text-right ${emphasize ? 'font-semibold text-brand-acc1' : ''}`}>
      <div className="font-mono">{formatMoney(amount)}</div>
      {share ? (
        <div className="text-[9px] font-normal text-slate-400 mt-0.5">{share}</div>
      ) : null}
    </div>
  )
}

export default function PaymentScheduleBreakdown({ scheduleComparison = [] }) {
  const rows = Array.isArray(scheduleComparison) ? scheduleComparison : []
  if (!rows.length) return null

  const cumulativeCost = rows.reduce(
    (a, r) => a + (Number(r.distributorCost) || 0),
    0,
  )
  const cumulativeRevenue = rows.reduce(
    (a, r) => a + (Number(r.customerBilling) || 0),
    0,
  )
  const totalGrossProfit = cumulativeRevenue - cumulativeCost
  const problemRows = rows.filter((r) => r.hasDeficit || Number(r.netCashFlow) < -0.005)
  const rolledUpRows = rows.filter((r) => r.wasRolledUp && r.additionDetail)

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-3 space-y-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-brand-main">
          Payment schedule breakdown
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          {rows.length} period{rows.length !== 1 ? 's' : ''}
        </div>
      </div>

      {rolledUpRows.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-brand-main">
            How yearly totals were added
          </div>
          {rolledUpRows.map((row) => (
            <div
              key={`add-${row.periodLabel}`}
              className={`text-[10px] leading-snug ${
                row.hasDeficit ? 'text-brand-acc1' : 'text-slate-600'
              }`}
            >
              <span className="font-semibold">{row.periodLabel}:</span>{' '}
              {row.additionDetail}
            </div>
          ))}
        </div>
      )}

      {problemRows.length > 0 && (
        <div className="rounded-lg border border-brand-acc1/30 bg-brand-acc1/5 px-2.5 py-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-brand-acc1">
            Problem period payments
          </div>
          {problemRows.map((row) => (
            <div key={`prob-${row.periodLabel}`} className="space-y-0.5">
              <div className="text-[10px] font-semibold text-brand-acc1">
                {row.periodLabel} — net {formatMoney(row.netCashFlow)}
                {row.customerSharePercent != null
                  ? ` · ${row.customerSharePercent}% of customer total`
                  : ''}
              </div>
              {(row.contributions || []).length > 0 ? (
                <ul className="text-[10px] text-slate-700 space-y-0.5 pl-3 list-disc">
                  {(row.contributions || []).map((c, i) => (
                    <li key={`${c.groupTitle}-${i}`}>
                      <span className="font-medium">{c.groupTitle}</span>
                      {c.page != null ? ` (PDF p.${c.page})` : ''}:{' '}
                      <span className="font-mono">{formatMoney(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[10px] text-slate-600 pl-1">
                  Customer billed {formatMoney(row.customerBilling)} vs distributor
                  due {formatMoney(row.distributorCost)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto max-h-56 overflow-y-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="py-1.5 pr-2 font-medium">Period / Year</th>
              <th className="py-1.5 pr-2 font-medium text-right">
                Distributor Due (Cost)
              </th>
              <th className="py-1.5 pr-2 font-medium text-right">
                Customer Billed (Revenue)
              </th>
              <th className="py-1.5 pr-2 font-medium text-right">
                Net Position
              </th>
              <th className="py-1.5 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const net = Number(row.netCashFlow) || 0
              const deficit = row.hasDeficit || net < -0.005
              const badgeClass = deficit
                ? 'bg-brand-acc1/15 text-brand-acc1 border-brand-acc1/30'
                : net > 0.005
                  ? 'bg-brand-acc3/20 text-[#5a7a00] border-brand-acc3/40'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              return (
                <tr
                  key={`${row.periodLabel}-${idx}`}
                  className={`border-t border-slate-100 ${
                    deficit ? 'bg-brand-acc1/10 ring-1 ring-inset ring-brand-acc1/25' : ''
                  }`}
                >
                  <td className="py-1.5 pr-2 font-medium text-brand-main">
                    {row.periodLabel || `Period ${idx + 1}`}
                    {row.wasRolledUp ? (
                      <span className="ml-1 text-[9px] font-normal text-slate-400">
                        (summed)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <MoneyWithShare
                      amount={row.distributorCost}
                      sharePercent={row.distributorSharePercent}
                    />
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <MoneyWithShare
                      amount={row.customerBilling}
                      sharePercent={row.customerSharePercent}
                      emphasize={deficit}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right align-top">
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded border font-mono font-semibold ${badgeClass}`}
                    >
                      {formatNetLabel(net)}
                    </span>
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold align-top ${
                      deficit
                        ? 'text-brand-acc1'
                        : net > 0.005
                          ? 'text-[#5a7a00]'
                          : 'text-slate-500'
                    }`}
                  >
                    {statusLabel(row)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-brand-main">
              <td className="py-2 pr-2">Cumulative</td>
              <td className="py-2 pr-2 text-right font-mono">
                {formatMoney(cumulativeCost)}
                <div className="text-[9px] font-normal text-slate-400">100% of total</div>
              </td>
              <td className="py-2 pr-2 text-right font-mono">
                {formatMoney(cumulativeRevenue)}
                <div className="text-[9px] font-normal text-slate-400">100% of total</div>
              </td>
              <td className="py-2 pr-2 text-right font-mono" colSpan={2}>
                Gross profit {formatMoney(totalGrossProfit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
