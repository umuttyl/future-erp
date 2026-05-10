import type { LucideIcon } from "lucide-react";
import { MoreHorizontal, TrendingDown, TrendingUp } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string;
  trendPct: number | null;
  /** true = iyileşme (yeşil), false = kötüleşme (kırmızı) */
  trendPositive: boolean;
  icon: LucideIcon;
  /** Tıklanınca ilgili modüle git (hover + gölge) */
  onNavigate?: () => void;
};

export function StatCard({
  title,
  value,
  trendPct,
  trendPositive,
  icon: Icon,
  onNavigate,
}: StatCardProps) {
  const hasTrend = trendPct != null && Number.isFinite(trendPct);
  const up = trendPositive;
  const color = up
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const bg = up ? "bg-emerald-500/10" : "bg-rose-500/10";

  const interactive = Boolean(onNavigate);
  const surfaceClass = [
    "relative overflow-hidden rounded-2xl border border-surface-border bg-surface-card p-5 shadow-card dark:border-white/10 dark:bg-[#16122b] dark:shadow-card-dark",
    interactive
      ? "cursor-pointer transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
      : "",
  ].join(" ");

  return (
    <div
      className={surfaceClass}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${title} — modüle git` : undefined}
      onClick={interactive ? onNavigate : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onNavigate?.();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`rounded-full p-2.5 ${bg}`}>
          <Icon
            className="h-5 w-5 text-violet-600 dark:text-violet-400"
            strokeWidth={2}
          />
        </div>
        <span
          role="presentation"
          className="rounded-lg p-1 text-slate-400"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {value}
      </div>
      {hasTrend ? (
        <div
          className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${color}`}
        >
          {up ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span>
            {up ? "+" : "-"}
            {Math.abs(trendPct!).toFixed(1)}%
          </span>
          <span className="font-normal text-slate-400 dark:text-slate-500">
            önceki döneme göre
          </span>
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-400">
          Karşılaştırma için yeterli veri yok
        </div>
      )}
    </div>
  );
}
