import {
  BarChart3,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  ListTodo,
  Package,
  Rocket,
  Settings,
  Shield,
  ShoppingCart,
  Sliders,
  Truck,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { CriticalStockTable } from "../components/dashboard/CriticalStockTable";
import { MorningBriefing } from "../components/dashboard/MorningBriefing";
import {
  SalesForecastLineChart,
  type LinePoint,
} from "../components/dashboard/SalesForecastLineChart";
import { StatCard } from "../components/dashboard/StatCard";
import { PageLayout } from "../components/ui/PageLayout";
import { SkeletonKpiGrid } from "../components/ui/Skeleton";
import { secondaryButtonClass } from "../components/ui/forms";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  useActiveModules,
  useAdminPlatformStats,
  useCashflowForecast,
  useDailySales,
  useFinanceSummary,
  useForecastResults,
  useProducts,
  useSalesRecordsCount,
} from "../hooks/useDashboardQueries";
import { clearDemoData, fetchTeamTasks, formatCurrency, getApiErrorMessage, updateTeamTask, type CashflowForecast, type TeamTask } from "../lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iso(d: string) {
  return new Date(d).toISOString().slice(0, 10);
}
function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function sumDailyRevenue(pts: { revenue: number | string }[]) {
  return pts.reduce((s, p) => s + (typeof p.revenue === "number" ? p.revenue : Number(p.revenue)), 0);
}
function trendPct(cur: number, prev: number): { pct: number | null; positive: boolean } {
  if (prev <= 0 && cur <= 0) return { pct: null, positive: true };
  if (prev <= 0) return { pct: null, positive: true };
  const pct = ((cur - prev) / prev) * 100;
  return { pct, positive: cur >= prev };
}
function fmtTry(n: number) {
  // Tenant para birimini kullanır (api.ts aktif locale)
  return formatCurrency(n, { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Date ranges (computed once per render cycle, stable across re-renders)
// ---------------------------------------------------------------------------

function useDateRanges() {
  return useMemo(() => {
    const today = new Date();
    return {
      endCur:   toYmd(today),
      startCur: toYmd(new Date(today.getTime() - 29 * 86400000)),
      endPrev:  toYmd(new Date(today.getTime() - 30 * 86400000)),
      startPrev:toYmd(new Date(today.getTime() - 59 * 86400000)),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable for the lifetime of the component
}

// ---------------------------------------------------------------------------
// 3-7 AI Cashflow kart
// ---------------------------------------------------------------------------

const CF_STATUS_STYLE = {
  danger:  { wrap: "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-950/30",  label: "text-rose-800 dark:text-rose-200",  badge: "bg-rose-600 text-white",  bar: "bg-rose-500" },
  warning: { wrap: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/30", label: "text-amber-800 dark:text-amber-200", badge: "bg-amber-500 text-white", bar: "bg-amber-400" },
  ok:      { wrap: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/30", label: "text-emerald-800 dark:text-emerald-200", badge: "bg-emerald-600 text-white", bar: "bg-emerald-400" },
}

function CashflowCard({ data }: { data: CashflowForecast }) {
  const { t } = useTranslation()
  const s = CF_STATUS_STYLE[data.status]
  const fmtTryCf = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 })

  // Mini bar chart: 14 days, height proportional to balance (clamp 0..max)
  const maxBal = Math.max(...data.projection.map((p) => Math.abs(p.balance)), 1)
  const BAR_COLORS = { ok: "bg-emerald-400", warning: "bg-amber-400", danger: "bg-rose-500" }

  return (
    <div className={`rounded-2xl border p-4 ${s.wrap}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Wallet className={`h-4 w-4 ${s.label}`} />
          <span className={`text-sm font-semibold ${s.label}`}>{t("cashflow.title")}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.badge}`}>
          {data.status === "danger" ? t("cashflow.critical") : data.status === "warning" ? t("cashflow.warning") : t("cashflow.healthy")}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t("cashflow.currentBalance")}</div>
          <div className={`text-sm font-bold ${s.label}`}>{fmtTryCf(data.current_balance)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t("cashflow.dailyIncomeAvg")}</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{fmtTryCf(data.daily_income_avg)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t("cashflow.netDaily")}</div>
          <div className={`text-sm font-semibold ${data.net_daily >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {data.net_daily >= 0 ? "+" : ""}{fmtTryCf(data.net_daily)}
          </div>
        </div>
      </div>

      {/* Mini bar chart — 10 discrete heights to avoid inline styles */}
      <div className="flex items-end gap-px h-10 mb-3">
        {data.projection.map((p) => {
          const BAR_H = ["h-1","h-1","h-2","h-3","h-4","h-5","h-6","h-7","h-8","h-9","h-10"] as const
          const idx = Math.min(10, Math.max(1, Math.round((Math.abs(p.balance) / maxBal) * 10)))
          return (
            <div key={p.date} className="flex-1 flex flex-col justify-end" title={`${p.date}: ${fmtTryCf(p.balance)}`}>
              <div className={`rounded-sm ${BAR_COLORS[p.status]} ${BAR_H[idx]}`} />
            </div>
          )
        })}
      </div>

      {/* Alert message */}
      {data.alert_message ? (
        <p className={`text-xs mb-3 ${s.label}`}>{data.alert_message}</p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          {t("cashflow.balancedNote")}
        </p>
      )}

      {!data.has_cashbook_data && (
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
          {t("cashflow.noExpenseNote")}
        </p>
      )}

      <Link
        to="/finance?tab=cashflow"
        className={`self-start inline-block rounded-lg px-3 py-1.5 text-xs font-semibold ${
          data.status === "danger" ? "bg-rose-600 hover:bg-rose-700 text-white" :
          data.status === "warning" ? "bg-amber-500 hover:bg-amber-600 text-white" :
          "bg-emerald-600 hover:bg-emerald-700 text-white"
        }`}
      >
        {t("cashflow.cashDetail")}
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI action cards (manager dashboard)
// ---------------------------------------------------------------------------

type ActionCardItem = {
  severity: "critical" | "warning" | "info"
  title: string
  body: string
  to: string
  cta: string
}

const ACTION_SEVERITY_STYLE: Record<ActionCardItem["severity"], { wrap: string; title: string; btn: string }> = {
  critical: {
    wrap: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-500/30",
    title: "text-rose-800 dark:text-rose-200",
    btn: "bg-rose-600 hover:bg-rose-700 text-white",
  },
  warning: {
    wrap: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-500/30",
    title: "text-amber-800 dark:text-amber-200",
    btn: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  info: {
    wrap: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-500/30",
    title: "text-blue-800 dark:text-blue-200",
    btn: "bg-blue-600 hover:bg-blue-700 text-white",
  },
}

function ActionCard({ severity, title, body, to, cta }: ActionCardItem) {
  const s = ACTION_SEVERITY_STYLE[severity]
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 ${s.wrap}`}>
      <div className={`text-sm font-semibold ${s.title}`}>{title}</div>
      <p className="text-xs text-slate-600 dark:text-slate-400">{body}</p>
      <Link to={to} className={`self-start rounded-lg px-3 py-1.5 text-xs font-semibold ${s.btn}`}>
        {cta}
      </Link>
    </div>
  )
}

function AiActionCards({
  criticalNow, revTrend, ordersCur, aiScore,
  canCatalog, canFinance, canSales, canForecast,
}: {
  criticalNow: number
  revTrend: { pct: number | null; positive: boolean }
  ordersCur: number
  aiScore: { score: number | null }
  canCatalog: boolean
  canFinance: boolean
  canSales: boolean
  canForecast: boolean
}) {
  const cards: ActionCardItem[] = []

  if (canCatalog && criticalNow > 0) {
    cards.push({
      severity: criticalNow >= 5 ? "critical" : "warning",
      title: `${criticalNow} product${criticalNow > 1 ? 's' : ''} below critical stock`,
      body: "Items below their reorder threshold need replenishment.",
      to: "/stock",
      cta: "View Stock",
    })
  }

  if (canFinance && revTrend.pct !== null && revTrend.pct < -10) {
    cards.push({
      severity: "warning",
      title: `Revenue down ${Math.abs(revTrend.pct).toFixed(0)}%`,
      body: "A significant revenue decline was detected compared to the previous 30 days.",
      to: "/finance",
      cta: "Go to Finance",
    })
  }

  if (canSales && ordersCur === 0) {
    cards.push({
      severity: "info",
      title: "No sales in the last 30 days",
      body: "No sales records have been created yet. Enter your first order or inform your team.",
      to: "/sales",
      cta: "Go to Sales",
    })
  }

  if (canForecast && aiScore.score !== null && aiScore.score < 70) {
    cards.push({
      severity: "info",
      title: `AI forecast accuracy low (${aiScore.score}%)`,
      body: "Sales forecasts don't match actuals. Consider updating the forecast model or improving data quality.",
      to: "/ai",
      cta: "Go to AI Panel",
    })
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/30 dark:bg-emerald-950/30">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
          System healthy — no critical actions require attention right now.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">AI Action Recommendations</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c, i) => (
          <ActionCard key={i} {...c} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Admin quick-action cards
// ---------------------------------------------------------------------------

// ADM-9: Platform admin için anlamlı quick links — şirket ERP linkleri kaldırıldı
const ADMIN_QUICK_LINKS = [
  { to: "/admin#companies",  label: "Companies & Users", desc: "Manage all companies and users",       icon: Users,        color: "violet" },
  { to: "/admin#audit",      label: "Audit Log",         desc: "System-wide transaction records",      icon: ClipboardList,color: "indigo"  },
  { to: "/ai",               label: "AI Command",        desc: "Cross-company anomaly and AI analysis",icon: Brain,        color: "amber"  },
  { to: "/settings",         label: "Platform Settings", desc: "Account and notification preferences", icon: Sliders,      color: "emerald" },
];

const colorMap: Record<string, string> = {
  violet:  "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-500/30 dark:text-violet-300",
  indigo:  "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-500/30 dark:text-indigo-300",
  amber:   "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-500/30 dark:text-amber-300",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-500/30 dark:text-emerald-300",
};

// ---------------------------------------------------------------------------
// Module icon map
// ---------------------------------------------------------------------------

const MODULE_ICON: Record<string, typeof ShoppingCart> = {
  sales:      ShoppingCart,
  inventory:  Package,
  finance:    Wallet,
  crm:        Building2,
  suppliers:  Truck,
  purchasing: ClipboardList,
  hr:         UserCheck,
  ai:         Brain,
};
// Modül etiketleri i18n nav anahtarlarına eşlenir (dil değişince güncellenir)
const MODULE_LABEL_KEY: Record<string, string> = {
  sales:      "nav.sales",
  inventory:  "nav.stock",
  finance:    "nav.finance",
  crm:        "nav.customers",
  suppliers:  "nav.suppliers",
  purchasing: "nav.orders",
  hr:         "nav.hr",
  ai:         "nav.ai",
};
const MODULE_TO: Record<string, string> = {
  sales:      "/sales",
  inventory:  "/stock",
  finance:    "/finance",
  crm:        "/customers",
  suppliers:  "/suppliers",
  purchasing: "/orders",
  hr:         "/hr",
  ai:         "/ai",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5-13 — Sektöre özel başlangıç rehberi
// ---------------------------------------------------------------------------

const GUIDE_DISMISSED_KEY = "erp_guide_dismissed_v1";

type GuideStep = { label: string; desc: string; to: string; icon: typeof ShoppingCart };
type SectorGuide = { title: string; emoji: string; steps: GuideStep[] };

const SECTOR_GUIDE: Record<string, SectorGuide> = {
  retail: {
    title: "Retail Getting Started Guide",
    emoji: "🛒",
    steps: [
      { label: "Add Products",    desc: "Build your product catalogue",       to: "/stock",     icon: Package      },
      { label: "Add Customers",   desc: "Register your first customer",       to: "/customers", icon: Users        },
      { label: "Make a Sale",     desc: "Enter your first sales record",      to: "/sales",     icon: ShoppingCart },
      { label: "Check Cash",      desc: "View your daily cash balance",       to: "/finance",   icon: Wallet       },
    ],
  },
  restaurant: {
    title: "Restaurant Getting Started Guide",
    emoji: "☕",
    steps: [
      { label: "Add Menu Items",  desc: "Define your product / menu items",   to: "/stock",     icon: Package      },
      { label: "Add Suppliers",   desc: "Register ingredient suppliers",      to: "/suppliers", icon: Truck        },
      { label: "Daily Sales",     desc: "Record your first daily sales",      to: "/sales",     icon: ShoppingCart },
      { label: "Finance",         desc: "See your income / expense balance",  to: "/finance",   icon: Wallet       },
    ],
  },
  service: {
    title: "Service Industry Getting Started Guide",
    emoji: "💼",
    steps: [
      { label: "Add Customers",   desc: "Enter your first customer",          to: "/customers", icon: Users        },
      { label: "Set Up Team",     desc: "Define employees and roles",         to: "/hr",        icon: UserCheck    },
      { label: "Log Service",     desc: "Record your first service sale",     to: "/sales",     icon: ShoppingCart },
      { label: "Finance Summary", desc: "Track monthly income / expenses",    to: "/finance",   icon: Wallet       },
    ],
  },
  production: {
    title: "Manufacturing Getting Started Guide",
    emoji: "🏭",
    steps: [
      { label: "Product Catalogue",desc: "Define your manufactured products", to: "/stock",     icon: Package      },
      { label: "Add Suppliers",   desc: "Register raw material suppliers",    to: "/suppliers", icon: Truck        },
      { label: "Create Order",    desc: "Create your first supply order",     to: "/orders",    icon: ClipboardList},
      { label: "Stock Tracking",  desc: "Monitor raw material and stock",     to: "/stock",     icon: Package      },
    ],
  },
  construction: {
    title: "Construction Getting Started Guide",
    emoji: "🏗️",
    steps: [
      { label: "Clients / Projects",desc: "Register project clients",         to: "/customers", icon: Users        },
      { label: "Add Suppliers",   desc: "Define material suppliers",          to: "/suppliers", icon: Truck        },
      { label: "Purchasing",      desc: "Create your first material order",   to: "/orders",    icon: ClipboardList},
      { label: "Finance",         desc: "View project income / expenses",     to: "/finance",   icon: Wallet       },
    ],
  },
  other: {
    title: "Getting Started Guide",
    emoji: "🚀",
    steps: [
      { label: "Add Products",    desc: "Build your catalogue",               to: "/stock",     icon: Package      },
      { label: "Add Customers",   desc: "Register your first customer",       to: "/customers", icon: Users        },
      { label: "Make a Sale",     desc: "Enter your first sales record",      to: "/sales",     icon: ShoppingCart },
      { label: "View Finance",    desc: "Review the summary report",          to: "/finance",   icon: Wallet       },
    ],
  },
};

function GettingStartedCard({ sector }: { sector: string | null }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(GUIDE_DISMISSED_KEY) === "1"; } catch { return false; }
  });

  if (dismissed || !sector) return null;

  const guide = SECTOR_GUIDE[sector] ?? {
    title: "Getting Started Guide",
    emoji: "🚀",
    steps: SECTOR_GUIDE.other.steps,
  };

  function dismiss() {
    try { localStorage.setItem(GUIDE_DISMISSED_KEY, "1"); } catch { /* */ }
    setDismissed(true);
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/50">
            <Rocket className="h-4 w-4 text-emerald-700 dark:text-emerald-300" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              {guide.emoji} {guide.title}
            </h3>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Complete these 4 steps to get started
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          title="Dismiss guide"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {guide.steps.map((step, i) => (
          <Link
            key={step.label}
            to={step.to}
            className="group flex flex-col gap-2.5 rounded-xl border border-emerald-200 bg-white p-3 transition hover:border-emerald-400 hover:shadow-sm dark:border-emerald-500/20 dark:bg-slate-900 dark:hover:border-emerald-400/50"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white dark:bg-emerald-500">
                {i + 1}
              </div>
              <step.icon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-800 group-hover:text-emerald-800 dark:text-slate-100 dark:group-hover:text-emerald-200">
                {step.label}
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                {step.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DemoBanner() {
  const [visible, setVisible] = useState(() => localStorage.getItem('erp_has_demo_data') === '1');
  const [clearing, setClearing] = useState(false);

  if (!visible) return null;

  async function handleClear() {
    setClearing(true);
    try {
      await clearDemoData();
      localStorage.removeItem('erp_has_demo_data');
      setVisible(false);
    } catch {
      /* ignore — user can try again */
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
        <span className="text-base">⚡</span>
        <span><strong>This is sample data.</strong> Prepared to help you explore how the system works.</span>
      </div>
      <button
        type="button"
        onClick={() => void handleClear()}
        disabled={clearing}
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-900/30"
      >
        {clearing ? "Clearing…" : "Clear my data"}
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const role = user?.role ?? "employee";

  const canSales    = hasPermission("sales.read");
  const canCatalog  = hasPermission("catalog.product.read");
  const canFinance  = hasPermission("finance.read");
  const canForecast = hasPermission("forecast.run");

  const { startCur, endCur, startPrev, endPrev } = useDateRanges();

  // --- React Query hooks ---
  const qModules      = useActiveModules(role !== "employee");
  const qAdminStats   = useAdminPlatformStats(role === "admin");
  const qDailyCur   = useDailySales(startCur, endCur, canSales);
  const qDailyPrev  = useDailySales(startPrev, endPrev, canSales);
  const qOrdersCur  = useSalesRecordsCount(startCur, endCur, canSales);
  const qOrdersPrev = useSalesRecordsCount(startPrev, endPrev, canSales);
  const qForecasts  = useForecastResults(canForecast);
  const qProducts   = useProducts(canCatalog);
  const qCashflow   = useCashflowForecast(canFinance && role !== "employee");
  const qFinanceCur = useFinanceSummary(startCur, endCur, canFinance);
  const qFinancePrev= useFinanceSummary(startPrev, endPrev, canFinance);

  // Aggregate loading / error
  const loading = [qModules, qDailyCur, qForecasts, qProducts, qFinanceCur].some(
    (q) => q.isLoading,
  );
  const error =
    [qModules, qDailyCur, qDailyPrev, qOrdersCur, qOrdersPrev, qForecasts, qProducts, qFinanceCur, qFinancePrev]
      .map((q) => (q.error ? getApiErrorMessage(q.error, "Load failed") : null))
      .find(Boolean) ?? null;

  // Unwrap data with defaults
  const activeModules = qModules.data?.active_modules ?? [];
  const sector        = qModules.data?.sector ?? null;
  const daily         = qDailyCur.data ?? [];
  const dailyPrev     = qDailyPrev.data ?? [];
  const ordersCur     = qOrdersCur.data ?? 0;
  const ordersPrev    = qOrdersPrev.data ?? 0;
  const forecasts     = qForecasts.data ?? [];
  const products      = qProducts.data ?? [];
  const financeCur    = qFinanceCur.data ?? null;
  const financePrev   = qFinancePrev.data ?? null;
  const adminStats    = qAdminStats.data ?? null;
  const cashflow      = qCashflow.data ?? null;

  // ----------- computed values -----------
  const latestProphet = useMemo(() => {
    const p = forecasts.filter((x) => x.model_name === "prophet");
    return p.length ? p[0] : forecasts[0];
  }, [forecasts]);

  const chartData = useMemo<LinePoint[]>(() => {
    const map = new Map<string, LinePoint>();
    for (const p of daily) {
      const key = iso(p.date);
      map.set(key, { date: key, actualQty: p.quantity });
    }
    const fDaily = latestProphet?.result_payload?.daily ?? [];
    for (const p of fDaily) {
      const key = iso(p.date);
      const cur = map.get(key) ?? { date: key };
      cur.forecastQty =
        typeof p.quantity === "number" ? p.quantity :
        typeof p.value === "number" ? p.value : undefined;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [daily, latestProphet]);

  const revenueCur  = financeCur?.revenue  ?? sumDailyRevenue(daily);
  const revenuePrev = financePrev?.revenue ?? sumDailyRevenue(dailyPrev);
  const revTrend    = trendPct(revenueCur, revenuePrev);
  const ordTrend    = trendPct(ordersCur, ordersPrev);
  const criticalNow = products.filter((p) => p.stock_quantity <= p.reorder_level).length;

  const aiScore = useMemo(() => {
    const pts = chartData.filter((x) => x.actualQty != null && x.forecastQty != null).slice(-14);
    if (pts.length < 3) return { score: null as number | null };
    let err = 0, denom = 0;
    for (const x of pts) {
      const a = x.actualQty ?? 0, f = x.forecastQty ?? 0;
      if (a > 0) { err += Math.abs(a - f) / a; denom++; }
    }
    if (!denom) return { score: null };
    return { score: Math.max(0, Math.min(100, Math.round((1 - err / denom) * 100))) };
  }, [chartData]);

  // My Tasks (employee only)
  const [myTasks, setMyTasks] = useState<TeamTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  useEffect(() => {
    if (role !== "employee" || !user?.id) return;
    setTasksLoading(true);
    fetchTeamTasks({ assignee_id: user.id })
      .then((data) => setMyTasks(data.filter((t) => t.status !== "done")))
      .catch(() => setMyTasks([]))
      .finally(() => setTasksLoading(false));
  }, [role, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleMyTask(task: TeamTask) {
    const newStatus = task.status === "done" ? "todo" : "done";
    setMyTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    try {
      await updateTeamTask(task.id, { status: newStatus });
      // remove from list if marked done (filter out done tasks)
      if (newStatus === "done") {
        setMyTasks((prev) => prev.filter((t) => t.id !== task.id));
      }
    } catch {
      // revert on error
      setMyTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    }
  }

  // ===========================================================================
  // ADMIN DASHBOARD
  // ===========================================================================
  if (role === "admin") {
    return (
      <PageLayout
        title={t("dashboard.platformTitle")}
        subtitle={t("dashboard.platformSubtitle")}
      >
        {/* ADM-9: Platform stats — /admin/stats'tan platform geneli veriler */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: t("dashboard.totalTenants"),    value: adminStats ? String(adminStats.total_tenants)  : "—", icon: Building2,    color: "text-violet-600 bg-violet-100 dark:bg-violet-900/30",   to: "/admin" },
            { label: t("dashboard.activeTenants"),   value: adminStats ? String(adminStats.active_tenants) : "—", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30", to: "/admin" },
            { label: t("dashboard.totalUsers"),      value: adminStats ? String(adminStats.total_users)    : "—", icon: Users,        color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30",   to: "/admin" },
            { label: t("dashboard.platformSecurity"), value: t("common.active"),                                 icon: Shield,       color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",      to: null     },
          ].map((s) => {
            const card = (
              <div className={`flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-white/10 dark:bg-slate-900 ${s.to ? "hover:border-violet-200 cursor-pointer" : ""}`}>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.color}`}>
                  <s.icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
                </div>
              </div>
            );
            return s.to ? <Link key={s.label} to={s.to}>{card}</Link> : <div key={s.label}>{card}</div>;
          })}
        </div>

        {/* Quick links — platform admin için anlamlı linkler */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Platform Management</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ADMIN_QUICK_LINKS.map((l) => {
              const cls = colorMap[l.color];
              return (
                <Link key={l.label} to={l.to} className={`flex flex-col gap-2 rounded-2xl border p-4 transition hover:shadow-md ${cls}`}>
                  <l.icon className="h-5 w-5" strokeWidth={2} />
                  <div>
                    <div className="text-sm font-semibold">{l.label}</div>
                    <div className="mt-0.5 text-[11px] opacity-70">{l.desc}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
        {/* ADM-9: "Aktif Modüller" bölümü admin view'dan kaldırıldı (tenant 1 modülleri görünüyordu) */}

        {/* Rol rehberi */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900/60">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Role Guide</h2>
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">admin</span>
              <span>Platform super-user. Full system control, user management, module and sector settings. Access to all ERP modules.</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">manager</span>
              <span>Company owner / manager. Views company ERP data based on their chosen sector and active modules. Can manage their team.</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">employee</span>
              <span>Staff member. Can only view sales and stock data. No access to Finance, AI analysis, or admin panel.</span>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // ===========================================================================
  // EMPLOYEE DASHBOARD
  // ===========================================================================
  if (role === "employee") {
    return (
      <PageLayout
        title={`${t("dashboard.welcome")}${user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}`}
        subtitle={t("dashboard.employeeSubtitle")}
      >
        {loading ? <SkeletonKpiGrid count={2} /> : null}

        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${loading ? "hidden" : ""}`}>
          {canSales && (
            <button
              type="button"
              onClick={() => navigate("/sales")}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-violet-500/50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
                <ShoppingCart className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Sales Records</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {loading ? "…" : `${ordersCur} sales in the last 30 days`}
                </div>
              </div>
            </button>
          )}

          {canCatalog && (
            <button
              type="button"
              onClick={() => navigate("/stock")}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-amber-500/50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                <Package className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">Stock Status</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {loading ? "…" : criticalNow > 0 ? `${criticalNow} critical item${criticalNow > 1 ? 's' : ''}` : "Stock at normal levels"}
                </div>
              </div>
            </button>
          )}

          {hasPermission("ai.insights.read") && (
            <button
              type="button"
              onClick={() => navigate("/ai")}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-indigo-500/50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                <Brain className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">AI Assistant</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Ask questions in natural language</div>
              </div>
            </button>
          )}
        </div>

        {/* My Tasks widget — visible to all staff */}
        {(
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-indigo-500" strokeWidth={2} />
                <span className="font-semibold text-slate-900 dark:text-white">My Tasks</span>
                {myTasks.length > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    {myTasks.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate("/hr")}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200"
              >
                View all →
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {tasksLoading ? (
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="h-5 w-5 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                </div>
              ) : myTasks.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" strokeWidth={1.5} />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">All caught up!</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">No pending tasks assigned to you.</p>
                </div>
              ) : (
                myTasks.slice(0, 5).map((task) => {
                  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";
                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${isOverdue ? "border-l-2 border-rose-400" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => void toggleMyTask(task)}
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-all hover:border-indigo-400 dark:border-slate-600 dark:hover:border-indigo-500"
                        title="Mark as done"
                      >
                        <Check className="h-3 w-3 text-transparent group-hover:text-indigo-400" strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            task.priority === "high" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                            : task.priority === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}>
                            {task.priority ?? "normal"}
                          </span>
                        </div>
                        {task.description && (
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
                        )}
                        {task.due_date && (
                          <p className={`mt-1 text-[11px] ${isOverdue ? "font-semibold text-rose-500" : "text-slate-400 dark:text-slate-500"}`}>
                            {isOverdue ? "Overdue · " : "Due "}
                            {new Date(task.due_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {myTasks.length > 5 && (
              <div className="border-t border-slate-100 px-5 py-3 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => navigate("/hr")}
                  className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                >
                  +{myTasks.length - 5} more tasks — view all
                </button>
              </div>
            )}
          </div>
        )}

        {canCatalog && (
          <CriticalStockTable products={products} loading={loading && !products.length} error={null} />
        )}

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-200">
          <strong>Access info:</strong> With your employee account you can view sales and stock data. Contact your manager for access to Finance, AI analysis, or the admin panel.
        </div>
      </PageLayout>
    );
  }

  // ===========================================================================
  // MANAGER DASHBOARD
  // ===========================================================================
  const hasModules = activeModules.length > 0;

  return (
    <PageLayout
      title={t("dashboard.companyTitle")}
      subtitle={t("dashboard.companySubtitle")}
      actions={
        <span className={secondaryButtonClass + " pointer-events-none text-xs"}>
          {t("dashboard.last30vs")}
        </span>
      }
    >
      {/* Demo data banner */}
      <DemoBanner />

      {/* 5-13: Sektöre özel başlangıç rehberi — demo veri yokken veya ilk girişte */}
      <GettingStartedCard sector={sector} />

      {/* Morning briefing — only for manager/admin with AI permission */}
      {hasPermission("ai.insights.read") && <MorningBriefing />}

      {/* Active module pills */}
      {hasModules ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">{t("dashboard.activeModulesLabel")}</span>
          {activeModules.map((key) => {
            const Icon = MODULE_ICON[key] ?? Settings;
            return (
              <Link key={key} to={MODULE_TO[key] ?? "/dashboard"}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-violet-300">
                <Icon className="h-3 w-3" strokeWidth={2} />
                {t(MODULE_LABEL_KEY[key] ?? "nav.dashboard")}
              </Link>
            );
          })}
          <Link to="/settings" className="text-[11px] text-slate-400 hover:text-violet-600 dark:hover:text-violet-400">{t("dashboard.editModules")} →</Link>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-950/30">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{t("dashboard.noOnboarding")}</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{t("dashboard.noOnboardingHint")}</p>
          </div>
          <Link to="/onboarding"
            className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700">
            {t("dashboard.setupNow")}
          </Link>
        </div>
      )}

      {/* KPI kartları */}
      {loading ? <SkeletonKpiGrid count={4} /> : null}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "hidden" : ""}`}>
        {canFinance && (
          <StatCard title={t("dashboard.totalRevenue")} value={fmtTry(revenueCur)}
            trendPct={revTrend.pct} trendPositive={revTrend.positive}
            icon={BarChart3} accent="violet" onNavigate={() => navigate("/finance")} />
        )}
        {canSales && (
          <StatCard title={t("dashboard.salesRecords")} value={String(ordersCur)}
            trendPct={ordTrend.pct} trendPositive={ordTrend.positive}
            icon={ShoppingCart} accent="emerald" onNavigate={() => navigate("/sales")} />
        )}
        {canCatalog && (
          <StatCard title={t("dashboard.criticalStock")} value={String(criticalNow)}
            trendPct={null} trendPositive={false}
            icon={Package} accent="amber" onNavigate={() => navigate("/stock")} />
        )}
        {canForecast && (
          <StatCard title={t("dashboard.aiForecastAccuracy")}
            value={aiScore.score != null ? `${aiScore.score}%` : "—"}
            trendPct={null} trendPositive={true}
            icon={Brain} accent="indigo" onNavigate={() => navigate("/ai")} />
        )}
      </div>

      {/* Hızlı modül erişimi */}
      {hasModules && !canSales && !canFinance && !canCatalog && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {activeModules.map((key) => {
            const Icon = MODULE_ICON[key] ?? Settings;
            return (
              <Link key={key} to={MODULE_TO[key] ?? "/dashboard"}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:shadow-sm dark:border-white/10 dark:bg-slate-900">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t(MODULE_LABEL_KEY[key] ?? "nav.dashboard")}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* 3-7 Cashflow forecast card — shown when finance permission + data loaded */}
      {canFinance && cashflow && <CashflowCard data={cashflow} />}

      {!loading && (
        <AiActionCards
          criticalNow={criticalNow}
          revTrend={revTrend}
          ordersCur={ordersCur}
          aiScore={aiScore}
          canCatalog={canCatalog}
          canFinance={canFinance}
          canSales={canSales}
          canForecast={canForecast}
        />
      )}

      {canSales && (
        <SalesForecastLineChart
          data={chartData}
          loading={loading && !chartData.length}
          error={error}
          modelName={latestProphet?.model_name}
          isDark={isDark}
        />
      )}

      {canCatalog && (
        <CriticalStockTable products={products} loading={loading && !products.length} error={null} />
      )}
    </PageLayout>
  );
}
