import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GlobalCard, GlobalCardHeader } from '../ui/GlobalCard'
import { primaryButtonClass } from '../ui/forms'
import { formatDate } from '../../lib/api'

export type ForecastPoint = {
  date: string
  actualQty?: number
  forecastQty?: number
  lower?: number
  upper?: number
}

type Props = {
  data: ForecastPoint[]
  lastTrainedAt?: string | null
  busy: boolean
  isDark: boolean
  onRefresh: () => void
}

export function ForecastChart({ data, lastTrainedAt, busy, isDark, onRefresh }: Props) {
  const gridStroke   = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.07)'
  const axisStroke   = isDark ? '#64748b' : '#94a3b8'
  const actualColor  = isDark ? '#52d9a0' : '#10b981'
  const forecastColor = isDark ? '#818cf8' : '#4f46e5'

  return (
    <GlobalCard className="lg:col-span-2">
      <GlobalCardHeader
        title="Demand Forecast (Prophet)"
        description={
          lastTrainedAt
            ? `Historical sales + forecast. Last trained: ${formatDate(lastTrainedAt)}`
            : 'No forecast available yet.'
        }
        right={
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className={primaryButtonClass + ' disabled:opacity-50'}
          >
            {busy ? 'Running…' : 'Refresh forecast'}
          </button>
        }
      />
      <div className="h-[320px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-ui-muted">
            No sales/forecast data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ai-actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={actualColor} stopOpacity={0.30} />
                  <stop offset="95%" stopColor={actualColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ai-forecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={forecastColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={forecastColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke={axisStroke} tick={{ fontSize: 12 }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: isDark ? '#11111A' : '#ffffff',
                  border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.10)',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
                }}
                labelStyle={{ color: isDark ? '#f1f5f9' : '#0f172a', fontWeight: 600 }}
                itemStyle={{ color: isDark ? '#94a3b8' : '#475569' }}
              />
              <Legend />
              <Area type="monotone" dataKey="actualQty" name="Actual demand" stroke={actualColor} strokeWidth={2.5} fill="url(#ai-actual)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              <Area type="monotone" dataKey="forecastQty" name="Forecast" stroke={forecastColor} strokeWidth={2.5} fill="url(#ai-forecast)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              <Line type="monotone" dataKey="upper" name="Upper bound" stroke={forecastColor} strokeDasharray="3 3" dot={false} strokeOpacity={0.4} />
              <Line type="monotone" dataKey="lower" name="Lower bound" stroke={forecastColor} strokeDasharray="3 3" dot={false} strokeOpacity={0.4} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </GlobalCard>
  )
}
