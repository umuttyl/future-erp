import { useState } from 'react'

import { formatCurrency, formatNumber, type Product } from '../../lib/api'

type StatusFilter = 'all' | 'critical' | 'out'

function stockStatus(p: Product): { label: string; className: string; filter: StatusFilter } {
  if (p.stock_quantity <= 0) {
    return { label: 'Out of stock', className: 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300', filter: 'out' }
  }
  if (p.stock_quantity <= p.reorder_level) {
    return { label: 'Critical', className: 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200', filter: 'critical' }
  }
  return { label: 'In stock', className: 'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200', filter: 'all' }
}

type CriticalStockTableProps = {
  products: Product[]
  loading: boolean
  error: string | null
}

export function CriticalStockTable({ products, loading, error }: CriticalStockTableProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')

  const sorted = [...products].sort((a, b) => a.stock_quantity - b.stock_quantity || a.reorder_level - b.reorder_level)
  const rows = (filter === 'all' ? sorted : sorted.filter(p => {
    if (filter === 'out') return p.stock_quantity <= 0
    if (filter === 'critical') return p.stock_quantity > 0 && p.stock_quantity <= p.reorder_level
    return true
  })).slice(0, 8)

  const filterBtnClass = (f: StatusFilter) =>
    `px-2.5 py-1 rounded-lg text-xs font-medium transition ${filter === f
      ? 'bg-violet-600 text-white'
      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'}`

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card shadow-card dark:border-white/10 dark:bg-[#16122b] dark:shadow-card-dark">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Stock Overview</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Filter by status — critical items shown first</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-surface-border bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
          <button type="button" className={filterBtnClass('all')} onClick={() => setFilter('all')}>All</button>
          <button type="button" className={filterBtnClass('critical')} onClick={() => setFilter('critical')}>Critical</button>
          <button type="button" className={filterBtnClass('out')} onClick={() => setFilter('out')}>Out of stock</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-500">{error}</div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Unit price</th>
                <th className="px-5 py-3 font-semibold text-right">Stock</th>
                <th className="px-5 py-3 font-semibold text-right">Threshold</th>
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
