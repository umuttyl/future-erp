import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

type StatCardProps = {
  title: string;
  value: string;
  trendPct: number | null;
  /** true = improvement (green), false = decline (red) */
  trendPositive: boolean;
  icon: LucideIcon;
  /** accent color for the icon + left bar */
  accent?: "violet" | "emerald" | "rose" | "amber" | "cyan" | "indigo";
  onNavigate?: () => void;
};

const ACCENT = {
  violet:  {
    bar:        "from-violet-500 to-violet-500/0",
    icon:       "bg-violet-100/80 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    activeBg:   "hover:border-violet-200/80 dark:hover:border-violet-500/20",
    glow:       "dark:hover:shadow-[0_0_0_1px_rgba(139,92,246,0.18),0_4px_28px_rgba(139,92,246,0.10)]",
  },
  emerald: {
    bar:        "from-emerald-500 to-emerald-500/0",
    icon:       "bg-emerald-100/80 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    activeBg:   "hover:border-emerald-200/80 dark:hover:border-emerald-500/20",
    glow:       "dark:hover:shadow-[0_0_0_1px_rgba(52,211,153,0.18),0_4px_28px_rgba(52,211,153,0.10)]",
  },
  rose:    {
    bar:        "from-rose-500 to-rose-500/0",
    icon:       "bg-rose-100/80 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    activeBg:   "hover:border-rose-200/80 dark:hover:border-rose-500/20",
    glow:       "dark:hover:shadow-[0_0_0_1px_rgba(244,63,94,0.18),0_4px_28px_rgba(244,63,94,0.10)]",
  },
  amber:   {
    bar:        "from-amber-500 to-amber-500/0",
    icon:       "bg-amber-100/80 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    activeBg:   "hover:border-amber-200/80 dark:hover:border-amber-500/20",
    glow:       "dark:hover:shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_4px_28px_rgba(251,191,36,0.10)]",
  },
  cyan:    {
    bar:        "from-cyan-500 to-cyan-500/0",
    icon:       "bg-cyan-100/80 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
    activeBg:   "hover:border-cyan-200/80 dark:hover:border-cyan-500/20",
    glow:       "dark:hover:shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_4px_28px_rgba(34,211,238,0.10)]",
  },
  indigo:  {
    bar:        "from-indigo-500 to-indigo-500/0",
    icon:       "bg-indigo-100/80 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    activeBg:   "hover:border-indigo-200/80 dark:hover:border-indigo-500/20",
    glow:       "dark:hover:shadow-[0_0_0_1px_rgba(129,140,248,0.18),0_4px_28px_rgba(129,140,248,0.10)]",
  },
} as const;

export function StatCard({
  title,
  value,
  trendPct,
  trendPositive,
  icon: Icon,
  accent = "violet",
  onNavigate,
}: StatCardProps) {
  const { t } = useTranslation();
  const hasTrend = trendPct != null && Number.isFinite(trendPct);
  const up = trendPositive;
  const trendColor = up
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-500 dark:text-rose-400";
  const a = ACCENT[accent];
  const interactive = Boolean(onNavigate);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border bg-ui-surface p-5 shadow-card",
        "border-ui-border-sub dark:border-white/[0.06]",
        interactive
          ? `cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover ${a.activeBg} ${a.glow} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/40`
          : "transition-shadow duration-300",
      ].join(" ")}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${title} — go to module` : undefined}
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
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl bg-gradient-to-b ${a.bar}`} />

      <div className="flex items-start justify-between gap-2">
        <div className={`rounded-xl p-2.5 ${a.icon}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </div>
      </div>

      <div className="mt-4 text-[13px] font-medium text-ui-muted">
        {title}
      </div>
      <div className="mt-1 animate-count-in text-2xl font-bold tracking-tight text-ui-text">
        {value}
      </div>

      {hasTrend ? (
        <div className={`mt-3 flex items-center gap-1.5 text-[13px] font-semibold ${trendColor}`}>
          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span>
            {up ? "+" : "-"}{Math.abs(trendPct!).toFixed(1)}%
          </span>
          <span className="font-normal text-ui-muted">
            {t("dashboard.vsPrevPeriod")}
          </span>
        </div>
      ) : (
        <div className="mt-3 text-xs text-ui-muted">
          {t("dashboard.notEnoughData")}
        </div>
      )}
    </div>
  );
}
