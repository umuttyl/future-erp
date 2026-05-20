import {
  BarChart3,
  Brain,
  Building2,
  ClipboardList,
  Package,
  Settings,
  ShoppingCart,
  Sliders,
  Truck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CriticalStockTable } from "../components/dashboard/CriticalStockTable";
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
  useDailySales,
  useFinanceSummary,
  useForecastResults,
  useProducts,
  useSalesRecordsCount,
  useUsers,
} from "../hooks/useDashboardQueries";
import { getApiErrorMessage } from "../lib/api";

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
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
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
      title: `${criticalNow} ürün kritik stok altında`,
      body: "Stok seviyesi yeniden sipariş eşiğinin altına düşmüş kalemler tedarik gerektiriyor.",
      to: "/stock",
      cta: "Stok Görüntüle",
    })
  }

  if (canFinance && revTrend.pct !== null && revTrend.pct < -10) {
    cards.push({
      severity: "warning",
      title: `Ciro %${Math.abs(revTrend.pct).toFixed(0)} düştü`,
      body: "Önceki 30 güne kıyasla gelirde anlamlı bir gerileme tespit edildi.",
      to: "/finance",
      cta: "Finans Analizine Git",
    })
  }

  if (canSales && ordersCur === 0) {
    cards.push({
      severity: "info",
      title: "Son 30 günde satış yok",
      body: "Henüz satış kaydı oluşturulmamış. İlk siparişi girin veya ekibinizi bilgilendirin.",
      to: "/sales",
      cta: "Satış Sayfasına Git",
    })
  }

  if (canForecast && aiScore.score !== null && aiScore.score < 70) {
    cards.push({
      severity: "info",
      title: `AI tahmin uyumu düşük (%${aiScore.score})`,
      body: "Satış tahminleri gerçekleşenlerle örtüşmüyor. Tahmin modelini güncellemek veya veri kalitesini artırmak faydalı olabilir.",
      to: "/ai",
      cta: "AI Paneline Git",
    })
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/30 dark:bg-emerald-950/30">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
          Sistem sağlıklı — şu an dikkat gerektiren kritik aksiyon yok.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">AI Aksiyon Önerileri</h2>
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

const ADMIN_QUICK_LINKS = [
  { to: "/admin",    label: "Kullanıcı Yönetimi", desc: "Kullanıcı ekle, rol ata, sil",     icon: Users,        color: "violet" },
  { to: "/settings", label: "Modül Ayarları",     desc: "Sektör modüllerini özelleştir",    icon: Sliders,      color: "indigo" },
  { to: "/ai",       label: "AI Analizi",         desc: "Tahmin, anomali, NLP chatbot",     icon: Brain,        color: "amber"  },
  { to: "/finance",  label: "Finans",             desc: "Gelir / gider özeti",              icon: Wallet,       color: "emerald"},
] as const;

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
const MODULE_LABEL: Record<string, string> = {
  sales:      "Satış",
  inventory:  "Stok",
  finance:    "Finans",
  crm:        "Müşteriler",
  suppliers:  "Tedarikçi",
  purchasing: "Siparişler",
  hr:         "İK",
  ai:         "AI",
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

export function DashboardPage() {
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
  const qModules    = useActiveModules(role !== "employee");
  const qUsers      = useUsers(role === "admin" && hasPermission("admin.users.read"));
  const qDailyCur   = useDailySales(startCur, endCur, canSales);
  const qDailyPrev  = useDailySales(startPrev, endPrev, canSales);
  const qOrdersCur  = useSalesRecordsCount(startCur, endCur, canSales);
  const qOrdersPrev = useSalesRecordsCount(startPrev, endPrev, canSales);
  const qForecasts  = useForecastResults(canForecast);
  const qProducts   = useProducts(canCatalog);
  const qFinanceCur = useFinanceSummary(startCur, endCur, canFinance);
  const qFinancePrev= useFinanceSummary(startPrev, endPrev, canFinance);

  // Aggregate loading / error
  const loading = [qModules, qDailyCur, qForecasts, qProducts, qFinanceCur].some(
    (q) => q.isLoading,
  );
  const error =
    [qModules, qDailyCur, qDailyPrev, qOrdersCur, qOrdersPrev, qForecasts, qProducts, qFinanceCur, qFinancePrev]
      .map((q) => (q.error ? getApiErrorMessage(q.error, "Yükleme başarısız") : null))
      .find(Boolean) ?? null;

  // Unwrap data with defaults
  const activeModules = qModules.data?.active_modules ?? [];
  const daily         = qDailyCur.data ?? [];
  const dailyPrev     = qDailyPrev.data ?? [];
  const ordersCur     = qOrdersCur.data ?? 0;
  const ordersPrev    = qOrdersPrev.data ?? 0;
  const forecasts     = qForecasts.data ?? [];
  const products      = qProducts.data ?? [];
  const financeCur    = qFinanceCur.data ?? null;
  const financePrev   = qFinancePrev.data ?? null;
  const userCount     = qUsers.data ?? null;

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

  // ===========================================================================
  // ADMIN DASHBOARD
  // ===========================================================================
  if (role === "admin") {
    return (
      <PageLayout
        title="Platform Kontrol Paneli"
        subtitle="Sistem geneli yönetim — kullanıcılar, modüller ve platform sağlığı."
      >
        {/* System stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Toplam Kullanıcı",   value: userCount != null ? String(userCount) : "—", icon: Users,       color: "text-violet-600 bg-violet-100 dark:bg-violet-900/30",  to: "/admin"    },
            { label: "Aktif Modül",        value: activeModules.length > 0 ? String(activeModules.length) : "—", icon: Sliders,     color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30", to: "/settings" },
            { label: "Ekip Yönetimi",      value: "Yönet →",                                   icon: Users,       color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30",to: "/admin"    },
            { label: "Platform Güvenliği", value: "Aktif",                                     icon: Building2,   color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",      to: null        },
          ].map((s) => {
            const card = (
              <div className={`flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-white/10 dark:bg-slate-900 ${s.to ? "hover:border-violet-200 cursor-pointer" : ""}`}>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.color}`}>
                  <s.icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">
                    {loading && s.value === "—" ? <span className="inline-block h-5 w-10 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /> : s.value}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
                </div>
              </div>
            );
            return s.to ? <Link key={s.label} to={s.to}>{card}</Link> : <div key={s.label}>{card}</div>;
          })}
        </div>

        {/* Quick links */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Platform Yönetimi</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ADMIN_QUICK_LINKS.map((l) => {
              const cls = colorMap[l.color];
              return (
                <Link key={l.to} to={l.to} className={`flex flex-col gap-2 rounded-2xl border p-4 transition hover:shadow-md ${cls}`}>
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

        {/* Aktif modüller */}
        {activeModules.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Aktif Modüller{" "}
              <Link to="/settings" className="ml-2 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">Düzenle →</Link>
            </h2>
            <div className="flex flex-wrap gap-2">
              {activeModules.map((key) => {
                const Icon = MODULE_ICON[key] ?? Settings;
                return (
                  <Link key={key} to={MODULE_TO[key] ?? "/dashboard"}
                    className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300">
                    <Icon className="h-3 w-3" strokeWidth={2} />
                    {MODULE_LABEL[key] ?? key}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Rol rehberi */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900/60">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Rol Rehberi</h2>
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">admin</span>
              <span>Platform süper kullanıcısı. Tüm sistem kontrolü, kullanıcı yönetimi, modül ve sektör ayarları. Tüm ERP modüllerine erişim.</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">manager</span>
              <span>Şirket sahibi / müdür. Seçtiği sektör ve aktif modüllere göre şirketin ERP verilerini görür. Ekip yönetimi yapabilir.</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">employee</span>
              <span>Çalışan. Yalnızca satış ve stok verilerini görür. Finans, AI analizi ve yönetim paneline erişimi yoktur.</span>
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
        title={`Hoş geldiniz${user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}`}
        subtitle="Görevinizle ilgili modüllere hızlıca erişin."
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
                <div className="font-semibold text-slate-900 dark:text-white">Satış Kayıtları</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {loading ? "…" : `Son 30 günde ${ordersCur} satış`}
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
                <div className="font-semibold text-slate-900 dark:text-white">Stok Durumu</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {loading ? "…" : criticalNow > 0 ? `${criticalNow} kritik kalem` : "Stok normal seviyelerde"}
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
                <div className="font-semibold text-slate-900 dark:text-white">AI Asistan</div>
                <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Doğal dilde soru sorabilirsiniz</div>
              </div>
            </button>
          )}
        </div>

        {canCatalog && (
          <CriticalStockTable products={products} loading={loading && !products.length} error={null} />
        )}

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-200">
          <strong>Erişim bilgisi:</strong> Çalışan hesabınız ile satış ve stok verilerini görüntüleyebilirsiniz. Finans, AI analizi veya yönetim paneline erişmek için yöneticinizle iletişime geçin.
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
      title="Şirket Paneli"
      subtitle="Operasyon özeti — seçili modüllere ve son 30 güne göre."
      actions={
        <span className={secondaryButtonClass + " pointer-events-none text-xs"}>
          Son 30 gün vs önceki 30 gün
        </span>
      }
    >
      {/* Active module pills */}
      {hasModules ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Aktif modüller:</span>
          {activeModules.map((key) => {
            const Icon = MODULE_ICON[key] ?? Settings;
            return (
              <Link key={key} to={MODULE_TO[key] ?? "/dashboard"}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-violet-300">
                <Icon className="h-3 w-3" strokeWidth={2} />
                {MODULE_LABEL[key] ?? key}
              </Link>
            );
          })}
          <Link to="/settings" className="text-[11px] text-slate-400 hover:text-violet-600 dark:hover:text-violet-400">Düzenle →</Link>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-950/30">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Sektör ve modül seçimi yapılmamış</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Şirketinize uygun sektörü ve modülleri seçerek paneli özelleştirin.</p>
          </div>
          <Link to="/onboarding"
            className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700">
            Şimdi Kur →
          </Link>
        </div>
      )}

      {/* KPI kartları */}
      {loading ? <SkeletonKpiGrid count={4} /> : null}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "hidden" : ""}`}>
        {canFinance && (
          <StatCard title="Toplam ciro" value={fmtTry(revenueCur)}
            trendPct={revTrend.pct} trendPositive={revTrend.positive}
            icon={BarChart3} onNavigate={() => navigate("/finance")} />
        )}
        {canSales && (
          <StatCard title="Satış kayıtları (30 gün)" value={String(ordersCur)}
            trendPct={ordTrend.pct} trendPositive={ordTrend.positive}
            icon={ShoppingCart} onNavigate={() => navigate("/sales")} />
        )}
        {canCatalog && (
          <StatCard title="Kritik stok kalemi" value={String(criticalNow)}
            trendPct={null} trendPositive={false}
            icon={Package} onNavigate={() => navigate("/stock")} />
        )}
        {canForecast && (
          <StatCard title="AI tahmin uyumu"
            value={aiScore.score != null ? `${aiScore.score}%` : "—"}
            trendPct={null} trendPositive={true}
            icon={Brain} onNavigate={() => navigate("/ai")} />
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
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{MODULE_LABEL[key] ?? key}</span>
              </Link>
            );
          })}
        </div>
      )}

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
