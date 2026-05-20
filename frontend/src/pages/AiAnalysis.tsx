import { Bot, Lock, TrendingUp, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

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

import { ForecastChart, type ForecastPoint } from '../components/ai/ForecastChart'
import { InsightBanner, InsightCardSection } from '../components/ai/InsightCards'
import { StockAlertList } from '../components/ai/StockAlertList'
import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import {
  ghostButtonClass,
  inputFieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  api,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  type AiInsights,
  type DailySalesPoint,
  type ForecastResult,
  type NlpQueryResponse,
  type StockAlert,
} from '../lib/api'

// ---------------------------------------------------------------------------
// Sample questions — tailored per role
// ---------------------------------------------------------------------------

const QUESTIONS_ADMIN = [
  'Tüm şirketlerin son 30 günlük cirosunu karşılaştır',
  'Platform genelinde stoğu kritik seviyenin altında olan ürünleri listele',
  'Her şirketteki kullanıcı sayısını göster',
  'En yüksek cirolu 5 şirket hangisi?',
  'Hangi sektörde toplam satış en yüksek?',
]

const QUESTIONS_MANAGER = [
  'En yüksek ciro getiren 5 ürünü listele',
  'Son 30 günün aylık cirosunu göster',
  'Stoğu eşik seviyesinin altında olan ürünler',
  'Hangi müşteri en çok sipariş verdi?',
]

const QUESTIONS_EMPLOYEE = [
  'Stoğu kritik seviyenin altında olan ürünler',
  'Bugün kaç satış yapıldı?',
  'En çok satan ürün hangisi?',
]

function iso(d: string) {
  return new Date(d).toISOString().slice(0, 10)
}

function formatCellLoose(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  const lk = key.toLowerCase()
  if (
    lk.includes('ciro') || lk.includes('tutar') || lk.includes('amount') ||
    lk.includes('revenue') || lk.includes('price') || lk.includes('cost')
  ) {
    const n = Number(value)
    if (Number.isFinite(n)) return formatCurrency(n)
  }
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return String(value)
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
  const cfg = {
    admin:    { label: 'Tam Sistem Erişimi',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',     icon: Zap },
    manager:  { label: 'Şirket Verisi',       cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: TrendingUp },
    employee: { label: 'Kısıtlı Erişim',      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: Lock },
  }[role] ?? { label: role, cls: 'bg-slate-100 text-slate-600', icon: Bot }

  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.cls}`}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// NLP Query Panel — shared, with role-specific sample questions
// ---------------------------------------------------------------------------

function NlpPanel({ role }: { role: string }) {
  const questions =
    role === 'admin' ? QUESTIONS_ADMIN :
    role === 'manager' ? QUESTIONS_MANAGER :
    QUESTIONS_EMPLOYEE

  const [question, setQuestion] = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<NlpQueryResponse | null>(null)
  const [err, setErr]           = useState<string | null>(null)

  async function ask(text?: string) {
    const q = (text ?? question).trim()
    if (q.length < 1) return
    setQuestion(q)
    setLoading(true)
    setErr(null)
    setResult(null)
    try {
      const { data } = await api.post<NlpQueryResponse>('/chat', { text: q })
      setResult(data)
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Soru çalıştırılamadı'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlobalCard>
      <div className="flex items-start justify-between gap-3">
        <GlobalCardHeader
          title={role === 'admin' ? 'AI Platform Asistanı' : 'AI Chatbot'}
          description={
            role === 'admin'
              ? 'Tüm şirketlerin verilerini sorgulayın — cross-tenant SQL, platform KPI\'lar, şirket karşılaştırmaları.'
              : 'Doğal dilde sorun; uygun SQL üretilir ve cevap yazılır.'
          }
        />
        <RoleBadge role={role} />
      </div>

      {role === 'employee' && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-200">
          <Lock className="h-4 w-4 shrink-0" />
          Çalışan hesabınız ile stok ve satış verilerini sorgulayabilirsiniz. Finans ve sistem verileri kısıtlıdır.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void ask(q)}
            className={ghostButtonClass + ' rounded-full text-xs'}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          aria-label="AI'ya soru sor"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void ask() }}
          placeholder={
            role === 'employee'
              ? 'Örn: Kritik stok seviyesindeki ürünler neler?'
              : 'Örn: En yüksek stokta olan 3 kategoriyi listele'
          }
          className={inputFieldClass + ' flex-1'}
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={loading || question.trim().length < 3}
          className={primaryButtonClass + ' shrink-0 disabled:opacity-50'}
        >
          {loading ? 'Düşünüyor…' : 'Sor'}
        </button>
      </div>

      {err && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">
          Hata: {err}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="whitespace-pre-wrap rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-800 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-slate-100">
            {result.answer}
          </div>
          {result.data.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <div className="max-h-[340px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 bg-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900/95 dark:text-slate-400">
                      {result.columns.map((c) => (
                        <th key={c} className="px-3 py-2">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                        {result.columns.map((c) => (
                          <td key={c} className="px-3 py-2 text-slate-800 dark:text-slate-200">
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
          {role !== 'employee' && (
            <details className="text-[11px] text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer select-none font-medium text-slate-700 dark:text-slate-300">
                Kullanılan SQL
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2 text-[11px] text-slate-800 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
                {result.sql}
              </pre>
            </details>
          )}
        </div>
      )}
    </GlobalCard>
  )
}

// ---------------------------------------------------------------------------
// Employee-only view
// ---------------------------------------------------------------------------

function EmployeeAiView({ alerts }: { alerts: StockAlert[] }) {
  return (
    <>
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/40">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Kısıtlı AI Erişimi</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Çalışan hesabınız ile stok ve satış verilerini sorgulayabilirsiniz. AI tahmin modeli ve finansal analiz yönetici yetkisi gerektirir.
          </p>
        </div>
      </div>

      <StockAlertList alerts={alerts} />
      <NlpPanel role="employee" />
    </>
  )
}

// ---------------------------------------------------------------------------
// Full view (admin + manager)
// ---------------------------------------------------------------------------

function FullAiView({
  role,
  insights,
  insightsLoading,
  insightsError,
  onReloadInsights,
  chartData,
  latestProphet,
  forecastBusy,
  onRunProphet,
  alerts,
  isDark,
  gridStroke,
  axisStroke,
}: {
  role: string
  insights: AiInsights | null
  insightsLoading: boolean
  insightsError: string | null
  onReloadInsights: () => void
  chartData: ForecastPoint[]
  latestProphet: ForecastResult | undefined
  forecastBusy: boolean
  onRunProphet: () => void
  alerts: StockAlert[]
  isDark: boolean
  gridStroke: string
  axisStroke: string
}) {
  return (
    <>
      {/* Role banner */}
      <div className={`flex items-center gap-3 rounded-2xl border p-4 ${
        role === 'admin'
          ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/30'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/30'
      }`}>
        {role === 'admin' ? (
          <Zap className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
        ) : (
          <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <div>
          <p className={`text-sm font-medium ${role === 'admin' ? 'text-red-900 dark:text-red-100' : 'text-emerald-900 dark:text-emerald-100'}`}>
            {role === 'admin' ? 'Tam Sistem Erişimi' : 'Şirket AI Analizi'}
          </p>
          <p className={`text-xs mt-0.5 ${role === 'admin' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
            {role === 'admin'
              ? 'Tüm tenant verilerine, AI tahminlerine ve sistem anomalilerine erişebilirsiniz.'
              : 'Şirketinizin satış, stok ve finansal verilerini AI ile analiz edin.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onReloadInsights}
          disabled={insightsLoading}
          className={secondaryButtonClass + ' ml-auto shrink-0 disabled:opacity-50'}
        >
          {insightsLoading ? 'Yükleniyor…' : 'İçgörüyü Yenile'}
        </button>
      </div>

      <InsightBanner loading={insightsLoading} error={insightsError} insights={insights} />
      <InsightCardSection loading={insightsLoading} highlights={insights?.highlights ?? []} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ForecastChart
          data={chartData}
          lastTrainedAt={latestProphet?.created_at}
          busy={forecastBusy}
          isDark={isDark}
          onRefresh={onRunProphet}
        />
        <StockAlertList alerts={alerts} />
      </div>

      <GlobalCard>
        <GlobalCardHeader title="Aylık trend" description="Son aylardaki ciro ve sipariş hacmi." />
        <div className="h-[260px]">
          {insights ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={insights.context.monthly_revenue}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke={axisStroke} tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  stroke={axisStroke}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(Number(v))}
                />
                <YAxis yAxisId="right" orientation="right" stroke={axisStroke} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: isDark ? '#0f172a' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    borderRadius: 12,
                  }}
                  formatter={(value: unknown, name: unknown) =>
                    name === 'Ciro'
                      ? [formatCurrency(Number(value)), String(name)]
                      : [formatNumber(Number(value)), String(name)]
                  }
                />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="revenue" name="Ciro" stroke="#60a5fa" fill="#60a5fa22" />
                <Line yAxisId="right" type="monotone" dataKey="orders" name="Sipariş" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Yükleniyor…</div>
          )}
        </div>
      </GlobalCard>

      <NlpPanel role={role} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AiAnalysisPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#cbd5e1'
  const axisStroke = isDark ? '#94a3b8' : '#64748b'
  const role = user?.role ?? 'employee'

  const [insights,        setInsights]        = useState<AiInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError,   setInsightsError]   = useState<string | null>(null)
  const [alerts,          setAlerts]          = useState<StockAlert[]>([])
  const [daily,           setDaily]           = useState<DailySalesPoint[]>([])
  const [forecasts,       setForecasts]       = useState<ForecastResult[]>([])
  const [forecastBusy,    setForecastBusy]    = useState(false)

  async function loadInsights() {
    try {
      setInsightsLoading(true)
      setInsightsError(null)
      const { data } = await api.get<AiInsights>('/ai/insights')
      setInsights(data)
    } catch (e: unknown) {
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
    } catch { /* noop */ }
  }

  useEffect(() => {
    if (role === 'employee') {
      // Employee only needs stock alerts
      api.get<StockAlert[]>('/ai/stock-alerts').then((r) => setAlerts(r.data)).catch(() => {})
      setInsightsLoading(false)
      return
    }
    void loadInsights()
    void loadSupporting()
  }, [role])

  const latestProphet = useMemo(() => {
    const p = forecasts.filter((x) => x.model_name === 'prophet')
    return p.length ? p[0] : forecasts[0]
  }, [forecasts])

  const chartData = useMemo<ForecastPoint[]>(() => {
    const map = new Map<string, ForecastPoint>()
    for (const p of daily) {
      const key = iso(p.date)
      map.set(key, { date: key, actualQty: p.quantity })
    }
    const fDaily = latestProphet?.result_payload?.daily ?? []
    for (const p of fDaily as Record<string, unknown>[]) {
      const key = iso(String(p.date))
      const cur = map.get(key) ?? { date: key }
      cur.forecastQty = typeof p.quantity === 'number' ? p.quantity : typeof p.value === 'number' ? p.value : undefined
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
    } catch (e: unknown) {
      alert(getApiErrorMessage(e, 'Tahmin çalıştırılamadı'))
    } finally {
      setForecastBusy(false)
    }
  }

  const pageTitle =
    role === 'admin'    ? 'AI Sistem Analizi' :
    role === 'manager'  ? 'AI Şirket Analizi'  :
    'AI Asistan'

  const pageSubtitle =
    role === 'admin'    ? 'Gemini içgörüler, Prophet tahmini, anomali tespiti ve tam sistem NLP sorgusu.' :
    role === 'manager'  ? 'Şirketinizin AI destekli içgörüleri, tahminleri ve doğal dil sorguları.' :
    'Stok ve satış verilerinizi doğal dille sorgulayın.'

  return (
    <PageLayout title={pageTitle} subtitle={pageSubtitle}>
      {role === 'employee' ? (
        <EmployeeAiView alerts={alerts} />
      ) : (
        <FullAiView
          role={role}
          insights={insights}
          insightsLoading={insightsLoading}
          insightsError={insightsError}
          onReloadInsights={() => void loadInsights()}
          chartData={chartData}
          latestProphet={latestProphet}
          forecastBusy={forecastBusy}
          onRunProphet={() => void runProphet()}
          alerts={alerts}
          isDark={isDark}
          gridStroke={gridStroke}
          axisStroke={axisStroke}
        />
      )}
    </PageLayout>
  )
}
