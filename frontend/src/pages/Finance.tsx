import { useEffect, useMemo, useState } from 'react'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { inputFieldClass, primaryButtonClass } from '../components/ui/forms'
import { useTheme } from '../context/ThemeContext'
import {
  api,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  type FinanceSummary,
  type MonthlyPoint,
  type TopCustomer,
  type TopProduct,
} from '../lib/api'

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function FinancePage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#cbd5e1'
  const axisStroke = isDark ? '#94a3b8' : '#64748b'

  const [start, setStart] = useState(isoDaysAgo(90))
  const [end, setEnd] = useState(isoToday())
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  const [customers, setCustomers] = useState<TopCustomer[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(s: string, e: string) {
    try {
      setLoading(true)
      setError(null)
      const params = { start_date: s, end_date: e }
      const [su, mo, cu, pr] = await Promise.all([
        api.get<FinanceSummary>('/finance/summary', { params }),
        api.get<MonthlyPoint[]>('/finance/monthly', {
          params: { start_date: isoDaysAgo(365), end_date: e },
        }),
        api.get<TopCustomer[]>('/finance/top-customers', { params: { ...params, limit: 5 } }),
        api.get<TopProduct[]>('/finance/top-products', { params: { ...params, limit: 5 } }),
      ])
      setSummary(su.data)
      setMonthly(mo.data)
      setCustomers(cu.data)
      setTopProducts(pr.data)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Yükleme başarısız'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(start, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const topProductsMaxRevenue = useMemo(
    () => topProducts.reduce((acc, p) => Math.max(acc, p.revenue), 0) || 1,
    [topProducts],
  )
  const customersMaxRevenue = useMemo(
    () => customers.reduce((acc, c) => Math.max(acc, c.revenue), 0) || 1,
    [customers],
  )

  return (
    <PageLayout
      title="Finans Özeti"
      subtitle="Seçili dönem için ciro, maliyet, marj ve en iyi performans gösteren müşteri/ürünler."
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <LabeledField label="Başlangıç">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputFieldClass} />
          </LabeledField>
          <LabeledField label="Bitiş">
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputFieldClass} />
          </LabeledField>
          <button type="button" onClick={() => void load(start, end)} className={primaryButtonClass + ' self-end'}>
            Uygula
          </button>
        </div>
      }
    >
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">
          Hata: {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Ciro" value={summary ? formatCurrency(summary.revenue) : '…'} accent="violet" />
        <Kpi
          label="Brüt Kâr"
          value={summary ? formatCurrency(summary.gross_profit) : '…'}
          sub={summary ? `Marj %${summary.margin_pct.toFixed(2)}` : ''}
        />
        <Kpi
          label="Sipariş"
          value={summary ? formatNumber(summary.order_count) : '…'}
          sub={summary ? `Ort. ${formatCurrency(summary.avg_order_value)}` : ''}
        />
        <Kpi
          label="Envanter Değeri"
          value={summary ? formatCurrency(summary.inventory_value) : '…'}
          sub={summary ? `${formatNumber(summary.customer_count)} müşteri` : ''}
        />
      </div>

      <GlobalCard>
        <GlobalCardHeader
          title="Aylık ciro trendi"
          description={
            monthly.length > 0 ? `${monthly[0].month} – ${monthly[monthly.length - 1].month}` : '—'
          }
        />
        <div className="h-[320px]">
          {loading && monthly.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
                  labelStyle={{ color: isDark ? '#e2e8f0' : '#0f172a' }}
                  itemStyle={{ color: isDark ? '#e2e8f0' : '#334155' }}
                  formatter={(value: unknown, name: unknown) => {
                    if (name === 'Ciro') return [formatCurrency(Number(value)), String(name)]
                    return [formatNumber(Number(value)), String(name)]
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="Ciro" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  name="Sipariş"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlobalCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlobalCard>
          <GlobalCardHeader title="En iyi müşteriler" description="Seçili dönem" />
          <div className="space-y-2">
            {customers.map((c) => {
              const pct = (c.revenue / customersMaxRevenue) * 100
              return (
                <div key={c.customer} className="text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{c.customer}</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(c.revenue)}
                    </div>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.orders} sipariş</div>
                </div>
              )
            })}
            {!loading && customers.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Veri yok.</div>
            ) : null}
          </div>
        </GlobalCard>

        <GlobalCard>
          <GlobalCardHeader title="En çok satan ürünler" description="Ciro bazlı" />
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 12, right: 16 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  stroke={axisStroke}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(Number(v))}
                />
                <YAxis dataKey="name" type="category" stroke={axisStroke} tick={{ fontSize: 11 }} width={140} />
                <Tooltip
                  contentStyle={{
                    background: isDark ? '#0f172a' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    borderRadius: 12,
                  }}
                  formatter={(value: unknown) => formatCurrency(Number(value))}
                />
                <Bar dataKey="revenue" name="Ciro" fill="#22c55e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {topProducts.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="font-mono text-slate-800 dark:text-slate-200">{p.sku}</span>
                <span>
                  {formatNumber(p.quantity)} ad · %{((p.revenue / topProductsMaxRevenue) * 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </GlobalCard>
      </div>
    </PageLayout>
  )
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'violet'
}) {
  const cls =
    accent === 'violet'
      ? 'border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-950/30'
      : 'border-slate-200 bg-white dark:border-white/10 dark:bg-[#16122b]'
  return (
    <div className={['rounded-2xl border p-5 shadow-sm dark:shadow-card-dark', cls].join(' ')}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={[
          'mt-1 text-2xl font-semibold',
          accent === 'violet' ? 'text-violet-900 dark:text-violet-100' : 'text-slate-900 dark:text-slate-100',
        ].join(' ')}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{sub}</div> : null}
    </div>
  )
}

function LabeledField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex min-w-[140px] flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  )
}
