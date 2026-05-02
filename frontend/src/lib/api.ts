import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 20_000,
})

/** FastAPI global handler ``{ error: { code, message } }``; legacy ``detail`` desteklenir. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const raw = error.response?.data as { error?: { message?: string }; detail?: unknown } | undefined
    if (raw?.error?.message != null) return String(raw.error.message)
    const detail = raw?.detail
    if (typeof detail === 'string') return detail
  }
  if (error instanceof Error) return error.message
  return fallback
}

export type DailySalesPoint = {
  date: string
  quantity: number
  revenue: number
}

export type ForecastDailyPoint = {
  date: string
  quantity?: number
  value?: number
  confidence?: number
}

export type ForecastResult = {
  id: number
  model_name: string
  scope: string
  product_id?: number | null
  forecast_start: string
  horizon_days: number
  result_payload: {
    daily?: ForecastDailyPoint[]
    meta?: Record<string, unknown>
  }
  created_at: string
}

export type Product = {
  id: number
  sku: string
  name: string
  category?: string | null
  unit_price: string | number
  cost_price: string | number
  stock_quantity: number
  reorder_level: number
  created_at: string
  updated_at: string
}

export type ProductCreate = {
  sku: string
  name: string
  category?: string | null
  unit_price: number
  cost_price?: number
  stock_quantity?: number
  reorder_level?: number
}

export type ProductUpdate = Partial<Omit<ProductCreate, 'stock_quantity'>>

export type StockAdjustRequest = {
  change: number
  movement_type?: 'in' | 'out' | 'adjust'
  reference?: string
  note?: string
}

export type StockMovement = {
  id: number
  product_id: number
  movement_type: 'in' | 'out' | 'adjust'
  change: number
  balance_after: number
  reference?: string | null
  note?: string | null
  created_at: string
}

export type SalesItem = {
  id: number
  sales_record_id: number
  product_id: number
  quantity: number
  unit_price: string | number
  line_total: string | number
}

export type SalesRecord = {
  id: number
  record_no: string
  sale_date: string
  customer_name?: string | null
  total_amount: string | number
  created_at: string
  updated_at: string
  items: SalesItem[]
}

export type FinanceSummary = {
  start_date: string
  end_date: string
  revenue: number
  cogs: number
  gross_profit: number
  margin_pct: number
  total_quantity: number
  order_count: number
  customer_count: number
  avg_order_value: number
  inventory_value: number
}

export type MonthlyPoint = {
  month: string
  revenue: number
  quantity: number
  orders: number
}

export type TopCustomer = {
  customer: string
  revenue: number
  orders: number
}

export type TopProduct = {
  id: number
  sku: string
  name: string
  quantity: number
  revenue: number
}

export function formatCurrency(value: number | string | undefined | null): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0
  if (!Number.isFinite(n as number)) return '—'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(n as number)
}

export function formatNumber(value: number | string | undefined | null): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0
  if (!Number.isFinite(n as number)) return '—'
  return new Intl.NumberFormat('tr-TR').format(n as number)
}

export type NlpChartHint = {
  type: 'bar' | 'line' | 'pie' | 'none'
  x?: string | null
  y?: string | null
  title?: string | null
}

export type NlpQueryResponse = {
  sql: string
  columns: string[]
  data: Array<Record<string, unknown>>
  answer: string
  chart_hint?: NlpChartHint | null
}

export type AiHighlight = {
  title: string
  body: string
  severity: 'positive' | 'info' | 'warning' | 'critical'
  metric?: string | null
}

export type AiInsights = {
  headline: string
  highlights: AiHighlight[]
  context: {
    today: string
    summary_last_30: FinanceSummary
    summary_prev_30: FinanceSummary
    revenue_growth_pct: number
    monthly_revenue: MonthlyPoint[]
    top_customers_last_30: TopCustomer[]
    top_products_last_30: TopProduct[]
    low_stock_products: Array<{
      id: number
      sku: string
      name: string
      stock_quantity: number
      reorder_level: number
    }>
    total_skus: number
  }
}

export type StockAlert = {
  id: number
  sku: string
  name: string
  category?: string | null
  stock_quantity: number
  reorder_level: number
  deficit: number
}

export function formatDate(value: string | undefined | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('tr-TR')
  } catch {
    return value
  }
}
