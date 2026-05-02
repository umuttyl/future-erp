import { useEffect, useMemo, useState } from 'react'

import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  api,
  formatCurrency,
  formatDate,
  formatNumber,
  getApiErrorMessage,
  type AiHighlight,
  type AiInsights,
  type DailySalesPoint,
  type ForecastResult,
  type NlpQueryResponse,
  type StockAlert,
} from '../lib/api'

type DashboardPoint = {
  date: string
  actualQty?: number
  forecastQty?: number
  lower?: number
  upper?: number
}

const SAMPLE_QUESTIONS = [
  'En yüksek ciro getiren 5 ürünü listele',
  'Son 30 günün aylık cirosunu göster',
  'Stoğu eşik seviyesinin altında olan ürünler',
  'Hangi müşteri en çok sipariş verdi?',
]

function iso(d: string) {
  return new Date(d).toISOString().slice(0, 10)
}

export function AiAnalysisPage() {
  const [insights, setInsights] = useState<AiInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [daily, setDaily] = useState<DailySalesPoint[]>([])
  const [forecasts, setForecasts] = useState<ForecastResult[]>([])
  const [forecastBusy, setForecastBusy] = useState(false)

  const [question, setQuestion] = useState('')
  const [qLoading, setQLoading] = useState(false)
  const [qResult, setQResult] = useState<NlpQueryResponse | null>(null)
  const [qError, setQError] = useState<string | null>(null)

  async function loadInsights() {
    try {
      setInsightsLoading(true)
      setInsightsError(null)
      const { data } = await api.get<AiInsights>('/ai/insights')
      setInsights(data)
    } catch (e: any) {
      setInsightsError(getApiErrorMessage(e, 'AI özeti yüklenemedi'))
    } finally {
      setInsightsLoading(false)
    }
  }

  async function loadSupporting() {
    try {
      const [a, d, f] = await Promise.all([
        api.get<StockAlert[]>('/ai/stock-alerts'),
        api.get<DailySalesPoint[]>('/sales/analytics/daily'),
        api.get<ForecastResult[]>('/forecast/results'),
      ])
      setAlerts(a.data)
      setDaily(d.data)
      setForecasts(f.data)
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    loadInsights()
    loadSupporting()
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
    for (const p of fDaily as any[]) {
      const key = iso(p.date)
      const cur = map.get(key) ?? { date: key }
      cur.forecastQty =
        typeof p.quantity === 'number'
          ? p.quantity
          : typeof p.value === 'number'
          ? p.value
          : undefined
      cur.lower = typeof p.yhat_lower === 'number' ? p.yhat_lower : undefined
      cur.upper = typeof p.yhat_upper === 'number' ? p.yhat_upper : undefined
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [daily, latestProphet])

  async function runProphet() {
    setForecastBusy(true)
    try {
      await api.post('/forecast/prophet/run', { horizon_days: 30 })
      await loadSupporting()
    } catch (e: any) {
      alert(getApiErrorMessage(e, 'Tahmin çalıştırılamadı'))
    } finally {
      setForecastBusy(false)
    }
  }

  async function askQuestion(text?: string) {
    const q = (text ?? question).trim()
    if (q.length < 3) return
    setQuestion(q)
    setQLoading(true)
    setQError(null)
    setQResult(null)
    try {
      const { data } = await api.post<NlpQueryResponse>('/nlp/query', { text: q })
      setQResult(data)
    } catch (e: any) {
      setQError(getApiErrorMessage(e, 'Soru çalıştırılamadı'))
    } finally {
      setQLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-slate-100">AI Analizi</div>
          <div className="mt-1 text-sm text-slate-400">
            Gemini destekli içgörüler, Prophet tabanlı talep tahmini ve doğal dil sorguları.
          </div>
        </div>
        <button
          onClick={loadInsights}
          disabled={insightsLoading}
          className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {insightsLoading ? 'Yükleniyor…' : 'İçgörüyü Yenile'}
        </button>
      </div>

      <section className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-slate-900/40 to-slate-900/60 p-6">
        <div className="text-xs uppercase tracking-wide text-sky-300">AI Headline</div>
        <div className="mt-2 text-xl font-semibold text-slate-100">
          {insightsLoading
            ? 'AI işletme verilerinizi analiz ediyor…'
            : insightsError
            ? `Hata: ${insightsError}`
            : insights?.headline ?? '—'}
        </div>
        {insights && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <Chip
              label="Son 30 gün ciro"
              value={formatCurrency(insights.context.summary_last_30.revenue)}
            />
            <Chip
              label="Ciro değişimi"
              value={`${insights.context.revenue_growth_pct >= 0 ? '+' : ''}${insights.context.revenue_growth_pct.toFixed(2)}%`}
              accent={insights.context.revenue_growth_pct >= 0 ? 'positive' : 'warning'}
            />
            <Chip
              label="Kritik stok"
              value={formatNumber(insights.context.low_stock_products.length)}
              accent={insights.context.low_stock_products.length > 0 ? 'critical' : 'positive'}
            />
            <Chip
              label="Aktif SKU"
              value={formatNumber(insights.context.total_skus)}
            />
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {insightsLoading && <HighlightSkeleton />}
        {insightsLoading && <HighlightSkeleton />}
        {insightsLoading && <HighlightSkeleton />}
        {!insightsLoading &&
          (insights?.highlights ?? []).map((h, i) => <HighlightCard key={i} h={h} />)}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-200">
                Talep Tahmini (Prophet)
              </div>
              <div className="text-xs text-slate-500">
                Geçmiş satışlar + 30 günlük AI tahmini.{' '}
                {latestProphet
                  ? `Son eğitim: ${formatDate(latestProphet.created_at)}`
                  : 'Henüz tahmin yok.'}
              </div>
            </div>
            <button
              onClick={runProphet}
              disabled={forecastBusy}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
            >
              {forecastBusy ? 'Çalışıyor…' : 'Tahmini Yenile'}
            </button>
          </div>
          <div className="h-[320px]">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Henüz satış/tahmin verisi yok.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 12 }}
                    labelStyle={{ color: '#e2e8f0' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="actualQty"
                    name="Gerçek Talep"
                    stroke="#22c55e"
                    fill="url(#ai-actual)"
                  />
                  <Area
                    type="monotone"
                    dataKey="forecastQty"
                    name="Tahmin"
                    stroke="#60a5fa"
                    fill="url(#ai-forecast)"
                  />
                  <Line
                    type="monotone"
                    dataKey="upper"
                    name="Üst sınır"
                    stroke="#60a5fa"
                    strokeDasharray="3 3"
                    dot={false}
                    strokeOpacity={0.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="lower"
                    name="Alt sınır"
                    stroke="#60a5fa"
                    strokeDasharray="3 3"
                    dot={false}
                    strokeOpacity={0.5}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <div className="mb-3 text-sm font-semibold text-slate-200">Stok Uyarıları</div>
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Şu an kritik seviyede olan ürün yok.
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2"
                >
                  <div>
                    <div className="font-semibold text-slate-100">{a.name}</div>
                    <div className="text-xs text-slate-400">{a.sku}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-rose-200">
                      {a.stock_quantity} / {a.reorder_level}
                    </div>
                    <div className="text-[10px] text-slate-500">stok / eşik</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-200">Aylık Trend</div>
            <div className="text-xs text-slate-500">Son aylardaki ciro ve sipariş hacmi.</div>
          </div>
        </div>
        <div className="h-[260px]">
          {insights ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={insights.context.monthly_revenue}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v)
                  }
                />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 12 }}
                  formatter={(value: any, name: any) =>
                    name === 'Ciro'
                      ? [formatCurrency(Number(value)), name]
                      : [formatNumber(Number(value)), name]
                  }
                />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  name="Ciro"
                  stroke="#60a5fa"
                  fill="#60a5fa22"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  name="Sipariş"
                  stroke="#22c55e"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Yükleniyor…
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-200">AI'ya Hızlı Soru</div>
          <div className="text-xs text-slate-500">
            Doğal dilde veriniz hakkında soru sorun, AI uygun SQL'i üretip cevap yazsın.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => askQuestion(q)}
              className="rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !qLoading) askQuestion()
            }}
            placeholder="Örn: En yüksek stokta olan 3 kategoriyi listele"
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
          />
          <button
            onClick={() => askQuestion()}
            disabled={qLoading || question.trim().length < 3}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            {qLoading ? 'Düşünüyor…' : 'Sor'}
          </button>
        </div>

        {qError && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            Hata: {qError}
          </div>
        )}

        {qResult && (
          <div className="mt-4 space-y-3">
            <div className="whitespace-pre-wrap rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-slate-100">
              {qResult.answer}
            </div>
            {qResult.data.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
                <div className="max-h-[340px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="sticky top-0 bg-slate-900/90 text-left text-[11px] uppercase tracking-wide text-slate-400">
                        {qResult.columns.map((c) => (
                          <th key={c} className="px-3 py-2 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {qResult.data.map((row, i) => (
                        <tr key={i} className="border-t border-slate-800/60">
                          {qResult.columns.map((c) => (
                            <td key={c} className="px-3 py-2 text-slate-200">
                              {formatCellLoose(c, (row as Record<string, unknown>)[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer select-none">Kullanılan SQL</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-300">
                {qResult.sql}
              </pre>
            </details>
          </div>
        )}
      </section>
    </div>
  )
}

function formatCellLoose(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  const lk = key.toLowerCase()
  if (
    lk.includes('ciro') ||
    lk.includes('tutar') ||
    lk.includes('amount') ||
    lk.includes('revenue') ||
    lk.includes('price') ||
    lk.includes('cost')
  ) {
    const n = Number(value)
    if (Number.isFinite(n)) return formatCurrency(n)
  }
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return String(value)
}

function Chip({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'positive' | 'warning' | 'critical'
}) {
  const cls =
    accent === 'positive'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : accent === 'warning'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : accent === 'critical'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
      : 'border-slate-800 bg-slate-900/40 text-slate-200'
  return (
    <div className={['rounded-xl border px-3 py-1.5', cls].join(' ')}>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
      <span className="ml-2 text-sm font-semibold">{value}</span>
    </div>
  )
}

function HighlightCard({ h }: { h: AiHighlight }) {
  const cfg = severityConfig(h.severity)
  return (
    <div className={['rounded-2xl border p-5', cfg.wrapper].join(' ')}>
      <div className="flex items-center gap-2">
        <span className={['h-2 w-2 rounded-full', cfg.dot].join(' ')} />
        <div className={['text-xs font-semibold uppercase tracking-wide', cfg.label].join(' ')}>
          {cfg.name}
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-100">{h.title}</div>
      <div className="mt-1 text-sm text-slate-300">{h.body}</div>
      {h.metric && (
        <div className="mt-3 inline-block rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-1 text-[11px] font-mono text-slate-200">
          {h.metric}
        </div>
      )}
    </div>
  )
}

function HighlightSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
      <div className="h-3 w-16 rounded bg-slate-800" />
      <div className="mt-3 h-4 w-3/4 rounded bg-slate-800" />
      <div className="mt-2 h-3 w-full rounded bg-slate-800" />
      <div className="mt-1 h-3 w-2/3 rounded bg-slate-800" />
    </div>
  )
}

function severityConfig(severity: AiHighlight['severity']) {
  switch (severity) {
    case 'positive':
      return {
        name: 'Olumlu',
        wrapper: 'border-emerald-500/30 bg-emerald-500/5',
        dot: 'bg-emerald-400',
        label: 'text-emerald-300',
      }
    case 'warning':
      return {
        name: 'Uyarı',
        wrapper: 'border-amber-500/30 bg-amber-500/5',
        dot: 'bg-amber-400',
        label: 'text-amber-300',
      }
    case 'critical':
      return {
        name: 'Kritik',
        wrapper: 'border-rose-500/30 bg-rose-500/5',
        dot: 'bg-rose-400',
        label: 'text-rose-300',
      }
    default:
      return {
        name: 'Bilgi',
        wrapper: 'border-slate-800 bg-slate-900/30',
        dot: 'bg-sky-400',
        label: 'text-sky-300',
      }
  }
}
