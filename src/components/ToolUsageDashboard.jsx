import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const C = {
  navy: '#00365e',
  teal: '#72c9d1',
  rust: '#c64f1e',
  amber: '#f2a90f',
  lime: '#afc413',
  critical: '#c64f1e',
  warning: '#f2a90f',
  notice: '#72c9d1',
  cardBg: '#ffffff',
  pageBg: '#f1f5f9',
  borderLight: '#e2e8f0',
  muted: '#64748b',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
}

/** Hardcoded sample data for a future analytics feature — not connected to live audits. */
const trendData = [
  { week: 'May 5', critical: 18, warning: 42, notice: 31 },
  { week: 'May 12', critical: 22, warning: 38, notice: 28 },
  { week: 'May 19', critical: 15, warning: 51, notice: 35 },
  { week: 'May 26', critical: 28, warning: 44, notice: 22 },
  { week: 'Jun 2', critical: 34, warning: 57, notice: 40 },
  { week: 'Jun 9', critical: 29, warning: 49, notice: 37 },
  { week: 'Jun 16', critical: 41, warning: 62, notice: 44 },
  { week: 'Jun 23', critical: 38, warning: 55, notice: 31 },
  { week: 'Jun 30', critical: 25, warning: 47, notice: 29 },
  { week: 'Jul 7', critical: 31, warning: 58, notice: 42 },
  { week: 'Jul 14', critical: 44, warning: 65, notice: 48 },
  { week: 'Jul 21', critical: 37, warning: 52, notice: 39 },
  { week: 'Jul 28', critical: 29, warning: 43, notice: 35 },
  { week: 'Aug 3', critical: 22, warning: 38, notice: 28 },
]

const auditRows = [
  {
    id: '20260318.1316',
    customer: 'Customer A',
    distributor: 'Distributor A',
    date: 'Aug 03',
    errors: '1 Critical Error',
    errorLevel: 'critical',
    status: 'FAILED',
  },
  {
    id: '20260319.4412',
    customer: 'Customer B',
    distributor: 'Distributor B',
    date: 'Aug 02',
    errors: '3 Warnings',
    errorLevel: 'warning',
    status: 'OVERRIDDEN',
  },
  {
    id: '20260320.1092',
    customer: 'Customer C',
    distributor: 'Distributor C',
    date: 'Aug 01',
    errors: '0 Errors',
    errorLevel: 'pass',
    status: 'PASSED',
  },
]

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl shadow-xl p-3 text-xs"
      style={{
        background: C.navy,
        border: '1px solid rgba(114,201,209,0.3)',
        minWidth: 150,
      }}
    >
      <div className="font-semibold mb-2" style={{ color: C.teal }}>
        Week of {label}
      </div>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center justify-between gap-4 mb-1"
        >
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span
              style={{
                color: 'rgba(255,255,255,0.7)',
                textTransform: 'capitalize',
              }}
            >
              {entry.name}
            </span>
          </div>
          <span className="font-mono font-semibold" style={{ color: '#fff' }}>
            {entry.value}
          </span>
        </div>
      ))}
      <div
        className="mt-2 pt-2 flex justify-between"
        style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
      >
        <span style={{ color: 'rgba(255,255,255,0.45)' }}>Total</span>
        <span className="font-mono font-bold" style={{ color: '#fff' }}>
          {payload.reduce((s, e) => s + e.value, 0)}
        </span>
      </div>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  subColor,
  badge,
  badgeColor,
  badgeBg,
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderLight}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: '#f1f5f9' }}
        >
          {icon}
        </div>
        {badge ? (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: badgeBg, color: badgeColor }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <div>
        <div className="text-xs font-medium mb-0.5" style={{ color: C.muted }}>
          {label}
        </div>
        <div
          className="font-bold"
          style={{ color: C.textPrimary, fontSize: 22 }}
        >
          {value}
        </div>
      </div>
      {sub ? (
        <div className="text-xs" style={{ color: subColor }}>
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    FAILED: { bg: 'rgba(198,79,30,0.10)', color: '#c64f1e' },
    OVERRIDDEN: { bg: 'rgba(242,169,15,0.12)', color: '#b45309' },
    PASSED: { bg: 'rgba(175,196,19,0.14)', color: '#4d7c0f' },
    PENDING: { bg: 'rgba(100,116,139,0.12)', color: '#475569' },
    REVISED: { bg: 'rgba(198,79,30,0.10)', color: '#c64f1e' },
  }
  const s = map[status] ?? { bg: 'rgba(100,116,139,0.12)', color: '#475569' }
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {status}
    </span>
  )
}

