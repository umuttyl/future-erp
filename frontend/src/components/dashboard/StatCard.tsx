import type { LucideIcon } from 'lucide-react'
import { MoreHorizontal, TrendingDown, TrendingUp } from 'lucide-react'

type StatCardProps = {
  title: string
  value: string
  trendPct: number | null
  /** true = iyileşme (yeşil), false = kötüleşme (kırmızı) */
  trendPositive: boolean
  icon: LucideIcon
}

export function StatCard({ title, value, trendPct, trendPositive, icon: Icon }: StatCardProps) {
  const hasTrend = trendPct != null && Number.isFinite(trendPct)
  const up = trendPositive
  const color = up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  const bg = up ? 'bg-emerald-500/10' : 'bg-rose-500/10'

  return (
    <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-surface-card p-5 shadow-card dark:border-white/10 dark:bg-[#16122b] dark:shadow-card-dark">
      <div className="flex items-start justify-between gap-2">
        <div className={`rounded-full p-2.5 ${bg}`}>
          <Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" strokeWidth={2} />
        </div>
        <button
          type="button"
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          aria-label="Menü"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</div>
      {hasTrend ? (
        <div className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${color}`}>
          {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          <span>
            {up ? '+' : '-'}
            {Math.abs(trendPct!).toFixed(1)}%
          </span>
          <span className="font-normal text-slate-400 dark:text-slate-500">önceki döneme göre</span>
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-400">Karşılaştırma için yeterli veri yok</div>
      )}
    </div>
  )
}
