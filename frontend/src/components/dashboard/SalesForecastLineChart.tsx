import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'
  const axis = isDark ? '#94a3b8' : '#64748b'
  const tipBg = isDark ? '#16122b' : '#ffffff'
  const tipBorder = isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.12)'
  const tipLabel = isDark ? '#e2e8f0' : '#0f172a'

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-5 shadow-card dark:border-white/10 dark:bg-[#16122b] dark:shadow-card-dark">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">İstatistikler</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Gerçekleşen satış ve Prophet tahmini</p>
        </div>
        <div className="rounded-full border border-surface-border bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          Model: {modelName ?? '—'}
        </div>
      </div>
      {loading ? (
        <div className="flex h-[380px] items-center justify-center text-sm text-slate-500">Yükleniyor…</div>
      ) : error ? (
        <div className="flex h-[380px] items-center justify-center text-sm text-rose-500">{error}</div>
      ) : (
        <div className="h-[380px] w-full min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="4 8" vertical={false} />
              <XAxis dataKey="date" stroke={axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis stroke={axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{
                  backgroundColor: tipBg,
                  border: tipBorder,
                  borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                }}
                labelStyle={{ color: tipLabel, fontWeight: 600 }}
                itemStyle={{ color: tipLabel }}
                formatter={(value) => {
                  const v = typeof value === 'number' ? Math.round(value) : value ?? '—'
                  return [v, '']
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="actualQty"
                name="Gerçekleşen satış"
                stroke="#22c55e"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="forecastQty"
                name="Prophet tahmini"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
