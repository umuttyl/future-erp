import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CashbookTab } from '../components/finance/CashbookTab'
import { Pencil, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'

import { SkeletonCard, SkeletonKpiGrid } from '../components/ui/Skeleton'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { inputFieldClass, primaryButtonClass } from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useImpersonation } from '../lib/impersonation'
import {
  api,
  createExpense,
  deleteExpense,
  fetchCashAccounts,
  fetchCashflowForecast,
  fetchExpenses,
  fetchExpenseSummary,
  formatCurrency,
  formatNumber,
  getApiErrorMessage,
  updateExpense,
  type CashAccountOut,
  type CashflowForecast,
  type DailySalesPoint,
  type ExpenseCreate,
  type ExpenseOut,
  type ExpenseSummary,
  type FinanceSummary,
  type MonthlyPoint,
  type SalesRecord,
  type TopCustomer,
  type TopProduct,
} from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

type ChartPeriod = '7d' | '30d' | '3m' | '12m'
type ChartPoint = { label: string; revenue: number; orders: number }

function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return `W${Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)}`
}

function aggregateWeekly(daily: DailySalesPoint[]): ChartPoint[] {
  const map = new Map<string, { revenue: number; orders: number }>()
  for (const d of daily) {
    const key = isoWeekLabel(new Date(d.date))
    const prev = map.get(key) ?? { revenue: 0, orders: 0 }
    map.set(key, { revenue: prev.revenue + d.revenue, orders: prev.orders + d.quantity })
  }
  return Array.from(map.entries()).map(([label, v]) => ({ label, ...v }))
}

