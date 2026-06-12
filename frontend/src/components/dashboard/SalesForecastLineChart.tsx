import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type LinePoint = {
  date: string
  actualQty?: number
  forecastQty?: number
}

type SalesForecastLineChartProps = {
  data: LinePoint[]
  loading: boolean
  error: string | null
  modelName: string | undefined
  isDark: boolean
}

export function SalesForecastLineChart({ data, loading, error, modelName, isDark }: SalesForecastLineChartProps) {
  const grid       = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)'
  const axis       = isDark ? '#64748b' : '#94a3b8'
  const tipBg      = isDark ? '#11111A' : '#ffffff'
  const tipBorder  = isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.10)'
  const tipLabel   = isDark ? '#f1f5f9' : '#0f172a'

  const actualColor   = isDark ? '#818cf8' : '#4f46e5'   /* indigo */
  const forecastColor = isDark ? '#22d3ee' : '#f97316'   /* cyan / orange */

  return (
    <div className="rounded-2xl border border-ui-border-sub bg-ui-surface p-5 shadow-card dark:border-white/[0.06]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ui-text">Statistics</h2>
          <p className="mt-0.5 text-xs text-ui-muted">Actual sales and Prophet forecast</p>
        </div>
        <div className="rounded-full border border-ui-border bg-ui-surface-2 px-3 py-1 text-xs font-medium text-ui-muted">
          Model: {modelName ?? '—'}
        </div>
      </div>

      {loading ? (
        <div className="flex h-[380px] items-center justify-center text-sm text-ui-muted">Loading…</div>
      ) : error ? (
        <div className="flex h-[380px] items-center justify-center text-sm text-rose-500">{error}</div>
      ) : (
        <div className="h-[380px] w-full min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={actualColor}   stopOpacity={0.28} />
                  <stop offset="100%" stopColor={actualColor}   stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={forecastColor} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={forecastColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={grid} strokeDasharray="4 8" vertical={false} />
              <XAxis dataKey="date" stroke={axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis stroke={axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{
                  backgroundColor: tipBg,
                  border: tipBorder,
                  borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.20)',
                  fontSize: 12,
                }}
                labelStyle={{ color: tipLabel, fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: tipLabel }}
                formatter={(value) => {
                  const v = typeof value === 'number' ? Math.round(value) : value ?? '—'
                  return [v, '']
                }}
              />
              <Area
                type="monotone"
                dataKey="actualQty"
                name="Actual sales"
                stroke={actualColor}
                strokeWidth={2.5}
                fill="url(#gradActual)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: actualColor }}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="forecastQty"
                name="Prophet forecast"
                stroke={forecastColor}
                strokeWidth={2.5}
                strokeDasharray="6 3"
                fill="url(#gradForecast)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: forecastColor }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
