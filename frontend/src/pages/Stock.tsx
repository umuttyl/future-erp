import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Download, Loader2, Sparkles, Upload, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { ProductAiBadges } from '../components/ui/AiBadge'
import { AppToast } from '../components/ui/AppToast'
import { FormHint } from '../components/ui/FormHint'
import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { SkeletonTable } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import {
  ghostButtonClass,
  inputFieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  selectFieldClass,
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
} from '../components/ui/forms'
import {
  api,
  cancelStockCount,
  fetchProductSignals,
  completeStockCount,
  createStockCount,
  downloadExport,
  fetchStockCounts,
  formatCurrency,
  formatDate,
  formatNumber,
  getApiErrorMessage,
  postInventoryAutoDraft,
  type Product,
  type ProductCreate,
  type ProductUpdate,
  type StockAdjustRequest,
  type StockCount,
  type StockCountCreate,
  type StockMovement,
} from '../lib/api'
import { isProductStockCriticallyLow } from '../lib/stockCritical'
import { ImportModal } from '../components/ui/ImportModal'
import { AIReorderPanel } from '../components/ai/AIReorderPanel'

type ProductForm = {
  sku: string
  name: string
  category: string
  unit_price: string
  cost_price: string
  tax_rate: string
  stock_quantity: string
  reorder_level: string
}

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  category: '',
  unit_price: '',
  cost_price: '',
  tax_rate: '20',
  stock_quantity: '0',
  reorder_level: '0',
}

type StockAdjustForm = {
  productId: number | null
  change: string
  movement_type: 'in' | 'out' | 'adjust'
  note: string
  unit_cost: string
}

const emptyAdjust: StockAdjustForm = {
  productId: null,
  change: '',
  movement_type: 'in',
  note: '',
  unit_cost: '',
}

const PERM_STOCK_ADJUST = 'stock.adjust'

