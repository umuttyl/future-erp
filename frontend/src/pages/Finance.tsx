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
    } catch (e: any) {
      setError(getApiErrorMessage(e, 'Yükleme başarısız'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(start, end)
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
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-slate-100">Finans Özeti</div>
          <div className="mt-1 text-sm text-slate-400">
            Seçili dönem için ciro, maliyet, marj ve en iyi performans gösteren müşteri/ürünler.
          </div>
        </div>

        <div className="flex items-end gap-2 text-xs">
          <LabeledField label="Başlangıç">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
            />
          </LabeledField>
          <LabeledField label="Bitiş">
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputCls}
            />
          </LabeledField>
          <button
            onClick={() => load(start, end)}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
          >
            Uygula
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Hata: {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Ciro"
          value={summary ? formatCurrency(summary.revenue) : '…'}
          accent="sky"
        />
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

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-200">Aylık Ciro Trendi</div>
          <div className="text-xs text-slate-500">
            {monthly.length > 0 ? `${monthly[0].month} – ${monthly[monthly.length - 1].month}` : '—'}
          </div>
        </div>
        <div className="h-[320px]">
          {loading && monthly.length === 0 ? (
            <div className="text-sm text-slate-400">Yükleniyor…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v)}
                />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 12 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: any, name: any) => {
                    if (name === 'Ciro') return [formatCurrency(Number(value)), name]
                    return [formatNumber(Number(value)), name]
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="Ciro" fill="#60a5fa" radius={[6, 6, 0, 0]} />
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
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <div className="mb-3 text-sm font-semibold text-slate-200">En İyi Müşteriler</div>
          <div className="space-y-2">
            {customers.map((c) => {
              const pct = (c.revenue / customersMaxRevenue) * 100
              return (
                <div key={c.customer} className="text-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-slate-200">{c.customer}</div>
                    <div className="font-semibold text-slate-100">
                      {formatCurrency(c.revenue)}
                    </div>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{c.orders} sipariş</div>
                </div>
              )
            })}
            {!loading && customers.length === 0 && (
              <div className="text-sm text-slate-400">Veri yok.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
          <div className="mb-3 text-sm font-semibold text-slate-200">En Çok Satan Ürünler</div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 12, right: 16 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(v)
                  }
                />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" tick={{ fontSize: 11 }} width={140} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid #1f2937', borderRadius: 12 }}
                  formatter={(value: any) => formatCurrency(Number(value))}
                />
                <Bar dataKey="revenue" name="Ciro" fill="#22c55e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            {topProducts.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="font-mono">{p.sku}</span>
                <span>
                  {formatNumber(p.quantity)} ad · %
                  {((p.revenue / topProductsMaxRevenue) * 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
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
  accent?: 'sky'
}) {
  const cls =
    accent === 'sky'
      ? 'border-sky-500/30 bg-sky-500/10'
      : 'border-slate-800 bg-slate-900/30'
  return (
    <div className={['rounded-2xl border p-5', cls].join(' ')}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
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
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600'
