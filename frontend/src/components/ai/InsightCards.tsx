import { GlobalCard } from '../ui/GlobalCard'
import { formatCurrency, formatNumber, type AiHighlight, type AiInsights } from '../../lib/api'

export function InsightBanner({
  loading,
  error,
  insights,
}: {
  loading: boolean
  error: string | null
  insights: AiInsights | null
}) {
  return (
    <div className="rounded-2xl border border-violet-300/40 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-md dark:border-violet-500/25">
      <div className="text-xs font-semibold uppercase tracking-wide text-violet-200">AI headline</div>
      <div className="mt-2 text-xl font-semibold text-white">
        {loading
          ? 'AI işletme verilerinizi analiz ediyor…'
          : error
            ? `Hata: ${error}`
            : (insights?.headline ?? '—')}
      </div>
      {insights && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {insights.context.total_tenants != null ? (
            // Admin: platform-wide chips
            <>
              <Chip label="Platform cirosu" value={formatCurrency(insights.context.summary_last_30.revenue)} />
              <Chip
                label="Aktif şirket"
                value={formatNumber(insights.context.total_tenants)}
              />
              <Chip
                label="Kritik stok"
                value={formatNumber(insights.context.critical_stock_count ?? insights.context.low_stock_products.length)}
                accent={(insights.context.critical_stock_count ?? insights.context.low_stock_products.length) > 0 ? 'critical' : 'positive'}
              />
              <Chip label="Platform kullanıcı" value={formatNumber(insights.context.total_users ?? 0)} />
            </>
          ) : (
            // Regular: per-tenant chips
            <>
              <Chip label="Son 30 gün ciro" value={formatCurrency(insights.context.summary_last_30.revenue)} />
              <Chip
                label="Ciro değişimi"
                value={`${(insights.context.revenue_growth_pct ?? 0) >= 0 ? '+' : ''}${(insights.context.revenue_growth_pct ?? 0).toFixed(2)}%`}
                accent={(insights.context.revenue_growth_pct ?? 0) >= 0 ? 'positive' : 'warning'}
              />
              <Chip
                label="Kritik stok"
                value={formatNumber(insights.context.low_stock_products?.length ?? 0)}
                accent={(insights.context.low_stock_products?.length ?? 0) > 0 ? 'critical' : 'positive'}
              />
              <Chip label="Aktif SKU" value={formatNumber(insights.context.total_skus ?? 0)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function InsightCardSection({
  loading,
  highlights,
}: {
  loading: boolean
  highlights: AiHighlight[]
}) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {loading && <HighlightSkeleton />}
      {loading && <HighlightSkeleton />}
      {loading && <HighlightSkeleton />}
      {!loading && highlights.map((h, i) => <HighlightCard key={i} h={h} />)}
    </section>
  )
}

function HighlightCard({ h }: { h: AiHighlight }) {
  const cfg = severityConfig(h.severity)
  return (
    <GlobalCard className={['border-l-4', cfg.borderLeft].join(' ')}>
      <div className="flex items-center gap-2">
        <span className={['h-2 w-2 shrink-0 rounded-full', cfg.dot].join(' ')} />
        <div className={['text-xs font-semibold uppercase tracking-wide', cfg.label].join(' ')}>{cfg.name}</div>
      </div>
      <div className={['mt-2 text-sm font-semibold', cfg.titleClass].join(' ')}>{h.title}</div>
      <div className={['mt-1 text-sm', cfg.bodyClass].join(' ')}>{h.body}</div>
      {h.metric ? (
        <div className={['mt-3 inline-block rounded-lg border px-2 py-1 text-[11px] font-mono', cfg.metricBox].join(' ')}>
          {h.metric}
        </div>
      ) : null}
    </GlobalCard>
  )
}

function HighlightSkeleton() {
  return (
    <GlobalCard className="animate-pulse">
      <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-2 h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-1 h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
    </GlobalCard>
  )
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: 'positive' | 'warning' | 'critical' }) {
  const cls =
    accent === 'positive'
      ? 'border-white/20 bg-white/10 text-emerald-100'
      : accent === 'warning'
        ? 'border-white/20 bg-white/10 text-amber-100'
        : accent === 'critical'
          ? 'border-white/20 bg-white/10 text-rose-100'
          : 'border-white/15 bg-white/5 text-slate-100'
  return (
    <div className={['rounded-xl border px-3 py-1.5', cls].join(' ')}>
      <span className="text-[10px] uppercase tracking-wide opacity-90">{label}</span>
      <span className="ml-2 text-sm font-semibold">{value}</span>
    </div>
  )
}

function severityConfig(severity: AiHighlight['severity']) {
  switch (severity) {
    case 'positive':
      return {
        name: 'Olumlu', borderLeft: 'border-l-emerald-500', dot: 'bg-emerald-500',
        label: 'text-emerald-700 dark:text-emerald-400',
        titleClass: 'text-slate-900 dark:text-slate-50',
        bodyClass: 'text-slate-700 dark:text-slate-300',
        metricBox: 'border-slate-200 bg-slate-100 text-slate-800 dark:border-white/10 dark:bg-black/20 dark:text-slate-200',
      }
    case 'warning':
      return {
        name: 'Uyarı', borderLeft: 'border-l-amber-500', dot: 'bg-amber-500',
        label: 'text-amber-800 dark:text-amber-300',
        titleClass: 'text-slate-900 dark:text-slate-50',
        bodyClass: 'text-slate-700 dark:text-slate-300',
        metricBox: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/20 dark:bg-amber-950/40 dark:text-amber-100',
      }
    case 'critical':
      return {
        name: 'Kritik', borderLeft: 'border-l-rose-500', dot: 'bg-rose-500',
        label: 'text-rose-800 dark:text-rose-300',
        titleClass: 'text-slate-900 dark:text-slate-50',
        bodyClass: 'text-slate-700 dark:text-slate-300',
        metricBox: 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-500/20 dark:bg-rose-950/40 dark:text-rose-100',
      }
    default:
      return {
        name: 'Bilgi', borderLeft: 'border-l-sky-500', dot: 'bg-sky-500',
        label: 'text-sky-800 dark:text-sky-300',
        titleClass: 'text-slate-900 dark:text-slate-50',
        bodyClass: 'text-slate-700 dark:text-slate-300',
        metricBox: 'border-slate-200 bg-slate-100 text-slate-800 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200',
      }
  }
}
