import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Brain, Package, ShoppingCart } from 'lucide-react'

import { CriticalStockTable } from '../components/dashboard/CriticalStockTable'
import { SalesForecastLineChart, type LinePoint } from '../components/dashboard/SalesForecastLineChart'
import { StatCard } from '../components/dashboard/StatCard'
import { PageLayout } from '../components/ui/PageLayout'
import { primaryButtonClass, secondaryButtonClass } from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  api,
  getApiErrorMessage,
  type DailySalesPoint,
  type FinanceSummary,
  type ForecastResult,
  type Product,
} from '../lib/api'

function iso(d: string) {
  return new Date(d).toISOString().slice(0, 10)
}

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10)
}

function sumDailyRevenue(points: DailySalesPoint[]) {
  return points.reduce((s, p) => s + (typeof p.revenue === 'number' ? p.revenue : Number(p.revenue)), 0)
}

function trendPct(cur: number, prev: number): { pct: number | null; positive: boolean } {
  if (prev <= 0 && cur <= 0) return { pct: null, positive: true }
  if (prev <= 0) return { pct: null, positive: true }
  const pct = ((cur - prev) / prev) * 100
  return { pct, positive: cur >= prev }
}

export function DashboardPage() {
  const { hasPermission } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const canSales = hasPermission('sales.read')
  const canCatalog = hasPermission('catalog.product.read')
  const canFinance = hasPermission('finance.read')
  const canForecast = hasPermission('forecast.run')

  const [daily, setDaily] = useState<DailySalesPoint[]>([])
  const [dailyPrev, setDailyPrev] = useState<DailySalesPoint[]>([])
  const [forecasts, setForecasts] = useState<ForecastResult[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [financeCur, setFinanceCur] = useState<FinanceSummary | null>(null)
  const [financePrev, setFinancePrev] = useState<FinanceSummary | null>(null)
  const [ordersCur, setOrdersCur] = useState(0)
  const [ordersPrev, setOrdersPrev] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const today = new Date()
    const endCur = toYmd(today)
    const startCur = toYmd(new Date(today.getTime() - 29 * 86400000))
    const endPrev = toYmd(new Date(today.getTime() - 30 * 86400000))
    const startPrev = toYmd(new Date(today.getTime() - 59 * 86400000))

    ;(async () => {
      try {
        setLoading(true)
        setError(null)

        const tasks: Promise<void>[] = []

        if (canSales) {
          tasks.push(
            (async () => {
              const [a, b, c, d] = await Promise.all([
                api.get<DailySalesPoint[]>('/sales/analytics/daily', { params: { start_date: startCur, end_date: endCur } }),
                api.get<DailySalesPoint[]>('/sales/analytics/daily', { params: { start_date: startPrev, end_date: endPrev } }),
                api.get<unknown[]>('/sales/records', { params: { start_date: startCur, end_date: endCur, limit: 500 } }),
                api.get<unknown[]>('/sales/records', { params: { start_date: startPrev, end_date: endPrev, limit: 500 } }),
              ])
              if (!alive) return
              setDaily(a.data)
              setDailyPrev(b.data)
              setOrdersCur(c.data.length)
              setOrdersPrev(d.data.length)
            })(),
          )
        }

        if (canForecast) {
          tasks.push(
            (async () => {
              const f = await api.get<ForecastResult[]>('/forecast/results')
              if (!alive) return
              setForecasts(f.data)
            })(),
          )
        }

        if (canCatalog) {
          tasks.push(
            (async () => {
              const p = await api.get<Product[]>('/products')
              if (!alive) return
              setProducts(p.data)
            })(),
          )
        }

        if (canFinance) {
          tasks.push(
            (async () => {
              const [fc, fp] = await Promise.all([
                api.get<FinanceSummary>('/finance/summary', { params: { start_date: startCur, end_date: endCur } }),
                api.get<FinanceSummary>('/finance/summary', { params: { start_date: startPrev, end_date: endPrev } }),
              ])
              if (!alive) return
              setFinanceCur(fc.data)
              setFinancePrev(fp.data)
            })(),
          )
        }

        await Promise.all(tasks)
      } catch (e) {
        if (!alive) return
        setError(getApiErrorMessage(e, 'Yükleme başarısız'))
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [canSales, canCatalog, canFinance, canForecast])

  const latestProphet = useMemo(() => {
    const prophet = forecasts.filter((x) => x.model_name === 'prophet')
    return prophet.length ? prophet[0] : forecasts[0]
  }, [forecasts])

  const chartData = useMemo<LinePoint[]>(() => {
    const map = new Map<string, LinePoint>()
    for (const p of daily) {
      const key = iso(p.date)
      map.set(key, { date: key, actualQty: p.quantity })
    }
    const fDaily = latestProphet?.result_payload?.daily ?? []
    for (const p of fDaily) {
      const key = iso(p.date)
      const cur = map.get(key) ?? { date: key }
      cur.forecastQty =
        typeof p.quantity === 'number' ? p.quantity : typeof p.value === 'number' ? p.value : undefined
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [daily, latestProphet])

  const revenueCur = financeCur?.revenue ?? sumDailyRevenue(daily)
  const revenuePrev = financePrev?.revenue ?? sumDailyRevenue(dailyPrev)
  const revTrend = trendPct(revenueCur, revenuePrev)

  const ordTrend = trendPct(ordersCur, ordersPrev)

  const criticalNow = products.filter((p) => p.stock_quantity <= p.reorder_level).length
  const critTrend = { pct: null as number | null, positive: true }

  const aiScore = useMemo(() => {
    const pts = chartData.filter((x) => x.actualQty != null && x.forecastQty != null).slice(-14)
    if (pts.length < 3) return { score: null as number | null, prev: null as number | null }
    let err = 0
    let denom = 0
    for (const x of pts) {
      const a = x.actualQty ?? 0
      const f = x.forecastQty ?? 0
      if (a > 0) {
        err += Math.abs(a - f) / a
        denom += 1
      }
    }
    if (!denom) return { score: null, prev: null }
    const mape = err / denom
    const score = Math.max(0, Math.min(100, Math.round((1 - mape) * 100)))
    const prevPts = chartData.filter((x) => x.actualQty != null && x.forecastQty != null).slice(-28, -14)
    let err2 = 0
    let d2 = 0
    for (const x of prevPts) {
      const a = x.actualQty ?? 0
      const f = x.forecastQty ?? 0
      if (a > 0) {
        err2 += Math.abs(a - f) / a
        d2 += 1
      }
    }
    const prevScore = d2 ? Math.max(0, Math.min(100, Math.round((1 - err2 / d2) * 100))) : score
    return { score, prev: prevScore }
  }, [chartData])

  const aiTrend =
    aiScore.score != null && aiScore.prev != null
      ? trendPct(aiScore.score, aiScore.prev)
      : { pct: null as number | null, positive: true }

  const fmtTry = (n: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)

  return (
    <PageLayout
      title="Dashboard"
      subtitle="Mağaza ve operasyon özetiniz — son 30 güne göre trendler."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className={secondaryButtonClass + ' pointer-events-none text-xs'}>
            Son 30 gün vs önceki 30 gün
          </span>
          <button type="button" className={primaryButtonClass + ' text-xs'}>
            Widget özelleştir
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Toplam ciro"
          value={fmtTry(revenueCur)}
          trendPct={revTrend.pct}
          trendPositive={revTrend.positive}
          icon={BarChart3}
        />
        <StatCard
          title="Satış kayıtları (30 gün)"
          value={String(ordersCur)}
          trendPct={ordTrend.pct}
          trendPositive={ordTrend.positive}
          icon={ShoppingCart}
        />
        <StatCard
          title="Kritik stok kalemi"
          value={String(criticalNow)}
          trendPct={critTrend.pct}
          trendPositive={!critTrend.positive}
          icon={Package}
        />
        <StatCard
          title="AI tahmin uyumu"
          value={aiScore.score != null ? `${aiScore.score}%` : '—'}
          trendPct={aiScore.score != null ? aiTrend.pct : null}
          trendPositive={aiTrend.positive}
          icon={Brain}
        />
      </div>

      <SalesForecastLineChart
        data={chartData}
        loading={loading && !chartData.length}
        error={error}
        modelName={latestProphet?.model_name}
        isDark={isDark}
      />

      {canCatalog ? <CriticalStockTable products={products} loading={loading && !products.length} error={null} /> : null}
    </PageLayout>
  )
}
