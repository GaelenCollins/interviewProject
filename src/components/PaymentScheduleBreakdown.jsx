import {
  buildScheduleFixOptions,
  formatMoney,
} from '../utils/auditEngine'

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

export default function PaymentScheduleBreakdown({
  scheduleComparison = [],
  // scheduleFixOptions ignored — always derived from scheduleComparison in code
  scheduleFixOptions: _scheduleFixOptions = null,
}) {
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
  // Always recompute in code from schedule rows — never trust stale error.math
  // (old sessions used broken year-ratio scaling that changed group totals).
  const resolvedFixes = buildScheduleFixOptions(rows)
  // Show viable swaps (clearing first from buildScheduleFixOptions); never hide them
  const swapOptions = resolvedFixes?.swapOptions || []
  const percentPeriods = resolvedFixes?.percentMatch?.periods || []
  const perGroupEdits = resolvedFixes?.perGroupEdits || []

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

      <div className="overflow-x-auto -mx-3 px-3 max-h-56 overflow-y-auto touch-pan-x">
        <table className="w-full min-w-[520px] text-[10px] border-collapse">
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

      {swapOptions.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-brand-main">
            Easy fix: swap existing customer amounts
          </div>
          <div className="text-[10px] text-slate-600 leading-snug">
            Move dollars between periods — no new math required.
          </div>
          {swapOptions.map((opt, idx) => (
            <div
              key={`swap-${idx}`}
              className="text-[10px] text-slate-700 leading-snug space-y-0.5"
            >
              <div>
                <span className="font-semibold">
                  {opt.clearsAllDeficits ? 'Clears deficit: ' : 'Improves cash: '}
                </span>
                {opt.kind === 'group_swap' ? (
                  <>
                    in{' '}
                    <span className="font-medium">
                      {opt.groupTitle || 'group'}
                      {opt.page != null ? ` (PDF p.${opt.page})` : ''}
                    </span>
                    , swap{' '}
                  </>
                ) : (
                  'swap '
                )}
                <span className="font-medium">{opt.swap?.a?.periodLabel}</span>{' '}
                ({formatMoney(opt.swap?.a?.from)} →{' '}
                <span className="font-mono">{formatMoney(opt.swap?.a?.to)}</span>)
                {' '}with{' '}
                <span className="font-medium">{opt.swap?.b?.periodLabel}</span>{' '}
                ({formatMoney(opt.swap?.b?.from)} →{' '}
                <span className="font-mono">{formatMoney(opt.swap?.b?.to)}</span>)
              </div>
            </div>
          ))}
        </div>
      )}

      {percentPeriods.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-brand-main">
            Percent-match rebuild
          </div>
          <div className="text-[10px] text-slate-600 leading-snug">
            Apply the distributor percent-of-total split to the customer total
            {' '}({formatMoney(
              resolvedFixes?.percentMatch?.customerTotal ?? cumulativeRevenue,
            )}
            ).
          </div>
          <ul className="text-[10px] text-slate-700 space-y-0.5 pl-3 list-disc">
            {percentPeriods.map((row) => (
              <li key={`sug-${row.periodLabel}`}>
                <span className="font-medium">{row.periodLabel}</span>
                {row.distributorSharePercent != null
                  ? ` (${row.distributorSharePercent}%)`
                  : ''}
                :{' '}
                <span className="font-mono">
                  {formatMoney(row.suggestedCustomerBilling)}
                </span>
                {Number(row.currentCustomerBilling ?? row.customerBilling) !==
                Number(row.suggestedCustomerBilling) ? (
                  <span className="text-slate-400">
                    {' '}
                    (now{' '}
                    {formatMoney(row.currentCustomerBilling ?? row.customerBilling)})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {perGroupEdits.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-brand-main">
            Edit each group&apos;s Billing Schedule
          </div>
          <div className="text-[10px] text-slate-600 leading-snug">
            On the Dynamix Customer Quote (PDF), open each section and redistribute
            its Billing Schedule using the distributor period percentages. Each
            group&apos;s total stays locked (same as today).
          </div>
          {perGroupEdits.map((g) => {
            const lockedTotal =
              g.groupTotal ??
              g.currentTotal ??
              (g.periods || []).reduce(
                (a, p) => a + (Number(p.currentAmount) || 0),
                0,
              )
            return (
              <div
                key={`${g.groupTitle}-${g.page}`}
                className="text-[10px] text-slate-700 leading-snug space-y-0.5 border-t border-slate-100 pt-1.5 first:border-0 first:pt-0"
              >
                <div className="font-semibold text-brand-main">
                  {g.groupTitle}
                  {g.page != null ? (
                    <span className="font-normal text-slate-400">
                      {' '}
                      · PDF p.{g.page}
                    </span>
                  ) : null}
                </div>
                <ul className="pl-3 list-disc space-y-0.5">
                  {(g.periods || []).map((p) => (
                    <li key={`${g.groupTitle}-${p.periodLabel}`}>
                      {p.periodLabel}
                      {p.distributorSharePercent != null
                        ? ` (${p.distributorSharePercent}%)`
                        : ''}
                      :{' '}
                      <span className="font-mono text-slate-400">
                        {formatMoney(p.currentAmount)}
                      </span>
                      {' → '}
                      <span className="font-mono font-semibold">
                        {formatMoney(p.suggestedAmount)}
                      </span>
                    </li>
                  ))}
                  <li className="font-semibold list-none -ml-3 pt-0.5">
                    Group total (locked):{' '}
                    <span className="font-mono">{formatMoney(lockedTotal)}</span>
                  </li>
                </ul>
              </div>
            )
          })}
        </div>
      )}

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
    </div>
  )
}
