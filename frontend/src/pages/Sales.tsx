import { useEffect, useMemo, useState } from 'react'

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
      } catch (e: any) {
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
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-slate-100">Satış Kayıtları</div>
          <div className="mt-1 text-sm text-slate-400">
            Filtreleyerek satış tarihçesini inceleyin, detay için satıra tıklayın.
          </div>
        </div>
        <div className="flex gap-3 text-xs text-slate-300">
          <SummaryChip label="Sipariş" value={formatNumber(totals.orders)} />
          <SummaryChip label="Adet" value={formatNumber(totals.quantity)} />
          <SummaryChip label="Ciro" value={formatCurrency(totals.revenue)} highlight />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <LabeledField label="Başlangıç">
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className={inputCls}
            />
          </LabeledField>
          <LabeledField label="Bitiş">
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className={inputCls}
            />
          </LabeledField>
          <LabeledField label="Müşteri">
            <input
              value={filters.customer}
              onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
              placeholder="Acme"
              className={inputCls}
            />
          </LabeledField>
          <LabeledField label="Ara (no / müşteri)">
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="SO-..."
              className={inputCls}
            />
          </LabeledField>
          <LabeledField label="Min tutar">
            <input
              type="number"
              min="0"
              value={filters.min_amount}
              onChange={(e) => setFilters({ ...filters, min_amount: e.target.value })}
              placeholder="0"
              className={inputCls}
            />
          </LabeledField>
          <div className="flex items-end gap-2">
            <button onClick={applyFilters} className={primaryBtn}>
              Uygula
            </button>
            <button onClick={clearFilters} className={ghostBtn}>
              Temizle
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm text-slate-400">
          <div>{loading ? 'Yükleniyor…' : `${records.length} kayıt`}</div>
          {error && <div className="text-rose-300">Hata: {error}</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
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
                  <tr
                    key={r.id}
                    className="border-t border-slate-800/60 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3 text-slate-300">{formatDate(r.sale_date)}</td>
                    <td className="px-4 py-3 font-mono text-slate-200">{r.record_no}</td>
                    <td className="px-4 py-3 text-slate-200">{r.customer_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatNumber(qty)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">
                      {formatCurrency(r.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(r)}
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        Detay
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    Eşleşen satış kaydı bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <DetailModal
          record={selected}
          productMap={productMap}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-sm uppercase tracking-wide text-slate-500">Satış</div>
            <div className="text-lg font-semibold text-slate-100">{record.record_no}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-slate-900"
          >
            Kapat
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 px-5 py-4 text-sm">
          <InfoItem label="Tarih" value={formatDate(record.sale_date)} />
          <InfoItem label="Müşteri" value={record.customer_name ?? '—'} />
          <InfoItem
            label="Toplam"
            value={formatCurrency(record.total_amount)}
            accent
          />
        </div>

        <div className="border-t border-slate-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
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
                  <tr key={it.id} className="border-t border-slate-800/60">
                    <td className="px-4 py-3 text-slate-200">
                      {p ? `${p.sku} · ${p.name}` : `#${it.product_id}`}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {formatNumber(it.quantity)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {formatCurrency(it.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">
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
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
          : 'border-slate-800 bg-slate-900/40 text-slate-200',
      ].join(' ')}
    >
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
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
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
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
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={[
          'mt-0.5 text-sm font-semibold',
          accent ? 'text-sky-300' : 'text-slate-100',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}

const inputCls =
  'rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600'

const primaryBtn =
  'rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400'

const ghostBtn =
  'rounded-lg border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900'