export function StockPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canAutoDraft = hasPermission(PERM_STOCK_ADJUST)
  const [searchParams] = useSearchParams()

  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [stockCounts, setStockCounts] = useState<StockCount[]>([])
  const [showCountModal, setShowCountModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterCat, setFilterCat] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [adjust, setAdjust] = useState<StockAdjustForm>(emptyAdjust)
  const [busy, setBusy] = useState(false)
  const [draftingProductId, setDraftingProductId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ variant: 'success' | 'error'; message: string } | null>(null)
  const [draftResult, setDraftResult] = useState<{ productName: string; qty: number; stockBefore: number; targetStock: number; demand30d: number | null } | null>(null)
  const [productSignalMap, setProductSignalMap] = useState<Map<number, string[]>>(new Map())
  const [showImport, setShowImport] = useState(false)
  const movementsRef = useRef<HTMLDivElement>(null)

  const dismissToast = useCallback(() => setToast(null), [])

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const [pr, mv, sc] = await Promise.all([
        api.get<Product[]>('/products'),
        api.get<StockMovement[]>('/products/movements', { params: { limit: 30 } }),
        fetchStockCounts({ limit: 20 }),
      ])
      setProducts(pr.data)
      setMovements(mv.data)
      setStockCounts(sc)
      // AI signals — silently skip if permission denied
      fetchProductSignals().then((signals) => {
        const map = new Map<number, string[]>()
        for (const s of signals) map.set(s.product_id, s.signals)
        setProductSignalMap(map)
      }).catch(() => { /* no ai.insights.read permission */ })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('stock.loadError')))
    } finally {
      setLoading(false)
    }
  }

  async function handleCompleteCount(id: number) {
    try {
      const updated = await completeStockCount(id)
      setStockCounts(prev => prev.map(c => c.id === id ? updated : c))
      await load()
      setToast({ variant: 'success', message: t('stock.countCompleted') })
    } catch (e) {
      setToast({ variant: 'error', message: getApiErrorMessage(e, t('stock.countCompleteFailed')) })
    }
  }

  async function handleCancelCount(id: number) {
    if (!confirm(t('stock.cancelCountConfirm'))) return
    try {
      const updated = await cancelStockCount(id)
      setStockCounts(prev => prev.map(c => c.id === id ? updated : c))
    } catch (e) {
      setToast({ variant: 'error', message: getApiErrorMessage(e, t('stock.cancelCountFailed')) })
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const highlightProductId = useMemo(() => {
    const raw = searchParams.get('productId')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [searchParams])

  useEffect(() => {
    if (highlightProductId == null || loading) return
    const t = window.setTimeout(() => {
      document.getElementById(`stock-product-row-${highlightProductId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 120)
    return () => window.clearTimeout(t)
  }, [highlightProductId, loading, products.length])

  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const p of products) if (p.category) s.add(p.category)
    return Array.from(s).sort()
  }, [products])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filterCat && p.category !== filterCat) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })
  }, [products, filterCat, search])

  const kpis = useMemo(() => {
    let invValue = 0
    let units = 0
    let lowStock = 0
    for (const p of products) {
      const price = Number(p.unit_price)
      invValue += (p.stock_quantity || 0) * (Number.isFinite(price) ? price : 0)
      units += p.stock_quantity || 0
      if (isProductStockCriticallyLow(p)) lowStock += 1
    }
    return { invValue, units, lowStock, skuCount: products.length }
  }, [products])

  // ─── AI form suggestions (only when creating a new product) ─────────────────

  const categorySuggestion = useMemo<string>(() => {
    if (editing || form.name.trim().length < 2 || form.category.trim()) return ''
    const q = form.name.toLowerCase()
    const matches = products.filter((p) => p.name.toLowerCase().includes(q) && p.category)
    if (!matches.length) return ''
    const freq = new Map<string, number>()
    for (const p of matches) {
      const c = p.category!
      freq.set(c, (freq.get(c) ?? 0) + 1)
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }, [editing, form.name, form.category, products])

  const priceSuggestion = useMemo<string>(() => {
    if (editing || form.unit_price.trim() || !form.category.trim()) return ''
    const same = products.filter((p) => p.category === form.category && Number(p.unit_price) > 0)
    if (!same.length) return ''
    const avg = same.reduce((s, p) => s + Number(p.unit_price), 0) / same.length
    return avg.toFixed(2)
  }, [editing, form.category, form.unit_price, products])

  function acceptCategory() {
    if (categorySuggestion) setForm((f) => ({ ...f, category: categorySuggestion }))
  }
  function acceptPrice() {
    if (priceSuggestion) setForm((f) => ({ ...f, unit_price: priceSuggestion }))
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      sku: p.sku,
      name: p.name,
      category: p.category ?? '',
      unit_price: String(p.unit_price ?? ''),
      cost_price: String(p.cost_price ?? ''),
      tax_rate: String(p.tax_rate ?? '20'),
      stock_quantity: String(p.stock_quantity ?? 0),
      reorder_level: String(p.reorder_level ?? 0),
    })
    setShowForm(true)
  }

  async function saveProduct() {
    setBusy(true)
    setError(null)
    try {
      if (editing) {
        const payload: ProductUpdate = {
          sku: form.sku,
          name: form.name,
          category: form.category || null,
          unit_price: Number(form.unit_price),
          cost_price: Number(form.cost_price || 0),
          tax_rate: Number(form.tax_rate || 20),
          reorder_level: Number(form.reorder_level || 0),
        }
        await api.patch(`/products/${editing.id}`, payload)
      } else {
        const payload: ProductCreate = {
          sku: form.sku,
          name: form.name,
          category: form.category || null,
          unit_price: Number(form.unit_price),
          cost_price: Number(form.cost_price || 0),
          tax_rate: Number(form.tax_rate || 20),
          stock_quantity: Number(form.stock_quantity || 0),
          reorder_level: Number(form.reorder_level || 0),
        }
        await api.post('/products', payload)
      }
      setShowForm(false)
      await load()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('stock.saveError')))
    } finally {
      setBusy(false)
    }
  }

  async function deleteProduct(p: Product) {
    if (!confirm(t('stock.deleteProductConfirm', { name: p.name }))) return
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/products/${p.id}`)
      await load()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('stock.deleteFailed')))
    } finally {
      setBusy(false)
    }
  }

  async function submitAdjust() {
    if (!adjust.productId || !adjust.change) return
    setBusy(true)
    setError(null)
    try {
      const delta =
        adjust.movement_type === 'out'
          ? -Math.abs(Number(adjust.change))
          : adjust.movement_type === 'in'
            ? Math.abs(Number(adjust.change))
            : Number(adjust.change)

      const payload: StockAdjustRequest = {
        change: delta,
        movement_type: adjust.movement_type,
        note: adjust.note || undefined,
        reference: 'manual',
        unit_cost: adjust.movement_type === 'in' && adjust.unit_cost ? Number(adjust.unit_cost) : undefined,
      }
      const { data: mv } = await api.post<StockMovement>(`/products/${adjust.productId}/stock`, payload)
      const productName = products.find((p) => p.id === adjust.productId)?.name ?? `#${adjust.productId}`
      setAdjust(emptyAdjust)
      await load()
      setToast({
        variant: 'success',
        message: t('stock.movementSaved', { name: productName, delta: `${delta > 0 ? '+' : ''}${delta}`, balance: mv.balance_after }),
      })
      window.setTimeout(() => {
        movementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, t('stock.adjustError')))
    } finally {
      setBusy(false)
    }
  }

  async function createAutoDraftSupply(p: Product) {
    if (draftingProductId != null) return
    setDraftingProductId(p.id)
    dismissToast()
    setDraftResult(null)
    try {
      const res = await postInventoryAutoDraft(p.id)
      setDraftResult({
        productName: p.name,
        qty: res.order.quantity,
        stockBefore: res.stock_before,
        targetStock: res.target_stock,
        demand30d: res.prophet_demand_sum_30d,
      })
    } catch (e: unknown) {
      setToast({
        variant: 'error',
        message: getApiErrorMessage(e, t('stock.draftError')),
      })
    } finally {
      setDraftingProductId(null)
    }
  }

  return (
    <PageLayout
      title={t('stock.title')}
      subtitle={t('stock.subtitle')}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void downloadExport('products', 'stock_report.xlsx')}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-white/5"
            title={t('salesOrders.downloadExcel')}
          >
            <Download className="h-3.5 w-3.5" />
            {t('salesOrders.excel')}
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-white/5"
            title="Import from Excel/CSV"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <button type="button" onClick={() => setShowCountModal(true)} className={secondaryButtonClass}>
            {t('stock.stockCount')}
          </button>
          <button type="button" onClick={openCreate} className={primaryButtonClass}>
            + {t('stock.newProduct')}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label={t('stock.skuCount')} value={formatNumber(kpis.skuCount)} />
        <Kpi label={t('stock.totalUnits')} value={formatNumber(kpis.units)} />
        <Kpi label={t('stock.inventoryValue')} value={formatCurrency(kpis.invValue)} accent="violet" />
        <Kpi
          label={t('stock.criticalStock')}
          value={formatNumber(kpis.lowStock)}
          accent={kpis.lowStock > 0 ? 'rose' : undefined}
        />
      </div>

      {!loading && <AIReorderPanel defaultCollapsed={kpis.lowStock === 0} />}

      {/* Recent stock activity — last 3 movements, scrolls to full table */}
      {movements.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-500/20" />
          <div className="flex-1 min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent Stock Activity</p>
            <div className="space-y-1.5">
              {movements.slice(0, 3).map((m) => {
                const pr = products.find((x) => x.id === m.product_id)
                const isIn = m.change > 0
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium uppercase ${isIn ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'}`}>
                      {isIn ? '+' : ''}{m.change}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {pr ? pr.name : `Product #${m.product_id}`}
                    </span>
                    {m.reference && (
                      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500 truncate max-w-[180px]">{m.reference}</span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => movementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="shrink-0 self-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10"
          >
            View all →
          </button>
        </div>
      )}

      <GlobalCard>
        <div className="flex flex-wrap items-end gap-3">
          <LabeledField label={t('stock.searchPlaceholder')}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="mouse, SKU-2001..."
              className={inputFieldClass + ' min-w-[200px]'}
            />
          </LabeledField>
          <LabeledField label={t('stock.category')}>
            <select
              aria-label={t('stock.categoryFilterAria')}
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className={selectFieldClass + ' min-w-[160px]'}
            >
              <option value="">{t('common.all')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </LabeledField>
        </div>
      </GlobalCard>

      {loading && products.length === 0 ? (
        <SkeletonTable rows={8} cols={8} />
      ) : (
      <GlobalCard>
        <GlobalCardHeader
          title={t('stock.products')}
          description={t('stock.productCount', { count: filtered.length })}
          right={error ? <span className="text-sm text-rose-600 dark:text-rose-300">{error}</span> : null}
        />
        <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="px-4 py-3">{t('stock.colSku')}</th>
                <th className="px-4 py-3">{t('stock.colProduct')}</th>
                <th className="px-4 py-3">{t('stock.colCategory')}</th>
                <th className="px-4 py-3 text-right">{t('stock.colPrice')}</th>
                <th className="px-4 py-3 text-right">{t('stock.colCost')}</th>
                <th className="px-4 py-3 text-right">{t('stock.colStock')}</th>
                <th className="px-4 py-3 text-right">{t('stock.colThreshold')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold normal-case tracking-normal">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const critical = isProductStockCriticallyLow(p)
                const rowHi = highlightProductId === p.id
                return (
                  <tr
                    key={p.id}
                    id={`stock-product-row-${p.id}`}
                    className={[
                      tableRowHoverClass,
                      rowHi
                        ? 'bg-violet-50/80 ring-2 ring-inset ring-violet-400/70 dark:bg-violet-950/35 dark:ring-violet-500/50'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className={`px-4 py-3 font-mono ${tableCellClass}`}>{p.sku}</td>
                    <td className={`px-4 py-3 font-medium text-slate-900 dark:text-slate-100`}>
                      {p.name}
                      <ProductAiBadges signals={productSignalMap.get(p.id) ?? []} />
                    </td>
                    <td className={`px-4 py-3 ${tableCellClass}`}>{p.category ?? '—'}</td>
                    <td className={`px-4 py-3 text-right ${tableCellClass}`}>{formatCurrency(p.unit_price)}</td>
                    <td className={`px-4 py-3 text-right text-slate-500 dark:text-slate-400`}>
                      {formatCurrency(p.cost_price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={[
                          'rounded-md border px-2 py-0.5 text-xs font-semibold',
                          critical
                            ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-950/40 dark:text-emerald-200',
                        ].join(' ')}
                      >
                        {formatNumber(p.stock_quantity)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right text-slate-500 dark:text-slate-400`}>
                      {formatNumber(p.reorder_level)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {critical && canAutoDraft ? (
                          <button
                            type="button"
                            disabled={draftingProductId != null}
                            onClick={() => void createAutoDraftSupply(p)}
                            title={t('stock.draftTooltip')}
                            className={[
                              'inline-flex items-center gap-1.5 rounded-full border border-violet-400/60 bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/40',
                              'ring-2 ring-violet-400/40 transition hover:opacity-[0.97] hover:shadow-violet-500/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500',
                              'disabled:pointer-events-none disabled:opacity-60',
                              'motion-safe:animate-pulse motion-reduce:animate-none',
                            ].join(' ')}
                          >
                            {draftingProductId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            )}
                            <span className="max-w-[10rem] truncate sm:max-w-[14rem]">
                              {draftingProductId === p.id ? t('common.loading') : t('stock.createDraft')}
                            </span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setAdjust({
                              ...emptyAdjust,
                              productId: p.id,
                              movement_type: 'in',
                            })
                          }
                          className={ghostButtonClass + ' text-xs'}
                        >
                          {t('stock.stockAdjust')}
                        </button>
                        <button type="button" onClick={() => openEdit(p)} className={ghostButtonClass + ' text-xs'}>
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteProduct(p)}
                          className={
                            ghostButtonClass +
                            ' border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-950/30 text-xs'
                          }
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlobalCard>
      )}

      <div ref={movementsRef}>
      <GlobalCard>
        <GlobalCardHeader title={t('stock.recentMovements')} description={t('stock.last30Records')} />
        <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="px-4 py-3">{t('stock.colTime')}</th>
                <th className="px-4 py-3">{t('stock.colProduct')}</th>
                <th className="px-4 py-3">{t('stock.colMovementType')}</th>
                <th className="px-4 py-3 text-right">{t('stock.colChange')}</th>
                <th className="px-4 py-3 text-right">{t('stock.colBalance')}</th>
                <th className="px-4 py-3">{t('stock.colReference')}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const pr = products.find((x) => x.id === m.product_id)
                const isIn = m.change > 0
                return (
                  <tr key={m.id} className={tableRowHoverClass}>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{formatDate(m.created_at)}</td>
                    <td className={`px-4 py-2 ${tableCellClass}`}>
                      {pr ? `${pr.sku} · ${pr.name}` : `#${m.product_id}`}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={[
                          'rounded-md px-2 py-0.5 text-xs font-medium uppercase',
                          m.movement_type === 'in'
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : m.movement_type === 'out'
                              ? 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                              : 'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-200',
                        ].join(' ')}
                      >
                        {m.movement_type}
                      </span>
                    </td>
                    <td
                      className={[
                        'px-4 py-2 text-right font-mono font-medium',
                        isIn ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
                      ].join(' ')}
                    >
                      {isIn ? '+' : ''}
                      {m.change}
                    </td>
                    <td className={`px-4 py-2 text-right ${tableCellClass}`}>{m.balance_after}</td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{m.reference ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </GlobalCard>
      </div>

      {stockCounts.length > 0 && (
        <GlobalCard>
          <GlobalCardHeader title={t('stock.stockCounts')} description={t('stock.last20Records')} />
          <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className={tableHeaderClass}>
                  <th className="px-4 py-3">{t('stock.colNo')}</th>
                  <th className="px-4 py-3">{t('common.date')}</th>
                  <th className="px-4 py-3 text-right">{t('stock.colItem')}</th>
                  <th className="px-4 py-3 text-right">{t('stock.colDiff')}</th>
                  <th className="px-4 py-3">{t('stock.colCountStatus')}</th>
                  <th className="px-4 py-3 text-right">{t('stock.colCountAction')}</th>
                </tr>
              </thead>
              <tbody>
                {stockCounts.map(c => {
                  const totalDiff = c.items.reduce((s, i) => s + Math.abs(i.difference), 0)
                  const statusCls = c.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : c.status === 'cancelled'
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  const statusLabel = c.status === 'completed' ? t('stock.countDone') : c.status === 'cancelled' ? t('stock.countCancelled') : t('stock.countDraft')
                  return (
                    <tr key={c.id} className={tableRowHoverClass}>
                      <td className={`px-4 py-2 font-mono font-semibold ${tableCellClass}`}>{c.count_no}</td>
                      <td className={`px-4 py-2 ${tableCellClass}`}>{formatDate(c.count_date)}</td>
                      <td className={`px-4 py-2 text-right ${tableCellClass}`}>{c.items.length}</td>
                      <td className={`px-4 py-2 text-right font-mono ${totalDiff > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                        {totalDiff > 0 ? `±${totalDiff}` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCls}`}>{statusLabel}</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {c.status === 'draft' && (
                            <>
                              <button type="button" title={t('stock.completeTooltip')} onClick={() => void handleCompleteCount(c.id)}
                                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                                <CheckCircle size={15} />
                              </button>
                              <button type="button" title={t('stock.cancelCountTooltip')} onClick={() => void handleCancelCount(c.id)}
                                className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                                <X size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </GlobalCard>
      )}

      {showImport && (
        <ImportModal
          resource="products"
          title="Import Products"
          onClose={() => setShowImport(false)}
          onSuccess={() => { void load(); setShowImport(false) }}
        />
      )}

      {showCountModal && (
        <StockCountModal
          products={products}
          onClose={() => setShowCountModal(false)}
          onCreated={(sc) => {
            setStockCounts(prev => [sc, ...prev])
            setShowCountModal(false)
            setToast({ variant: 'success', message: `Count ${sc.count_no} created.` })
          }}
        />
      )}

      {showForm ? (
        <Modal title={editing ? t('stock.editProduct') : t('stock.newProductTitle')} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label={t('stock.colSku')}>
              <input
                aria-label={t('stock.colSku')}
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label={t('stock.categoryLabel')}>
              <input
                aria-label={t('stock.categoryLabel')}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Tab' && categorySuggestion) { e.preventDefault(); acceptCategory() } }}
                className={inputFieldClass}
              />
              <FormHint label={t('stock.categorySuggestion')} value={categorySuggestion} onAccept={acceptCategory} />
            </LabeledField>
            <LabeledField label={t('stock.productNameLabel')} className="col-span-2">
              <input
                aria-label={t('stock.productNameAria')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label={t('stock.unitPriceLabel')}>
              <input
                aria-label={t('stock.unitPriceAria')}
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Tab' && priceSuggestion) { e.preventDefault(); acceptPrice() } }}
                className={inputFieldClass}
              />
              <FormHint label={t('stock.categoryAvg')} value={priceSuggestion ? formatCurrency(Number(priceSuggestion)) : ''} onAccept={acceptPrice} />
            </LabeledField>
            <LabeledField label={t('stock.costLabel')}>
              <input
                aria-label={t('stock.costAria')}
                type="number"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label={t('stock.vatRateLabel')}>
              <select
                aria-label={t('stock.vatRateAria')}
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                className={inputFieldClass}
              >
                <option value="0">{t('stock.vatExempt')}</option>
                <option value="1">%1</option>
                <option value="10">%10</option>
                <option value="20">{t('stock.vatStandard')}</option>
              </select>
            </LabeledField>
            {!editing ? (
              <LabeledField label={t('stock.initialStock')}>
                <input
                  aria-label={t('stock.initialStockAria')}
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  className={inputFieldClass}
                />
              </LabeledField>
            ) : null}
            <LabeledField label={t('stock.criticalThreshold')}>
              <input
                aria-label={t('stock.criticalThresholdAria')}
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className={secondaryButtonClass}>
              {t('common.cancel')}
            </button>
            <button type="button" disabled={busy} onClick={() => void saveProduct()} className={primaryButtonClass}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </Modal>
      ) : null}

      {adjust.productId != null ? (
        <Modal title={`${t('stock.stockMovementTitle')} · #${adjust.productId}`} onClose={() => setAdjust(emptyAdjust)}>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label={t('stock.movementType')}>
              <select
                aria-label={t('stock.movementTypeAria')}
                value={adjust.movement_type}
                onChange={(e) =>
                  setAdjust({
                    ...adjust,
                    movement_type: e.target.value as 'in' | 'out' | 'adjust',
                  })
                }
                className={selectFieldClass}
              >
                <option value="in">{t('stock.movementIn')}</option>
                <option value="out">{t('stock.movementOut')}</option>
                <option value="adjust">{t('stock.movementAdjust')}</option>
              </select>
            </LabeledField>
            <LabeledField label={t('stock.quantity')}>
              <input
                type="number"
                value={adjust.change}
                onChange={(e) => setAdjust({ ...adjust, change: e.target.value })}
                placeholder="10"
                className={inputFieldClass}
              />
            </LabeledField>
            {adjust.movement_type === 'in' && (
              <LabeledField label={t('stock.unitCostOptional')}>
                <input
                  type="number"
                  step="0.01"
                  aria-label={t('stock.unitCostAria')}
                  value={adjust.unit_cost}
                  onChange={(e) => setAdjust({ ...adjust, unit_cost: e.target.value })}
                  placeholder={t('stock.unitCostHint')}
                  className={inputFieldClass}
                />
              </LabeledField>
            )}
            <LabeledField label={t('stock.noteLabel')} className={adjust.movement_type === 'in' ? '' : 'col-span-2'}>
              <input
                aria-label={t('stock.noteAria')}
                value={adjust.note}
                onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
                placeholder={t('stock.notePlaceholder')}
                className={inputFieldClass}
              />
            </LabeledField>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setAdjust(emptyAdjust)} className={secondaryButtonClass}>
              {t('common.cancel')}
            </button>
            <button type="button" disabled={busy} onClick={() => void submitAdjust()} className={primaryButtonClass}>
              {busy ? t('stock.processing') : t('common.save')}
            </button>
          </div>
        </Modal>
      ) : null}

      {draftResult ? (
        <Modal title={t('stock.draftCreated')} onClose={() => setDraftResult(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t('stock.draftCreatedDesc', { name: draftResult.productName })}
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              <DraftStat label={t('stock.orderQty')} value={formatNumber(draftResult.qty)} accent="violet" />
              <DraftStat label={t('stock.currentStock')} value={formatNumber(draftResult.stockBefore)} />
              <DraftStat label={t('stock.targetStock')} value={formatNumber(draftResult.targetStock)} />
              {draftResult.demand30d != null && (
                <DraftStat label={t('stock.estDemand30')} value={formatNumber(Math.round(draftResult.demand30d))} />
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('stock.draftReadyNote')}
            </p>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setDraftResult(null)} className={primaryButtonClass}>
              {t('common.confirm')}
            </button>
          </div>
        </Modal>
      ) : null}

      {toast ? (
        <AppToast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </PageLayout>
  )
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'violet' | 'rose'
}) {
  const accentCls =
    accent === 'violet'
      ? 'border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-950/30'
      : accent === 'rose'
        ? 'border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-950/30'
        : 'border-slate-200 bg-white dark:border-white/10 dark:bg-[#16122b]'
  return (
    <div
      className={[
        'rounded-2xl border p-4 shadow-sm dark:shadow-card-dark',
        accentCls,
      ].join(' ')}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={[
          'mt-1 text-2xl font-semibold',
          accent === 'violet'
            ? 'text-violet-900 dark:text-violet-100'
            : accent === 'rose'
              ? 'text-rose-900 dark:text-rose-100'
              : 'text-slate-900 dark:text-slate-100',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}

function LabeledField({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  )
}

function DraftStat({ label, value, accent }: { label: string; value: string; accent?: 'violet' }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={['mt-0.5 text-sm font-semibold', accent === 'violet' ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-slate-100'].join(' ')}>
        {value}
      </div>
    </div>
  )
}

function StockCountModal({
  products,
  onClose,
  onCreated,
}: {
  products: Product[]
  onClose: () => void
  onCreated: (sc: StockCount) => void
}) {
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const [countNo, setCountNo] = useState(`SAY-${today.replace(/-/g, '')}`)
  const [countDate, setCountDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ product_id: number; counted_qty: number }[]>(
    products.map(p => ({ product_id: p.id, counted_qty: p.stock_quantity || 0 }))
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function setQty(productId: number, val: number) {
    setLines(prev => prev.map(l => l.product_id === productId ? { ...l, counted_qty: val } : l))
  }

  async function handleSave() {
    if (!countNo.trim()) { setErr(t('stock.countNoRequired')); return }
    setSaving(true); setErr(null)
    try {
      const payload: StockCountCreate = {
        count_no: countNo,
        count_date: countDate,
        notes: notes || null,
        items: lines,
      }
      const sc = await createStockCount(payload)
      onCreated(sc)
    } catch (e) {
      setErr(getApiErrorMessage(e, t('stock.countCreateError')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-slate-950/70" onClick={onClose} role="presentation">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#16122b]"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('stock.newStockCount')}</div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">{t('common.close')}</button>
        </div>
        <div className="p-5">
          {err && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label={t('stock.countNo')}>
              <input aria-label={t('stock.countNoAria')} className={inputFieldClass} value={countNo} onChange={e => setCountNo(e.target.value)} />
            </LabeledField>
            <LabeledField label={t('common.date')}>
              <input aria-label={t('stock.countDateAria')} type="date" className={inputFieldClass} value={countDate} onChange={e => setCountDate(e.target.value)} />
            </LabeledField>
            <LabeledField label={t('stock.notes')} className="col-span-2">
              <input aria-label={t('stock.notes')} className={inputFieldClass} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('stock.notesPlaceholder')} />
            </LabeledField>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-slate-100 dark:border-white/5">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-[#16122b]">
              <tr className={tableHeaderClass}>
                <th className="px-4 py-2 text-left">{t('stock.colSku')}</th>
                <th className="px-4 py-2 text-left">{t('stock.colProduct')}</th>
                <th className="px-4 py-2 text-right">{t('stock.colSystem')}</th>
                <th className="px-4 py-2 text-right">{t('stock.colCounted')}</th>
                <th className="px-4 py-2 text-right">{t('stock.colDiff')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const line = lines.find(l => l.product_id === p.id)!
                const diff = line.counted_qty - (p.stock_quantity || 0)
                return (
                  <tr key={p.id} className={tableRowHoverClass}>
                    <td className={`px-4 py-2 font-mono text-xs ${tableCellClass}`}>{p.sku}</td>
                    <td className={`px-4 py-2 ${tableCellClass}`}>{p.name}</td>
                    <td className={`px-4 py-2 text-right text-slate-500`}>{p.stock_quantity ?? 0}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        aria-label={t('stock.countedQtyAria', { name: p.name })}
                        value={line.counted_qty}
                        onChange={e => setQty(p.id, Math.max(0, Number(e.target.value)))}
                        className={`w-20 rounded-lg border px-2 py-1 text-right text-sm ${
                          diff !== 0
                            ? 'border-amber-300 bg-amber-50 dark:border-amber-600/50 dark:bg-amber-900/20'
                            : 'border-slate-200 bg-white dark:border-white/10 dark:bg-[#1a1628]'
                        } text-slate-900 outline-none focus:ring-2 focus:ring-violet-400 dark:text-slate-100`}
                      />
                    </td>
                    <td className={`px-4 py-2 text-right font-mono font-semibold text-sm ${
                      diff > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                      diff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                    }`}>
                      {diff === 0 ? '—' : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-white/5">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('common.cancel')}</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className={primaryButtonClass}>
            {saving ? t('common.saving') : t('stock.createCount')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-slate-950/70"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#16122b]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Kapat
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
