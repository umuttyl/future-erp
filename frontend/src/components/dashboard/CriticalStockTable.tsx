import { Filter } from 'lucide-react'

import { formatCurrency, formatNumber, type Product } from '../../lib/api'

function stockStatus(p: Product): { label: string; className: string } {
  if (p.stock_quantity <= 0) {
    return { label: 'Tükendi', className: 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300' }
  }
  if (p.stock_quantity <= p.reorder_level) {
    return { label: 'Kritik', className: 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200' }
  }
  return { label: 'Stokta', className: 'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200' }
}

type CriticalStockTableProps = {
  products: Product[]
  loading: boolean
  error: string | null
}

export function CriticalStockTable({ products, loading, error }: CriticalStockTableProps) {
  const rows = [...products]
    .sort((a, b) => a.stock_quantity - b.stock_quantity || a.reorder_level - b.reorder_level)
    .slice(0, 8)

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card shadow-card dark:border-white/10 dark:bg-[#16122b] dark:shadow-card-dark">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Kritik stoklar</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Eşik altı ve tükenen ürünler</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
        >
          <Filter className="h-3.5 w-3.5" />
          Filtreler
        </button>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Yükleniyor…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-500">{error}</div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th className="px-5 py-3 font-semibold">Ürün</th>
                <th className="px-5 py-3 font-semibold">Durum</th>
                <th className="px-5 py-3 font-semibold text-right">Birim fiyat</th>
                <th className="px-5 py-3 font-semibold text-right">Stok</th>
                <th className="px-5 py-3 font-semibold text-right">Eşik</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = stockStatus(p)
                return (
                  <tr
                    key={p.id}
                    className="border-b border-surface-border/80 transition hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-bold text-slate-700 dark:from-slate-700 dark:to-slate-600 dark:text-slate-100">
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900 dark:text-slate-100">{p.name}</div>
                          <div className="truncate font-mono text-xs text-slate-500">SKU: {p.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-800 dark:text-slate-200">
                      {formatCurrency(p.unit_price)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatNumber(p.stock_quantity)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-500">{formatNumber(p.reorder_level)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
