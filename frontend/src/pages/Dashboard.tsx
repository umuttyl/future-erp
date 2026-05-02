import { useEffect, useMemo, useState } from 'react'

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api, getApiErrorMessage, type DailySalesPoint, type ForecastResult } from '../lib/api'

type DashboardPoint = {
  date: string
  actualQty?: number
  forecastQty?: number
  confidence?: number
}

function iso(d: string) {
  return new Date(d).toISOString().slice(0, 10)
}

export function DashboardPage() {
  const [daily, setDaily] = useState<DailySalesPoint[]>([])
  const [forecasts, setForecasts] = useState<ForecastResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const [d, f] = await Promise.all([
          api.get<DailySalesPoint[]>('/sales/analytics/daily'),
          api.get<ForecastResult[]>('/forecast/results'),
        ])
        if (!alive) return
        setDaily(d.data)
        setForecasts(f.data)
      } catch (e: any) {
        if (!alive) return
        setError(getApiErrorMessage(e, 'Yükleme başarısız'))
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const latestProphet = useMemo(() => {
    const prophet = forecasts.filter((x) => x.model_name === 'prophet')
    return prophet.length ? prophet[0] : forecasts[0]
  }, [forecasts])

  const chartData = useMemo<DashboardPoint[]>(() => {
    const map = new Map<string, DashboardPoint>()

    for (const p of daily) {
      const key = iso(p.date)
      map.set(key, { date: key, actualQty: p.quantity })
    }

    const fDaily = latestProphet?.result_payload?.daily ?? []
    for (const p of fDaily) {
      const key = iso(p.date)
      const cur = map.get(key) ?? { date: key }
      cur.forecastQty = typeof p.quantity === 'number' ? p.quantity : typeof p.value === 'number' ? p.value : undefined
      cur.confidence = typeof p.confidence === 'number' ? p.confidence : undefined
      map.set(key, cur)
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [daily, latestProphet])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-slate-100">Dashboard</div>
          <div className="mt-1 text-sm text-slate-400">
            Geçmiş satışlar ve AI tahmini (Prophet) aynı grafikte.
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-300">
          Model:{' '}
          <span className="font-semibold text-slate-100">
            {latestProphet?.model_name ?? '—'}
          </span>
          <div className="mt-1 text-slate-500">
            Forecast rows: {latestProphet?.result_payload?.daily?.length ?? 0}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        {loading ? (
          <div className="text-sm text-slate-400">Yükleniyor…</div>
        ) : error ? (
          <div className="text-sm text-rose-300">Hata: {error}</div>
        ) : (
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="forecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Legend />
                <Area type="monotone" dataKey="actualQty" name="Gerçek Talep" stroke="#22c55e" fill="url(#actual)" />
                <Area type="monotone" dataKey="forecastQty" name="Tahmin (AI)" stroke="#60a5fa" fill="url(#forecast)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Satış gün sayısı</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">{daily.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Toplam tahmin günü</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">
            {latestProphet?.result_payload?.daily?.length ?? 0}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Not</div>
          <div className="mt-2 text-sm text-slate-300">
            Confidence, tahmin aralığından türetilen 0–1 skorudur.
          </div>
        </div>
      </div>
    </div>
  )
}

