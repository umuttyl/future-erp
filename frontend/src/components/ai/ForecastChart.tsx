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
  const gridStroke = isDark ? '#334155' : '#cbd5e1'
  const axisStroke = isDark ? '#94a3b8' : '#64748b'

  return (
    <GlobalCard className="lg:col-span-2">
      <GlobalCardHeader
        title="Talep tahmini (Prophet)"
        description={
          lastTrainedAt
            ? `Geçmiş satışlar + tahmin. Son eğitim: ${formatDate(lastTrainedAt)}`
            : 'Henüz tahmin yok.'
        }
        right={
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className={primaryButtonClass + ' disabled:opacity-50'}
          >
            {busy ? 'Çalışıyor…' : 'Tahmini yenile'}
          </button>
        }
      />
      <div className="h-[320px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            Henüz satış/tahmin verisi yok.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ai-actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="ai-forecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke={axisStroke} tick={{ fontSize: 12 }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: isDark ? '#0f172a' : '#ffffff',
                  border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                  borderRadius: 12,
                }}
                labelStyle={{ color: isDark ? '#e2e8f0' : '#0f172a' }}
                itemStyle={{ color: isDark ? '#e2e8f0' : '#334155' }}
              />
              <Legend />
              <Area type="monotone" dataKey="actualQty" name="Gerçek talep" stroke="#22c55e" fill="url(#ai-actual)" />
              <Area type="monotone" dataKey="forecastQty" name="Tahmin" stroke="#60a5fa" fill="url(#ai-forecast)" />
              <Line type="monotone" dataKey="upper" name="Üst sınır" stroke="#60a5fa" strokeDasharray="3 3" dot={false} strokeOpacity={0.5} />
              <Line type="monotone" dataKey="lower" name="Alt sınır" stroke="#60a5fa" strokeDasharray="3 3" dot={false} strokeOpacity={0.5} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </GlobalCard>
  )
}