function ErrorDot({ level }) {
  const color =
    level === 'critical' ? C.rust : level === 'warning' ? '#b45309' : '#4d7c0f'
  return (
    <span
      className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
      style={{ background: color }}
      aria-hidden
    />
  )
}

export default function ToolUsageDashboard() {
  const [dateRange, setDateRange] = useState('Last 90 Days')
  const [distributor, setDistributor] = useState('All Distributors')

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: C.pageBg }}
    >
      <div
        className="shrink-0 px-5 py-2.5 text-xs leading-snug border-b"
        style={{
          background: 'rgba(242,169,15,0.12)',
          borderColor: 'rgba(242,169,15,0.35)',
          color: '#92400e',
        }}
        role="note"
      >
        <span className="font-semibold">Sample preview only.</span> All metrics,
        charts, and rows below are hardcoded demo data — not from your audits.
        This illustrates a possible future Tool Usage Dashboard.
      </div>

      <div
        className="shrink-0 flex items-center justify-between px-5 py-3"
        style={{
          background: '#fff',
          borderBottom: `1px solid ${C.borderLight}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div>
          <div className="font-bold" style={{ color: C.navy, fontSize: 15 }}>
            Tool Usage Dashboard
          </div>
          <div className="text-xs" style={{ color: C.muted }}>
            Quote audit performance overview (mock)
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs rounded-lg px-3 py-1.5 font-medium outline-none cursor-pointer"
            style={{
              border: `1px solid ${C.borderLight}`,
              color: C.navy,
              background: '#fff',
            }}
            aria-label="Date range (sample only)"
          >
            {['Last 30 Days', 'Last 90 Days', 'Last 6 Months', 'Year to Date'].map(
              (o) => (
                <option key={o}>{o}</option>
              ),
            )}
          </select>
          <select
            value={distributor}
            onChange={(e) => setDistributor(e.target.value)}
            className="text-xs rounded-lg px-3 py-1.5 font-medium outline-none cursor-pointer"
            style={{
              border: `1px solid ${C.borderLight}`,
              color: C.navy,
              background: '#fff',
            }}
            aria-label="Distributor filter (sample only)"
          >
            {[
              'All Distributors',
              'Distributor A',
              'Distributor B',
              'Distributor C',
            ].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <button
            type="button"
            disabled
            title="Not available in this sample preview"
            className="text-xs px-3 py-1.5 rounded-lg font-medium opacity-50 cursor-not-allowed"
            style={{ background: C.navy, color: '#fff' }}
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled
            title="Not available in this sample preview"
            className="text-xs px-3 py-1.5 rounded-lg font-medium opacity-50 cursor-not-allowed"
            style={{ background: C.rust, color: '#fff' }}
          >
            Export PDF
          </button>
          <button
            type="button"
            disabled
            title="Not available in this sample preview"
            className="w-8 h-8 rounded-lg flex items-center justify-center opacity-50 cursor-not-allowed"
            style={{ background: '#f1f5f9', color: C.navy }}
            aria-label="Refresh (disabled in sample)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-5 overflow-auto min-h-0">
        <div
          className="shrink-0 grid gap-4"
          style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
        >
          <KpiCard
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.navy}
                strokeWidth="2"
                strokeLinecap="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }
            label="Total Quotes Audited"
            value="1,428 Quotes"
            sub="Sample total for this period"
            subColor={C.muted}
          />
          <KpiCard
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.rust}
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            }
            label="Critical Errors Flagged"
            value="342 Errors"
            sub="Sample critical count"
            subColor={C.rust}
            badge="Critical"
            badgeBg="rgba(198,79,30,0.1)"
            badgeColor={C.rust}
          />
          <KpiCard
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4d7c0f"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
            label="Auto-Pass Rate"
            value="74.2% Safe to Send"
            sub="Sample health metric"
            subColor="#4d7c0f"
            badge="Healthy"
            badgeBg="rgba(175,196,19,0.14)"
            badgeColor="#4d7c0f"
          />
        </div>

        <div
          className="flex flex-col rounded-xl p-5 min-h-[280px] h-[360px]"
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderLight}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
              <div
                className="font-semibold text-sm"
                style={{ color: C.textPrimary }}
              >
                Error Trends Over Time
              </div>
              <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                Weekly sample — May → Aug 2026
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {[
                {
                  label: 'Critical',
                  color: C.critical,
                  total: trendData.reduce((s, d) => s + d.critical, 0),
                },
                {
                  label: 'Warning',
                  color: C.warning,
                  total: trendData.reduce((s, d) => s + d.warning, 0),
                },
                {
                  label: 'Notice',
                  color: C.notice,
                  total: trendData.reduce((s, d) => s + d.notice, 0),
                },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: s.color }}
                  />
                  <span className="text-xs" style={{ color: C.muted }}>
                    {s.label}
                  </span>
                  <span
                    className="text-xs font-mono font-semibold"
                    style={{ color: C.textPrimary }}
                  >
                    {s.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trendData}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gcrit" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={C.critical}
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="95%"
                      stopColor={C.critical}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                  <linearGradient id="gwarn" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={C.warning}
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="95%"
                      stopColor={C.warning}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                  <linearGradient id="gnotice" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={C.notice}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor={C.notice}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(51,65,85,0.07)"
                  vertical={false}
                />
                <XAxis
                  dataKey="week"
                  tick={{ fill: C.muted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fill: C.muted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  cursor={{
                    stroke: 'rgba(114,201,209,0.25)',
                    strokeWidth: 1,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="notice"
                  name="notice"
                  stroke={C.notice}
                  strokeWidth={2}
                  fill="url(#gnotice)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="warning"
                  name="warning"
                  stroke={C.warning}
                  strokeWidth={2}
                  fill="url(#gwarn)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="critical"
                  name="critical"
                  stroke={C.critical}
                  strokeWidth={2}
                  fill="url(#gcrit)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="shrink-0 rounded-xl overflow-hidden"
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderLight}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div
            className="px-5 py-3"
            style={{ borderBottom: `1px solid ${C.borderLight}` }}
          >
            <div
              className="font-semibold text-sm"
              style={{ color: C.textPrimary }}
            >
              Recent Audited Quotes
            </div>
            <div className="text-xs mt-0.5" style={{ color: C.muted }}>
              Sample rows — not live audit history
            </div>
          </div>
          <div className="overflow-x-auto">
            <table
              className="w-full text-xs"
              style={{ borderCollapse: 'collapse' }}
            >
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    'Quote ID',
                    'Customer',
                    'Distributor',
                    'Date',
                    'Errors Caught',
                    'Status',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-2.5 font-semibold"
                      style={{
                        color: C.muted,
                        borderBottom: `1px solid ${C.borderLight}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-50 group"
                    style={{ borderBottom: `1px solid ${C.borderLight}` }}
                  >
                    <td className="px-5 py-3">
                      <span
                        className="font-mono font-semibold"
                        style={{ color: C.navy, fontSize: 11 }}
                      >
                        {row.id}
                      </span>
                    </td>
                    <td className="px-5 py-3" style={{ color: C.textPrimary }}>
                      {row.customer}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full"
                        style={{
                          background: '#f1f5f9',
                          color: C.textSecondary,
                        }}
                      >
                        {row.distributor}
                      </span>
                    </td>
                    <td
                      className="px-5 py-3 font-mono"
                      style={{ color: C.muted }}
                    >
                      {row.date}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        style={{
                          color:
                            row.errorLevel === 'critical'
                              ? C.rust
                              : row.errorLevel === 'warning'
                                ? '#b45309'
                                : '#4d7c0f',
                        }}
                      >
                        <ErrorDot level={row.errorLevel} />
                        {row.errors}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <button
                          type="button"
                          disabled
                          title="Not available in this sample preview"
                          className="px-2.5 py-1 rounded-md text-xs font-medium cursor-not-allowed"
                          style={{
                            background: 'rgba(0,54,94,0.08)',
                            color: C.navy,
                          }}
                        >
                          View Report
                        </button>
                        <button
                          type="button"
                          disabled
                          title="Not available in this sample preview"
                          className="px-2.5 py-1 rounded-md text-xs font-medium cursor-not-allowed"
                          style={{
                            background: 'rgba(198,79,30,0.08)',
                            color: C.rust,
                          }}
                        >
                          Export PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