// ─── Expense categories ───────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = ['rent', 'salary', 'utilities', 'marketing', 'logistics', 'tax', 'other']
const CATEGORY_COLORS: Record<string, string> = {
  rent: '#6366f1', salary: '#8b5cf6', utilities: '#06b6d4',
  marketing: '#f59e0b', logistics: '#10b981', tax: '#ef4444', other: '#64748b',
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Kpi({
  label, value, sub, accent, trend,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'violet' | 'danger' | 'emerald' | 'amber'
  trend?: 'up' | 'down' | null
}) {
  const base =
    accent === 'violet'  ? 'border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-950/30'
    : accent === 'danger'  ? 'border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-950/30'
    : accent === 'emerald' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-950/30'
    : accent === 'amber'   ? 'border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-950/30'
    : 'border-slate-200 bg-white dark:border-white/10 dark:bg-[#16122b]'
  const text =
    accent === 'violet'  ? 'text-violet-900 dark:text-violet-100'
    : accent === 'danger'  ? 'text-rose-700 dark:text-rose-300'
    : accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : accent === 'amber'   ? 'text-amber-700 dark:text-amber-300'
    : 'text-slate-900 dark:text-slate-100'
  return (
    <div className={`rounded-2xl border p-5 shadow-sm dark:shadow-card-dark ${base}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        {trend === 'up' && <TrendingUp className="h-4 w-4 text-emerald-500" />}
        {trend === 'down' && <TrendingDown className="h-4 w-4 text-rose-500" />}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${text}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  )
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[140px] flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

// ─── P&L Summary tab ─────────────────────────────────────────────────────────

function PLSummaryTab({
  summary, customers, topProducts, salesRecords, loading, error, chartPeriod, setChartPeriod, chartPoints, chartLoading, isDark, gridStroke, axisStroke,
}: {
  summary: FinanceSummary | null
  customers: TopCustomer[]
  topProducts: TopProduct[]
  salesRecords: SalesRecord[]
  loading: boolean
  error: string | null
  chartPeriod: ChartPeriod
  setChartPeriod: (p: ChartPeriod) => void
  chartPoints: ChartPoint[]
  chartLoading: boolean
  isDark: boolean
  gridStroke: string
  axisStroke: string
}) {
  const customersMaxRevenue = useMemo(
    () => customers.reduce((acc, c) => Math.max(acc, c.revenue), 0) || 1,
    [customers],
  )

  const hasExpenses = summary && summary.total_op_expenses > 0
  const netProfitAccent =
    summary == null ? undefined
    : summary.net_profit > 0 ? 'emerald'
    : summary.net_profit < 0 ? 'danger'
    : undefined

  return (
    <>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      )}

      {loading && !summary ? <SkeletonKpiGrid count={6} /> : null}

      {/* ── KPI Row 1: Revenue & Profitability ── */}
      <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6 ${loading && !summary ? 'hidden' : ''}`}>
        <Kpi
          label="Revenue (incl. VAT)"
          value={summary ? formatCurrency(summary.revenue) : '…'}
          sub={summary && summary.tax_total > 0 ? `VAT: ${formatCurrency(summary.tax_total)}` : `Excl. VAT: ${summary ? formatCurrency(summary.revenue_excl_tax) : '…'}`}
          accent="violet"
        />
        <Kpi
          label="Gross Profit"
          value={summary ? formatCurrency(summary.gross_profit) : '…'}
          sub={summary ? `Margin ${summary.margin_pct.toFixed(1)}%` : ''}
          trend={summary ? (summary.gross_profit > 0 ? 'up' : 'down') : null}
        />
        <Kpi
          label="Operating Expenses"
          value={summary ? formatCurrency(summary.total_op_expenses) : '…'}
          sub={hasExpenses ? undefined : 'No expenses recorded'}
          accent={hasExpenses ? 'danger' : undefined}
        />
        <Kpi
          label="Net Profit"
          value={summary ? (summary.net_profit >= 0 ? '+' : '') + formatCurrency(summary.net_profit) : '…'}
          sub={hasExpenses ? undefined : 'Enter expenses for accurate P&L'}
          accent={netProfitAccent}
          trend={summary ? (summary.net_profit > 0 ? 'up' : summary.net_profit < 0 ? 'down' : null) : null}
        />
        <Kpi
          label="Orders"
          value={summary ? formatNumber(summary.order_count) : '…'}
          sub={summary ? `Avg ${formatCurrency(summary.avg_order_value)}` : ''}
        />
        <Kpi label="Inventory Value" value={summary ? formatCurrency(summary.inventory_value) : '…'} />
      </div>

      {/* ── Note if no expenses ── */}
      {summary && !hasExpenses && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="shrink-0 text-base">💡</span>
          <span>
            <strong>Net Profit shows Gross Profit only.</strong> Add operating expenses (rent, salaries, utilities…) in the{' '}
            <Link to="/finance?tab=expenses" className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">
              Expenses tab
            </Link>{' '}
            to get accurate net profit.
          </span>
        </div>
      )}

      {/* ── Revenue Trend ── */}
      <GlobalCard>
        <GlobalCardHeader
          title="Revenue Trend"
          description={chartPoints.length > 0 ? `${chartPoints[0].label} – ${chartPoints[chartPoints.length - 1].label}` : '—'}
          right={
            <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-slate-800/50">
              {(['7d', '30d', '3m', '12m'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setChartPeriod(p)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    chartPeriod === p
                      ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          }
        />
        <div className="h-[280px]">
          {chartLoading || chartPoints.length === 0 ? (
            <SkeletonCard rows={5} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartPoints} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="finRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke={axisStroke} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke={axisStroke} tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(Number(v))} />
                <YAxis yAxisId="right" orientation="right" stroke={axisStroke} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: isDark ? '#0f172a' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}
                  labelStyle={{ color: isDark ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}
                  formatter={(value: unknown, name: unknown) =>
                    String(name) === 'Revenue' ? [formatCurrency(Number(value)), 'Revenue'] : [formatNumber(Number(value)), 'Orders']
                  }
                />
                <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
                <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#finRevenueGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#8b5cf6' }} />
                <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#22c55e' }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlobalCard>

      {/* ── Top Customers & Top Products ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlobalCard>
          <GlobalCardHeader title="Top Customers" description="By revenue — selected period" />
          <div className="space-y-2">
            {customers.map((c) => {
              const pct = (c.revenue / customersMaxRevenue) * 100
              return (
                <div key={c.customer} className="text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{c.customer}</div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(c.revenue)}</div>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full bg-violet-500 ${[
                      'w-[4%]','w-[10%]','w-[20%]','w-[30%]','w-[40%]',
                      'w-[50%]','w-[60%]','w-[70%]','w-[80%]','w-[90%]','w-full',
                    ][Math.min(10, Math.round(pct / 10))]}`} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.orders} orders</div>
                </div>
              )
            })}
            {!loading && customers.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No sales in this period.</p>
            )}
          </div>
        </GlobalCard>

        <GlobalCard>
          <GlobalCardHeader title="Top Products" description="By revenue — selected period" />
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 12, right: 16 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                <XAxis type="number" stroke={axisStroke} tick={{ fontSize: 11 }}
                  tickFormatter={(v) => new Intl.NumberFormat('tr-TR', { notation: 'compact' }).format(Number(v))} />
                <YAxis dataKey="name" type="category" stroke={axisStroke} tick={{ fontSize: 11 }} width={120} />
                <Tooltip
                  contentStyle={{ background: isDark ? '#0f172a' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: 12 }}
                  formatter={(v: unknown) => [formatCurrency(Number(v)), 'Revenue']}
                />
                <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            {topProducts.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="font-mono text-slate-700 dark:text-slate-300">{p.sku}</span>
                <span>{formatNumber(p.quantity)} units</span>
              </div>
            ))}
          </div>
        </GlobalCard>
      </div>

      {/* ── Revenue Records ── */}
      <GlobalCard padding={false}>
        <div className="px-5 py-4">
          <GlobalCardHeader
            title="Revenue Records"
            description={`${salesRecords.length} records in period`}
          />
        </div>
        {loading ? (
          <div className="px-5 pb-6"><SkeletonCard rows={4} /></div>
        ) : salesRecords.length === 0 ? (
          <div className="px-5 pb-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">No revenue records for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ui-border-sub bg-slate-50 dark:bg-white/[0.03]">
                  {['Date', 'Record No', 'Customer', 'Type', 'Amount'].map((h) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-sub">
                {salesRecords.map((rec) => {
                  const isInvoice = rec.record_no.startsWith('INV-')
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{rec.sale_date}</td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{rec.record_no}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{rec.customer_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {isInvoice ? (
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                            Invoice
                          </span>
                        ) : rec.payment_type === 'nakit' ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            Cash
                          </span>
                        ) : rec.payment_type === 'banka_havalesi' ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            Bank Transfer
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            Credit
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(Number(rec.total_amount))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlobalCard>
    </>
  )
}

// ─── Cash & Bank tab (cashflow forecast + cashbook) ───────────────────────────

function CashAndBankTab({
  accounts, forecast, cfLoading, cfError,
}: {
  accounts: CashAccountOut[]
  forecast: CashflowForecast | null
  cfLoading: boolean
  cfError: string | null
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#cbd5e1'
  const axisStroke = isDark ? '#94a3b8' : '#64748b'

  if (cfLoading) return <SkeletonKpiGrid count={4} />
  if (cfError) return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">{cfError}</div>
  )

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0)
  const statusStyle = {
    danger:  { banner: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200', badge: 'bg-rose-600 text-white', stroke: '#ef4444' },
    warning: { banner: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200', badge: 'bg-amber-500 text-white', stroke: '#f59e0b' },
    ok:      { banner: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200', badge: 'bg-emerald-600 text-white', stroke: '#10b981' },
  }
  const st = forecast ? statusStyle[forecast.status] : statusStyle.ok

  return (
    <div className="space-y-6">
      {/* 14-day forecast banner */}
      {forecast && (
        <div className={`flex items-start justify-between gap-4 rounded-2xl border p-4 ${st.banner}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${st.badge}`}>
                {forecast.status === 'danger' ? '⚠ Critical' : forecast.status === 'warning' ? '⚠ Warning' : '✓ Healthy'}
              </span>
              <span className="text-sm font-semibold">14-Day Cash Flow Forecast</span>
            </div>
            <p className="text-sm">{forecast.alert_message ?? 'Cash flow looks balanced over the next 14 days.'}</p>
            {!forecast.has_cashbook_data && (
              <p className="mt-1 text-xs opacity-70">No cash transactions yet — add transactions to improve forecast accuracy.</p>
            )}
          </div>
        </div>
      )}

      {/* Cash KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi
          label="Total Cash Balance"
          value={formatCurrency(totalBalance)}
          accent={totalBalance < 0 ? 'danger' : 'violet'}
        />
        <Kpi label="Daily Income Avg." value={forecast ? formatCurrency(forecast.daily_income_avg) : '—'} />
        <Kpi label="Daily Expense Avg." value={forecast ? formatCurrency(forecast.daily_expense_avg) : '—'} />
        <Kpi
          label="Net Daily"
          value={forecast ? (forecast.net_daily >= 0 ? '+' : '') + formatCurrency(forecast.net_daily) : '—'}
          accent={forecast && forecast.net_daily < 0 ? 'danger' : forecast && forecast.net_daily > 0 ? 'emerald' : undefined}
        />
      </div>

      {/* 14-day projection chart */}
      {forecast && (
        <GlobalCard>
          <GlobalCardHeader
            title="14-Day Balance Projection"
            description={`Based on ${forecast.lookback_days}-day average · Day 14: ${formatCurrency(forecast.projection[13]?.balance ?? 0)}`}
          />
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={forecast.projection.map((p) => ({ date: p.date.slice(5), balance: p.balance }))}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={st.stroke} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={st.stroke} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke={axisStroke} tick={{ fontSize: 11 }} />
                <YAxis stroke={axisStroke} tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(Number(v), { compact: true, maximumFractionDigits: 1 })} />
                <Tooltip
                  contentStyle={{ background: isDark ? '#0f172a' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: 12 }}
                  formatter={(v: unknown) => [formatCurrency(Number(v)), 'Projected Balance']}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 3" label={{ value: '₺0', fill: '#ef4444', fontSize: 11 }} />
                <Area type="monotone" dataKey="balance" stroke={st.stroke} strokeWidth={2} fill="url(#cfGrad)" dot={{ r: 3, fill: st.stroke }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlobalCard>
      )}

      {/* Account balances */}
      {accounts.length > 0 && (
        <GlobalCard>
          <GlobalCardHeader title="Cash & Bank Accounts" description="Current balances" />
          <div className="space-y-2">
            {accounts.map((a) => {
              const bal = Number(a.balance)
              return (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/5 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${a.account_type === 'cash' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                      {a.account_type === 'cash' ? '💵' : '🏦'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{a.account_type === 'cash' ? 'Cash' : 'Bank'} · {a.currency}</div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${bal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {formatCurrency(bal)}
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/10">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total</span>
              <span className={`text-base font-bold ${totalBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>{formatCurrency(totalBalance)}</span>
            </div>
          </div>
        </GlobalCard>
      )}

      {/* Full cashbook (transactions) */}
      <CashbookTab />
    </div>
  )
}

// ─── Expenses tab ─────────────────────────────────────────────────────────────

function ExpensesTab() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { user } = useAuth()
  const canEdit = user?.role_kind === 'owner' || user?.is_platform_admin

  const today = isoToday()
  const monthStart = today.slice(0, 8) + '01'

  const [expenses, setExpenses] = useState<ExpenseOut[]>([])
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStart, setFilterStart] = useState(monthStart)
  const [filterEnd, setFilterEnd] = useState(today)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [form, setForm] = useState<ExpenseCreate>({
    category: 'other', description: '', amount: 0, currency: 'TRY',
    expense_date: today, vendor: '', receipt_ref: '',
  })

  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const axisStroke = isDark ? '#94a3b8' : '#64748b'

  async function load(start: string, end: string) {
    try {
      setLoading(true); setError(null)
      const [exps, sum] = await Promise.all([
        fetchExpenses({ start_date: start, end_date: end }),
        fetchExpenseSummary({ start_date: start, end_date: end }),
      ])
      setExpenses(exps); setSummary(sum)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Failed to load expenses'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(filterStart, filterEnd) }, [filterStart, filterEnd])

  function openNew() {
    setEditingId(null)
    setForm({ category: 'other', description: '', amount: 0, currency: 'TRY', expense_date: today, vendor: '', receipt_ref: '' })
    setShowForm(true)
  }

  function openEdit(exp: ExpenseOut) {
    setEditingId(exp.id)
    setForm({ category: exp.category, description: exp.description, amount: exp.amount, currency: exp.currency, expense_date: exp.expense_date, vendor: exp.vendor ?? '', receipt_ref: exp.receipt_ref ?? '' })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.description.trim() || form.amount <= 0) return
    setFormBusy(true)
    try {
      editingId ? await updateExpense(editingId, form) : await createExpense(form)
      setShowForm(false)
      await load(filterStart, filterEnd)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Save failed'))
    } finally { setFormBusy(false) }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this expense?')) return
    try { await deleteExpense(id); await load(filterStart, filterEnd) }
    catch (e: unknown) { setError(getApiErrorMessage(e, 'Delete failed')) }
  }

  function handleExportCSV() {
    if (expenses.length === 0) return
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = 'Date,Category,Description,Vendor,Amount,Currency\n'
    const rows = expenses
      .map((e) => [e.expense_date, e.category, escape(e.description), escape(e.vendor ?? ''), e.amount, e.currency].join(','))
      .join('\n')
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses_${filterStart}_${filterEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Filter + Add */}
      <div className="flex flex-wrap items-end gap-3">
        <LabeledField label="From">
          <input type="date" title="Start date" className={inputFieldClass} value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
        </LabeledField>
        <LabeledField label="To">
          <input type="date" title="End date" className={inputFieldClass} value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
        </LabeledField>
        {expenses.length > 0 && (
          <button type="button" onClick={handleExportCSV} className="self-end flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Export CSV
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={openNew} className={`${primaryButtonClass} self-end flex items-center gap-2`}>
            <Plus className="h-4 w-4" /> Add Expense
          </button>
        )}
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-100">{error}</div>}

      {/* KPI + chart row */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left: KPI cards */}
          <div className="space-y-3">
            <Kpi label="Total Expenses" value={formatCurrency(summary.grand_total)} accent={summary.grand_total > 0 ? 'danger' : undefined} />
            {summary.by_category.slice(0, 4).map((c) => (
              <div key={c.category} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/5 dark:bg-slate-800/40">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line react/forbid-dom-props */}
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c.category] ?? '#64748b' }} />
                  <span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-300">{c.category}</span>
                  <span className="text-xs text-slate-400">{c.count}×</span>
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>

          {/* Right: Bar chart */}
          {summary.by_category.length > 0 && (
            <div className="lg:col-span-2">
              <GlobalCard>
                <GlobalCardHeader title="Breakdown by Category" description={`${filterStart} — ${filterEnd}`} />
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.by_category} layout="vertical" margin={{ left: 16, right: 32 }}>
                      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                      <XAxis type="number" stroke={axisStroke} tick={{ fontSize: 11 }}
                        tickFormatter={(v) => formatCurrency(Number(v), { compact: true })} />
                      <YAxis dataKey="category" type="category" stroke={axisStroke} tick={{ fontSize: 11 }} width={80} />
                      <Tooltip
                        contentStyle={{ background: isDark ? '#0f172a' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: 12 }}
                        formatter={(v: unknown) => [formatCurrency(Number(v)), 'Total']}
                      />
                      <Bar dataKey="total" name="Amount" radius={[0, 6, 6, 0]}>
                        {summary.by_category.map((c) => (
                          <Cell key={c.category} fill={CATEGORY_COLORS[c.category] ?? '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlobalCard>
            </div>
          )}
        </div>
      )}

      {/* Records table */}
      <GlobalCard padding={false}>
        <div className="px-5 py-4">
          <GlobalCardHeader title="Expense Records" description={`${expenses.length} records in period`} />
        </div>
        {loading ? (
          <div className="px-5 pb-6"><SkeletonCard rows={4} /></div>
        ) : expenses.length === 0 ? (
          <div className="px-5 pb-10 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">No expenses recorded for this period.</p>
            {canEdit && (
              <button type="button" onClick={openNew} className={`${primaryButtonClass} mx-auto mt-4 flex items-center gap-2`}>
                <Plus className="h-4 w-4" /> Add first expense
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ui-border-sub bg-slate-50 dark:bg-white/[0.03]">
                  {['Date', 'Category', 'Description', 'Vendor', 'Amount'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                  {canEdit && <th className="px-3 py-3"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-border-sub">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{exp.expense_date}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[exp.category] ?? '#64748b' }} />
                        <span className="text-xs font-medium capitalize text-slate-700 dark:text-slate-300">{exp.category}</span>
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-800 dark:text-slate-200">{exp.description}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{exp.vendor ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(exp.amount)}</td>
                    {canEdit && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(exp)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => void handleDelete(exp.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlobalCard>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-2xl border border-ui-border bg-ui-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold text-ui-text">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <LabeledField label="Category">
                  <select title="Category" className={inputFieldClass} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </LabeledField>
                <LabeledField label="Date *">
                  <input type="date" title="Expense date" className={inputFieldClass} value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} />
                </LabeledField>
              </div>
              <LabeledField label="Description *">
                <input type="text" placeholder="e.g. Office rent – June" className={inputFieldClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </LabeledField>
              <div className="grid grid-cols-2 gap-3">
                <LabeledField label="Amount *">
                  <input type="number" min={0} step="0.01" placeholder="0.00" className={inputFieldClass} value={form.amount || ''} onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
                </LabeledField>
                <LabeledField label="Currency">
                  <input type="text" placeholder="TRY" maxLength={8} className={inputFieldClass} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
                </LabeledField>
              </div>
              <LabeledField label="Vendor">
                <input type="text" placeholder="Supplier / vendor name" className={inputFieldClass} value={form.vendor ?? ''} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
              </LabeledField>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-ui-border px-4 py-2 text-sm text-ui-muted hover:bg-ui-surface-2">Cancel</button>
              <button type="button" disabled={formBusy} onClick={() => void handleSave()} className={primaryButtonClass}>
                {formBusy ? 'Saving…' : editingId ? 'Save Changes' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function FinancePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { tenantId: impersonateTenantId } = useImpersonation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#cbd5e1'
  const axisStroke = isDark ? '#94a3b8' : '#64748b'

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'pl'

  const [start, setStart] = useState(() => searchParams.get('start') ?? isoDaysAgo(90))
  const [end, setEnd] = useState(() => searchParams.get('end') ?? isoToday())
  const appliedStart = searchParams.get('start') ?? isoDaysAgo(90)
  const appliedEnd = searchParams.get('end') ?? isoToday()

  // P&L tab state
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([])
  const [customers, setCustomers] = useState<TopCustomer[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('30d')
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([])
  const [chartLoading, setChartLoading] = useState(false)

  // Cash & Bank tab state
  const [cfAccounts, setCfAccounts] = useState<CashAccountOut[]>([])
  const [cfForecast, setCfForecast] = useState<CashflowForecast | null>(null)
  const [cfLoading, setCfLoading] = useState(false)
  const [cfError, setCfError] = useState<string | null>(null)

  const [cfBannerDismissed, setCfBannerDismissed] = useState(false)

  async function loadPL(s: string, e: string) {
    try {
      setLoading(true); setError(null)
      const [su, mo, cu, pr, sr] = await Promise.all([
        api.get<FinanceSummary>('/finance/summary', { params: { start_date: s, end_date: e } }),
        api.get<MonthlyPoint[]>('/finance/monthly', { params: { start_date: isoDaysAgo(365), end_date: e } }),
        api.get<TopCustomer[]>('/finance/top-customers', { params: { start_date: s, end_date: e, limit: 5 } }),
        api.get<TopProduct[]>('/finance/top-products', { params: { start_date: s, end_date: e, limit: 5 } }),
        api.get<SalesRecord[]>('/sales/records', { params: { start_date: s, end_date: e, limit: 200 } }),
      ])
      setSummary(su.data); setMonthly(mo.data); setCustomers(cu.data); setTopProducts(pr.data)
      setSalesRecords(sr.data)
      // Proactively load cashflow to show warning banner if needed
      if (!cfForecast) {
        fetchCashflowForecast().then(setCfForecast).catch(() => {})
      }
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Load failed'))
    } finally { setLoading(false) }
  }

  async function loadCash() {
    try {
      setCfLoading(true); setCfError(null)
      const [accs, cf] = await Promise.all([fetchCashAccounts(), fetchCashflowForecast()])
      setCfAccounts(accs); setCfForecast(cf)
    } catch (e: unknown) {
      setCfError(getApiErrorMessage(e, 'Failed to load cash data'))
    } finally { setCfLoading(false) }
  }

  useEffect(() => {
    if (activeTab === 'pl') void loadPL(appliedStart, appliedEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, appliedStart, appliedEnd])

  useEffect(() => {
    if (activeTab === 'cash') void loadCash()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Chart period fetch
  useEffect(() => {
    if (chartPeriod === '12m') {
      setChartPoints(monthly.map((m) => ({ label: m.month, revenue: m.revenue, orders: m.orders })))
      return
    }
    let cancelled = false
    const days = chartPeriod === '7d' ? 7 : chartPeriod === '30d' ? 30 : 90
    setChartLoading(true)
    void api.get<DailySalesPoint[]>('/sales/analytics/daily', { params: { start_date: isoDaysAgo(days), end_date: isoToday() } })
      .then((r) => {
        if (cancelled) return
        setChartPoints(chartPeriod === '3m' ? aggregateWeekly(r.data) : r.data.map((d) => ({ label: d.date.slice(5), revenue: d.revenue, orders: d.quantity })))
      })
      .catch(() => { if (!cancelled) setChartPoints([]) })
      .finally(() => { if (!cancelled) setChartLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPeriod])

  useEffect(() => {
    if (chartPeriod === '12m') setChartPoints(monthly.map((m) => ({ label: m.month, revenue: m.revenue, orders: m.orders })))
  }, [monthly, chartPeriod])

  if (user?.role === 'admin' && !impersonateTenantId) {
    return (
      <PageLayout title="Finance" subtitle="Company-specific view">
        <GlobalCard>
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
              <svg className="h-7 w-7 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Finance view is company-specific</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">Use the Enter button from the company list to view a company's finances.</p>
            </div>
            <button type="button" onClick={() => navigate('/admin')} className="mt-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              Back to Company List
            </button>
          </div>
        </GlobalCard>
      </PageLayout>
    )
  }

  const TABS = [
    { key: 'pl',       label: 'P&L Summary' },
    { key: 'cash',     label: 'Cash & Bank' },
    { key: 'expenses', label: 'Expenses' },
  ] as const

  return (
    <PageLayout
      title={t('finance.title')}
      subtitle={t('finance.subtitle')}
      actions={
        activeTab === 'pl' ? (
          <div className="flex flex-wrap items-end gap-2">
            <LabeledField label={t('finance.start')}>
              <input type="date" title={t('finance.start')} value={start} onChange={(e) => setStart(e.target.value)} className={inputFieldClass} />
            </LabeledField>
            <LabeledField label={t('finance.end')}>
              <input type="date" title={t('finance.end')} value={end} onChange={(e) => setEnd(e.target.value)} className={inputFieldClass} />
            </LabeledField>
            <button type="button" onClick={() => setSearchParams({ tab: 'pl', start, end }, { replace: true })} className={primaryButtonClass + ' self-end'}>
              {t('finance.apply')}
            </button>
          </div>
        ) : undefined
      }
    >
      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSearchParams({ tab: tab.key }, { replace: true })}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pl' && (
        <>
          {cfForecast && !cfBannerDismissed && cfForecast.status !== 'ok' && (
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
              cfForecast.status === 'danger'
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200'
            }`}>
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold">
                  {cfForecast.status === 'danger' ? 'Critical cash flow risk: ' : 'Cash flow warning: '}
                </span>
                {cfForecast.alert_message ?? (cfForecast.status === 'danger'
                  ? `Cash flow will hit zero by ${cfForecast.first_danger_date ?? 'soon'}.`
                  : `Cash flow warning by ${cfForecast.first_warning_date ?? 'soon'}.`)}
                <button
                  type="button"
                  onClick={() => setSearchParams({ tab: 'cash' }, { replace: true })}
                  className="ml-2 font-semibold underline hover:no-underline"
                >
                  View forecast →
                </button>
              </div>
              <button
                type="button"
                onClick={() => setCfBannerDismissed(true)}
                className="shrink-0 rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                aria-label="Dismiss"
              >
                <TrendingUp className="h-3.5 w-3.5 opacity-60" />
              </button>
            </div>
          )}
          <PLSummaryTab
            summary={summary}
            customers={customers}
            topProducts={topProducts}
            salesRecords={salesRecords}
            loading={loading}
            error={error}
            chartPeriod={chartPeriod}
            setChartPeriod={setChartPeriod}
            chartPoints={chartPoints}
            chartLoading={chartLoading}
            isDark={isDark}
            gridStroke={gridStroke}
            axisStroke={axisStroke}
          />
        </>
      )}

      {activeTab === 'cash' && (
        <CashAndBankTab
          accounts={cfAccounts}
          forecast={cfForecast}
          cfLoading={cfLoading}
          cfError={cfError}
        />
      )}

      {activeTab === 'expenses' && <ExpensesTab />}
    </PageLayout>
  )
}
