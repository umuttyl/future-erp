import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { AppToast } from '../components/ui/AppToast'
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
  formatCurrency,
  formatDate,
  formatNumber,
  getApiErrorMessage,
  postInventoryAutoDraft,
  type Product,
  type ProductCreate,
  type ProductUpdate,
  type StockAdjustRequest,
  type StockMovement,
} from '../lib/api'
import { isProductStockCriticallyLow } from '../lib/stockCritical'

type ProductForm = {
  sku: string
  name: string
  category: string
  unit_price: string
  cost_price: string
  stock_quantity: string
  reorder_level: string
}

const emptyForm: ProductForm = {
  sku: '',
  name: '',
  category: '',
  unit_price: '',
  cost_price: '',
  stock_quantity: '0',
  reorder_level: '0',
}

type StockAdjustForm = {
  productId: number | null
  change: string
  movement_type: 'in' | 'out' | 'adjust'
  note: string
}

const emptyAdjust: StockAdjustForm = {
  productId: null,
  change: '',
  movement_type: 'in',
  note: '',
}

const PERM_STOCK_ADJUST = 'stock.adjust'

export function StockPage() {
  const { hasPermission } = useAuth()
  const canAutoDraft = hasPermission(PERM_STOCK_ADJUST)
  const [searchParams] = useSearchParams()

  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
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
  const movementsRef = useRef<HTMLDivElement>(null)

  const dismissToast = useCallback(() => setToast(null), [])

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const [pr, mv] = await Promise.all([
        api.get<Product[]>('/products'),
        api.get<StockMovement[]>('/products/movements', { params: { limit: 30 } }),
      ])
      setProducts(pr.data)
      setMovements(mv.data)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Yükleme başarısız'))
    } finally {
      setLoading(false)
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
          stock_quantity: Number(form.stock_quantity || 0),
          reorder_level: Number(form.reorder_level || 0),
        }
        await api.post('/products', payload)
      }
      setShowForm(false)
      await load()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Kaydedilemedi'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`${p.name} silinecek. Emin misiniz?`)) return
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/products/${p.id}`)
      await load()
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Silinemedi'))
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
      }
      const { data: mv } = await api.post<StockMovement>(`/products/${adjust.productId}/stock`, payload)
      const productName = products.find((p) => p.id === adjust.productId)?.name ?? `#${adjust.productId}`
      setAdjust(emptyAdjust)
      await load()
      setToast({
        variant: 'success',
        message: `${productName}: ${delta > 0 ? '+' : ''}${delta} stok hareketi kaydedildi · Yeni bakiye: ${mv.balance_after}`,
      })
      window.setTimeout(() => {
        movementsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, 'Stok güncellenemedi'))
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
        message: getApiErrorMessage(e, 'Taslak oluşturulamadı'),
      })
    } finally {
      setDraftingProductId(null)
    }
  }

  return (
    <PageLayout
      title="Stok & Ürün Yönetimi"
      subtitle="Ürünleri, fiyatları ve stok seviyelerini buradan yönetin."
      actions={
        <button type="button" onClick={openCreate} className={primaryButtonClass}>
          + Yeni Ürün
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi label="SKU Sayısı" value={formatNumber(kpis.skuCount)} />
        <Kpi label="Toplam Adet" value={formatNumber(kpis.units)} />
        <Kpi label="Envanter Değeri" value={formatCurrency(kpis.invValue)} accent="violet" />
        <Kpi
          label="Kritik Stok"
          value={formatNumber(kpis.lowStock)}
          accent={kpis.lowStock > 0 ? 'rose' : undefined}
        />
      </div>

      <GlobalCard>
        <div className="flex flex-wrap items-end gap-3">
          <LabeledField label="Ara (SKU/ad)">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="mouse, SKU-2001..."
              className={inputFieldClass + ' min-w-[200px]'}
            />
          </LabeledField>
          <LabeledField label="Kategori">
            <select
              aria-label="Kategori filtrele"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className={selectFieldClass + ' min-w-[160px]'}
            >
              <option value="">Tümü</option>
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
          title="Ürünler"
          description={`${filtered.length} ürün`}
          right={error ? <span className="text-sm text-rose-600 dark:text-rose-300">Hata: {error}</span> : null}
        />
        <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Fiyat</th>
                <th className="px-4 py-3 text-right">Maliyet</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3 text-right">Eşik</th>
                <th className="px-4 py-3 text-right text-xs font-semibold normal-case tracking-normal">İşlemler</th>
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
                    <td className={`px-4 py-3 font-medium text-slate-900 dark:text-slate-100`}>{p.name}</td>
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
                            title="AI ile tedarikçiye taslak sipariş oluştur"
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
                              {draftingProductId === p.id ? 'Oluşturuluyor…' : 'Sipariş taslağı oluştur'}
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
                          Stok+/-
                        </button>
                        <button type="button" onClick={() => openEdit(p)} className={ghostButtonClass + ' text-xs'}>
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteProduct(p)}
                          className={
                            ghostButtonClass +
                            ' border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-950/30 text-xs'
                          }
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Ürün bulunamadı.
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
        <GlobalCardHeader title="Son stok hareketleri" description="Son 30 kayıt" />
        <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="px-4 py-3">Zaman</th>
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3 text-right">Değişim</th>
                <th className="px-4 py-3 text-right">Bakiye</th>
                <th className="px-4 py-3">Referans</th>
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

      {showForm ? (
        <Modal title={editing ? 'Ürün Düzenle' : 'Yeni Ürün'} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="SKU">
              <input
                aria-label="SKU"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label="Kategori">
              <input
                aria-label="Kategori"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label="Ürün Adı" className="col-span-2">
              <input
                aria-label="Ürün adı"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label="Birim Fiyat">
              <input
                aria-label="Birim fiyat"
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label="Maliyet">
              <input
                aria-label="Maliyet"
                type="number"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                className={inputFieldClass}
              />
            </LabeledField>
            {!editing ? (
              <LabeledField label="Başlangıç Stoğu">
                <input
                  aria-label="Başlangıç stoğu"
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  className={inputFieldClass}
                />
              </LabeledField>
            ) : null}
            <LabeledField label="Kritik Eşik">
              <input
                aria-label="Kritik eşik"
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
              İptal
            </button>
            <button type="button" disabled={busy} onClick={() => void saveProduct()} className={primaryButtonClass}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </Modal>
      ) : null}

      {adjust.productId != null ? (
        <Modal title={`Stok Hareketi · #${adjust.productId}`} onClose={() => setAdjust(emptyAdjust)}>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Hareket Tipi">
              <select
                aria-label="Hareket tipi"
                value={adjust.movement_type}
                onChange={(e) =>
                  setAdjust({
                    ...adjust,
                    movement_type: e.target.value as 'in' | 'out' | 'adjust',
                  })
                }
                className={selectFieldClass}
              >
                <option value="in">Giriş (in)</option>
                <option value="out">Çıkış (out)</option>
                <option value="adjust">Düzeltme (adjust)</option>
              </select>
            </LabeledField>
            <LabeledField label="Miktar">
              <input
                type="number"
                value={adjust.change}
                onChange={(e) => setAdjust({ ...adjust, change: e.target.value })}
                placeholder="10"
                className={inputFieldClass}
              />
            </LabeledField>
            <LabeledField label="Not" className="col-span-2">
              <input
                value={adjust.note}
                onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
                placeholder="Sayım farkı, sevkiyat, vs."
                className={inputFieldClass}
              />
            </LabeledField>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setAdjust(emptyAdjust)} className={secondaryButtonClass}>
              İptal
            </button>
            <button type="button" disabled={busy} onClick={() => void submitAdjust()} className={primaryButtonClass}>
              {busy ? 'İşleniyor…' : 'Kaydet'}
            </button>
          </div>
        </Modal>
      ) : null}

      {draftResult ? (
        <Modal title="Tedarik Taslağı Oluşturuldu" onClose={() => setDraftResult(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold">{draftResult.productName}</span> için AI tarafından tedarik taslağı oluşturuldu.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              <DraftStat label="Sipariş miktarı" value={formatNumber(draftResult.qty)} accent="violet" />
              <DraftStat label="Mevcut stok" value={formatNumber(draftResult.stockBefore)} />
              <DraftStat label="Hedef stok" value={formatNumber(draftResult.targetStock)} />
              {draftResult.demand30d != null && (
                <DraftStat label="Tahmini 30g talep" value={formatNumber(Math.round(draftResult.demand30d))} />
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sipariş taslağı, tedarik modülünden onaylanmaya hazır.
            </p>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setDraftResult(null)} className={primaryButtonClass}>
              Tamam
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
