import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, User, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import { SkeletonTable } from '../components/ui/Skeleton'
import {
  ghostButtonClass,
  inputFieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeaderClass,
  tableRowHoverClass,
} from '../components/ui/forms'
import { useAuth } from '../context/AuthContext'
import {
  api,
  formatCurrency,
  formatDate,
  formatNumber,
  getApiErrorMessage,
  type Customer,
  type Product,
  type SalesRecord,
} from '../lib/api'

type LineItem = { product_id: number; quantity: number; unit_price: number }

function genRecordNo(): string {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `SO-${ymd}-${ms}`
}

function CreateSaleModal({
  products,
  customers,
  onClose,
  onSaved,
}: {
  products: Product[]
  customers: Customer[]
  onClose: () => void
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  // customer_id = CRM'den seçim; '' = seçilmedi (elle giriş modu)
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [saleDate, setSaleDate] = useState(today)
  const [lines, setLines] = useState<LineItem[]>([{ product_id: products[0]?.id ?? 0, quantity: 1, unit_price: Number(products[0]?.unit_price ?? 0) }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function handleCustomerSelect(val: string) {
    setCustomerId(val)
    if (val === '') {
      setCustomerName('')
    } else {
      const found = customers.find((c) => String(c.id) === val)
      setCustomerName(found?.name ?? '')
    }
  }

  function addLine() {
    const p = products[0]
    setLines((prev) => [...prev, { product_id: p?.id ?? 0, quantity: 1, unit_price: Number(p?.unit_price ?? 0) }])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateLine(idx: number, field: keyof LineItem, raw: string) {
    setLines((prev) => {
      const next = [...prev]
      if (field === 'product_id') {
        const pid = Number(raw)
        const p = products.find((x) => x.id === pid)
        next[idx] = { ...next[idx], product_id: pid, unit_price: Number(p?.unit_price ?? 0) }
      } else if (field === 'quantity') {
        next[idx] = { ...next[idx], quantity: Math.max(1, Number(raw) || 1) }
      } else {
        next[idx] = { ...next[idx], unit_price: Math.max(0, Number(raw) || 0) }
      }
      return next
    })
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lines.length === 0) { setErr('En az bir ürün satırı ekleyin.'); return }
    if (lines.some((l) => l.product_id === 0)) { setErr('Tüm satırlar için ürün seçin.'); return }
    setErr(null)
    setBusy(true)
    try {
      await api.post('/sales/records', {
        record_no: genRecordNo(),
        sale_date: saleDate,
        customer_id: customerId ? Number(customerId) : null,
        customer_name: customerName.trim() || null,
        items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
      })
      onSaved()
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Kayıt oluşturulamadı.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1a1628]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Kapat">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Yeni satış kaydı</h2>
        </div>
        <form className="flex flex-col gap-4 px-6 py-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cs-customer" className="text-xs font-medium text-slate-600 dark:text-slate-400">Müşteri</label>
              {customers.length > 0 ? (
                <>
                  <select
                    id="cs-customer"
                    className={inputFieldClass + ' mt-1'}
                    value={customerId}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                  >
                    <option value="">— Manuel giriş —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                  {customerId === '' && (
                    <input
                      type="text"
                      className={inputFieldClass + ' mt-1'}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Müşteri adı (opsiyonel)"
                    />
                  )}
                </>
              ) : (
                <input
                  id="cs-customer"
                  type="text"
                  className={inputFieldClass + ' mt-1'}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Müşteri adı (opsiyonel)"
                />
              )}
            </div>
            <div>
              <label htmlFor="cs-date" className="text-xs font-medium text-slate-600 dark:text-slate-400">Tarih</label>
              <input id="cs-date" type="date" required className={inputFieldClass + ' mt-1'} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Ürün satırları</span>
              <button type="button" onClick={addLine} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10">
                <Plus className="h-3.5 w-3.5" /> Satır ekle
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] items-center gap-2">
                  <select
                    aria-label={`Satır ${idx + 1} ürün seç`}
                    value={line.product_id}
                    onChange={(e) => updateLine(idx, 'product_id', e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number" min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm focus:border-violet-500 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                    placeholder="Adet"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={line.unit_price}
                    onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm focus:border-violet-500 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                    placeholder="Fiyat"
                  />
                  <button type="button" aria-label="Satırı sil" onClick={() => removeLine(idx)} disabled={lines.length === 1} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-white/5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Toplam</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(total)}</span>
          </div>

          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">İptal</button>
            <button type="submit" disabled={busy} className={primaryButtonClass + ' px-4 py-2 text-sm'}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type Filters = {
  start_date: string
  end_date: string
  customer: string
  search: string
  min_amount: string
}

const emptyFilters: Filters = {
  start_date: '',
  end_date: '',
  customer: '',
  search: '',
  min_amount: '',
}

export function SalesPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('sales.write')

  const [records, setRecords] = useState<SalesRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [applied, setApplied] = useState<Filters>(emptyFilters)
  const [selected, setSelected] = useState<SalesRecord | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const params: Record<string, string | number> = {}
        if (applied.start_date) params.start_date = applied.start_date
        if (applied.end_date) params.end_date = applied.end_date
        if (applied.customer) params.customer = applied.customer
        if (applied.search) params.search = applied.search
        if (applied.min_amount) params.min_amount = Number(applied.min_amount)

        const [recRes, prodRes, custRes] = await Promise.all([
          api.get<SalesRecord[]>('/sales/records', { params }),
          api.get<Product[]>('/products'),
          api.get<Customer[]>('/customers'),
        ])
        if (!alive) return
        setRecords(recRes.data)
        setProducts(prodRes.data)
        setCustomers(custRes.data)
      } catch (e: unknown) {
        if (!alive) return
        setError(getApiErrorMessage(e, 'Yükleme başarısız'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [applied])

  const productMap = useMemo(() => {
    const m = new Map<number, Product>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  const totals = useMemo(() => {
    let revenue = 0
    let quantity = 0
    for (const r of records) {
      revenue += Number(r.total_amount || 0)
      for (const it of r.items) quantity += it.quantity
    }
    return { revenue, quantity, orders: records.length }
  }, [records])

  function applyFilters() {
    setApplied({ ...filters })
  }

  function clearFilters() {
    setFilters(emptyFilters)
    setApplied(emptyFilters)
  }

  return (
    <PageLayout
      title="Satış Kayıtları"
      subtitle="Filtreleyerek satış tarihçesini inceleyin; detay için satıra tıklayın."
      actions={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SummaryChip label="Sipariş" value={formatNumber(totals.orders)} />
          <SummaryChip label="Adet" value={formatNumber(totals.quantity)} />
          <SummaryChip label="Ciro" value={formatCurrency(totals.revenue)} highlight />
          {canWrite && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Yeni Satış
            </button>
          )}
        </div>
      }
    >
      <GlobalCard>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <LabeledField label="Başlangıç">
            <input
              aria-label="Başlangıç tarihi"
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className={inputFieldClass}
            />
          </LabeledField>
          <LabeledField label="Bitiş">
            <input
              aria-label="Bitiş tarihi"
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className={inputFieldClass}
            />
          </LabeledField>
          <LabeledField label="Müşteri">
            <input
              value={filters.customer}
              onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
              placeholder="Acme"
              className={inputFieldClass}
            />
          </LabeledField>
          <LabeledField label="Ara (no / müşteri)">
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="SO-..."
              className={inputFieldClass}
            />
          </LabeledField>
          <LabeledField label="Min tutar">
            <input
              type="number"
              min="0"
              value={filters.min_amount}
              onChange={(e) => setFilters({ ...filters, min_amount: e.target.value })}
              placeholder="0"
              className={inputFieldClass}
            />
          </LabeledField>
          <div className="flex items-end gap-2">
            <button type="button" onClick={applyFilters} className={primaryButtonClass}>
              Uygula
            </button>
            <button type="button" onClick={clearFilters} className={secondaryButtonClass}>
              Temizle
            </button>
          </div>
        </div>
      </GlobalCard>

      {loading && records.length === 0 ? (
        <SkeletonTable rows={6} cols={6} />
      ) : (
      <GlobalCard>
        <GlobalCardHeader
          title="Kayıtlar"
          description={`${records.length} kayıt`}
          right={error ? <span className="text-sm text-rose-600 dark:text-rose-300">Hata: {error}</span> : null}
        />
        <div className="-mx-5 overflow-x-auto border-t border-slate-100 dark:border-white/5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Belge No</th>
                <th className="px-4 py-3">Müşteri</th>
                <th className="px-4 py-3 text-right">Adet</th>
                <th className="px-4 py-3 text-right">Tutar</th>
                <th className="px-4 py-3 sr-only">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const qty = r.items.reduce((acc, it) => acc + it.quantity, 0)
                return (
                  <tr key={r.id} className={tableRowHoverClass}>
                    <td className={`px-4 py-3 ${tableCellClass}`}>{formatDate(r.sale_date)}</td>
                    <td className={`px-4 py-3 font-mono ${tableCellClass}`}>{r.record_no}</td>
                    <td className={`px-4 py-3 ${tableCellClass}`}>
                      {r.customer_id ? (
                        <Link
                          to="/customers"
                          className="inline-flex items-center gap-1 text-violet-700 hover:underline dark:text-violet-400"
                        >
                          <User className="h-3 w-3" />
                          {r.customer_name ?? '—'}
                        </Link>
                      ) : (
                        r.customer_name ?? '—'
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right ${tableCellClass}`}>{formatNumber(qty)}</td>
                    <td className={`px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100`}>
                      {formatCurrency(r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className={ghostButtonClass + ' text-xs'}
                      >
                        Detay
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Eşleşen satış kaydı bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlobalCard>
      )}

      {selected ? (
        <DetailModal record={selected} productMap={productMap} onClose={() => setSelected(null)} />
      ) : null}

      {createOpen && products.length > 0 && (
        <CreateSaleModal
          products={products}
          customers={customers}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); setApplied({ ...applied }) }}
        />
      )}
    </PageLayout>
  )
}

function DetailModal({
  record,
  productMap,
  onClose,
}: {
  record: SalesRecord
  productMap: Map<number, Product>
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-slate-950/70"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#16122b]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Satış
            </div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{record.record_no}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Kapat
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 px-5 py-4 text-sm">
          <InfoItem label="Tarih" value={formatDate(record.sale_date)} />
          <InfoItem label="Müşteri" value={record.customer_name ?? '—'} />
          <InfoItem label="Toplam" value={formatCurrency(record.total_amount)} accent />
        </div>

        <div className="border-t border-slate-200 dark:border-white/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3 text-right">Adet</th>
                <th className="px-4 py-3 text-right">Birim</th>
                <th className="px-4 py-3 text-right">Satır Toplam</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((it) => {
                const p = productMap.get(it.product_id)
                return (
                  <tr key={it.id} className={tableRowHoverClass}>
                    <td className={`px-4 py-3 ${tableCellClass}`}>
                      {p ? `${p.sku} · ${p.name}` : `#${it.product_id}`}
                    </td>
                    <td className={`px-4 py-3 text-right ${tableCellClass}`}>{formatNumber(it.quantity)}</td>
                    <td className={`px-4 py-3 text-right ${tableCellClass}`}>{formatCurrency(it.unit_price)}</td>
                    <td className={`px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100`}>
                      {formatCurrency(it.line_total)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryChip({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={[
        'rounded-xl border px-3 py-2',
        highlight
          ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-500/30 dark:bg-violet-950/40 dark:text-violet-100'
          : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-white/10 dark:bg-[#16122b] dark:text-slate-200',
      ].join(' ')}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
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
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  )
}

function InfoItem({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={[
          'mt-0.5 text-sm font-semibold',
          accent ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-slate-100',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}
