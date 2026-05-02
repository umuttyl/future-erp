import { useEffect, useMemo, useState } from 'react'

import {
  api,
  formatCurrency,
  formatDate,
  formatNumber,
  type Product,
  type ProductCreate,
  type ProductUpdate,
  type StockAdjustRequest,
  type StockMovement,
} from '../lib/api'

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

export function StockPage() {
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
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Yükleme başarısız')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) if (p.category) set.add(p.category)
    return Array.from(set).sort()
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
      if (p.reorder_level > 0 && p.stock_quantity <= p.reorder_level) lowStock += 1
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
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Kaydedilemedi')
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
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Silinemedi')
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
      await api.post(`/products/${adjust.productId}/stock`, payload)
      setAdjust(emptyAdjust)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Stok güncellenemedi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-slate-100">Stok & Ürün Yönetimi</div>
          <div className="mt-1 text-sm text-slate-400">
            Ürünleri, fiyatları ve stok seviyelerini buradan yönetin.
          </div>
        </div>
        <button onClick={openCreate} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400">
          + Yeni Ürün
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi label="SKU Sayısı" value={formatNumber(kpis.skuCount)} />
        <Kpi label="Toplam Adet" value={formatNumber(kpis.units)} />
        <Kpi label="Envanter Değeri" value={formatCurrency(kpis.invValue)} accent="sky" />
        <Kpi
          label="Kritik Stok"
          value={formatNumber(kpis.lowStock)}
          accent={kpis.lowStock > 0 ? 'rose' : undefined}
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <LabeledField label="Ara (SKU/ad)">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="mouse, SKU-2001..."
              className={inputCls}
            />
          </LabeledField>
          <LabeledField label="Kategori">
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className={inputCls}
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
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm text-slate-400">
          <div>{loading ? 'Yükleniyor…' : `${filtered.length} ürün`}</div>
          {error && <div className="text-rose-300">Hata: {error}</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Fiyat</th>
                <th className="px-4 py-3 text-right">Maliyet</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3 text-right">Eşik</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = p.reorder_level > 0 && p.stock_quantity <= p.reorder_level
                return (
                  <tr key={p.id} className="border-t border-slate-800/60 hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-mono text-slate-200">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-100">{p.name}</td>
                    <td className="px-4 py-3 text-slate-300">{p.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-200">
                      {formatCurrency(p.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {formatCurrency(p.cost_price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={[
                          'rounded-md px-2 py-0.5 text-xs font-semibold',
                          low
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
                        ].join(' ')}
                      >
                        {formatNumber(p.stock_quantity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {formatNumber(p.reorder_level)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() =>
                            setAdjust({
                              ...emptyAdjust,
                              productId: p.id,
                              movement_type: 'in',
                            })
                          }
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Stok+/-
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => deleteProduct(p)}
                          className="rounded-lg border border-rose-700/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
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
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    Ürün bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
        <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">
          Son Stok Hareketleri
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
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
                const p = products.find((x) => x.id === m.product_id)
                const isIn = m.change > 0
                return (
                  <tr key={m.id} className="border-t border-slate-800/60">
                    <td className="px-4 py-2 text-slate-400">{formatDate(m.created_at)}</td>
                    <td className="px-4 py-2 text-slate-200">
                      {p ? `${p.sku} · ${p.name}` : `#${m.product_id}`}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={[
                          'rounded-md px-2 py-0.5 text-xs uppercase',
                          m.movement_type === 'in'
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : m.movement_type === 'out'
                            ? 'bg-rose-500/10 text-rose-300'
                            : 'bg-slate-700/30 text-slate-200',
                        ].join(' ')}
                      >
                        {m.movement_type}
                      </span>
                    </td>
                    <td
                      className={[
                        'px-4 py-2 text-right font-mono',
                        isIn ? 'text-emerald-300' : 'text-rose-300',
                      ].join(' ')}
                    >
                      {isIn ? '+' : ''}
                      {m.change}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-300">{m.balance_after}</td>
                    <td className="px-4 py-2 text-slate-400">{m.reference ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal title={editing ? 'Ürün Düzenle' : 'Yeni Ürün'} onClose={() => setShowForm(false)}>
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="SKU">
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={inputCls}
              />
            </LabeledField>
            <LabeledField label="Kategori">
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputCls}
              />
            </LabeledField>
            <LabeledField label="Ürün Adı" className="col-span-2">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </LabeledField>
            <LabeledField label="Birim Fiyat">
              <input
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                className={inputCls}
              />
            </LabeledField>
            <LabeledField label="Maliyet">
              <input
                type="number"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                className={inputCls}
              />
            </LabeledField>
            {!editing && (
              <LabeledField label="Başlangıç Stoğu">
                <input
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  className={inputCls}
                />
              </LabeledField>
            )}
            <LabeledField label="Kritik Eşik">
              <input
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                className={inputCls}
              />
            </LabeledField>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={() => setShowForm(false)} className={ghostBtn}>
              İptal
            </button>
            <button disabled={busy} onClick={saveProduct} className={primaryBtn}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </Modal>
      )}

      {adjust.productId != null && (
        <Modal
          title={`Stok Hareketi · #${adjust.productId}`}
          onClose={() => setAdjust(emptyAdjust)}
        >
          <div className="grid grid-cols-2 gap-3">
            <LabeledField label="Hareket Tipi">
              <select
                value={adjust.movement_type}
                onChange={(e) =>
                  setAdjust({
                    ...adjust,
                    movement_type: e.target.value as 'in' | 'out' | 'adjust',
                  })
                }
                className={inputCls}
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
                className={inputCls}
              />
            </LabeledField>
            <LabeledField label="Not" className="col-span-2">
              <input
                value={adjust.note}
                onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
                placeholder="Sayım farkı, sevkiyat, vs."
                className={inputCls}
              />
            </LabeledField>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={() => setAdjust(emptyAdjust)} className={ghostBtn}>
              İptal
            </button>
            <button disabled={busy} onClick={submitAdjust} className={primaryBtn}>
              {busy ? 'İşleniyor…' : 'Kaydet'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'sky' | 'rose'
}) {
  const accentCls =
    accent === 'sky'
      ? 'border-sky-500/30 bg-sky-500/10 text-sky-100'
      : accent === 'rose'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
      : 'border-slate-800 bg-slate-900/30 text-slate-100'
  return (
    <div className={['rounded-2xl border p-4', accentCls].join(' ')}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
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
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-slate-900"
          >
            Kapat
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

const inputCls =
  'rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600'

const primaryBtn =
  'rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50'

const ghostBtn =
  'rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900'
