import { useEffect, useMemo, useState } from 'react'

import { GlobalCard, GlobalCardHeader } from '../components/ui/GlobalCard'
import { PageLayout } from '../components/ui/PageLayout'
import {
  ghostButtonClass,
  inputFieldClass,
  primaryButtonClass,
  secondaryButtonClass,
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
  type Product,
  type SalesRecord,
} from '../lib/api'

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
  const [records, setRecords] = useState<SalesRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [applied, setApplied] = useState<Filters>(emptyFilters)
  const [selected, setSelected] = useState<SalesRecord | null>(null)
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

        const [recRes, prodRes] = await Promise.all([
          api.get<SalesRecord[]>('/sales/records', { params }),
          api.get<Product[]>('/products'),
        ])
        if (!alive) return
        setRecords(recRes.data)
        setProducts(prodRes.data)
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
        <div className="flex flex-wrap gap-2 text-xs">
          <SummaryChip label="Sipariş" value={formatNumber(totals.orders)} />
          <SummaryChip label="Adet" value={formatNumber(totals.quantity)} />
          <SummaryChip label="Ciro" value={formatCurrency(totals.revenue)} highlight />
        </div>
      }
    >
      <GlobalCard>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <LabeledField label="Başlangıç">
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className={inputFieldClass}
            />
          </LabeledField>
          <LabeledField label="Bitiş">
            <input
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

      <GlobalCard>
        <GlobalCardHeader
          title="Kayıtlar"
          description={loading ? 'Yükleniyor…' : `${records.length} kayıt`}
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
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const qty = r.items.reduce((acc, it) => acc + it.quantity, 0)
                return (
                  <tr key={r.id} className={tableRowHoverClass}>
                    <td className={`px-4 py-3 ${tableCellClass}`}>{formatDate(r.sale_date)}</td>
                    <td className={`px-4 py-3 font-mono ${tableCellClass}`}>{r.record_no}</td>
                    <td className={`px-4 py-3 ${tableCellClass}`}>{r.customer_name ?? '—'}</td>
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

      {selected ? (
        <DetailModal record={selected} productMap={productMap} onClose={() => setSelected(null)} />
      ) : null}
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
