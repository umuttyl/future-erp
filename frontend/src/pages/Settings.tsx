import {
  Bell,
  BellOff,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  Lock,
  Package,
  RefreshCw,
  Save,
  ShoppingCart,
  Sliders,
  Store,
  Truck,
  User,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import { LoadingState } from "../components/ui/LoadingState";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import {
  api,
  changeOwnPassword,
  fetchActiveModules,
  fetchCompanyProfile,
  fetchOnboardingConfig,
  getApiErrorMessage,
  patchActiveModules,
  patchCompanyProfile,
  setActiveLocale,
  updateMe,
  uploadCompanyLogo,
  type CompanyProfile,
  type ModuleInfo,
} from "../lib/api";
import { inputFieldClass, primaryButtonClass } from "../components/ui/forms";

// ─── Admin Platform Ayarları ────────────────────────────────────────────────

const TOAST_MUTE_KEY = "erp_notifications_toast_mute";

function AdminPlatformSettings() {
  const { user } = useAuth();

  const [toastMuted, setToastMutedState] = useState(() => {
    try {
      return localStorage.getItem(TOAST_MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Profil formu state — yerel olarak güncellenen ad
  const [displayName, setDisplayName] = useState(user?.full_name?.trim() ?? "");
  const [fullName, setFullName]       = useState(user?.full_name?.trim() ?? "");
  const [currentPw, setCurrentPw]     = useState("");
  const [newPw, setNewPw]             = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  const setToastMuted = (v: boolean) => {
    setToastMutedState(v);
    try {
      localStorage.setItem(TOAST_MUTE_KEY, v ? "1" : "0");
    } catch {
      /* */
    }
  };

  async function onProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const patch: Record<string, unknown> = {};
    if (fullName.trim() !== (user?.full_name?.trim() ?? "")) {
      patch.full_name = fullName.trim() || null;
    }
    if (newPw) {
      patch.current_password = currentPw;
      patch.new_password = newPw;
    }
    if (Object.keys(patch).length === 0) {
      setProfileMsg({ ok: false, text: "No changes to update." });
      return;
    }
    setProfileBusy(true);
    try {
      const { data } = await api.patch<{ full_name: string | null }>("/admin/me", patch);
      setDisplayName(data.full_name?.trim() ?? "");
      setCurrentPw("");
      setNewPw("");
      setProfileMsg({ ok: true, text: "Profile updated." });
    } catch (err: unknown) {
      setProfileMsg({ ok: false, text: getApiErrorMessage(err, "Update failed.") });
    } finally {
      setProfileBusy(false);
    }
  }

  const avatarChar = (displayName || user?.email || "A").charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Platform Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your platform administrator account and notification preferences.
        </p>
      </div>

      {/* Profile Info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16122b]">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Account Information
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-700 text-xl font-bold text-white shadow-lg shadow-red-500/25">
            {avatarChar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-900 dark:text-white">
              {displayName || "—"}
            </div>
            <div className="truncate text-sm text-slate-500 dark:text-slate-400">
              {user?.email}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                Platform Admin
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => void onProfileSubmit(e)} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 dark:border-white/10">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="adm-name">
              Full Name
            </label>
            <input
              id="adm-name"
              type="text"
              className={inputFieldClass + " mt-1"}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Platform Admin"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="adm-cpw">
              Current Password
            </label>
            <input
              id="adm-cpw"
              type="password"
              autoComplete="current-password"
              className={inputFieldClass + " mt-1"}
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Fill in to change password"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="adm-npw">
              New Password
            </label>
            <input
              id="adm-npw"
              type="password"
              autoComplete="new-password"
              className={inputFieldClass + " mt-1"}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          {profileMsg && (
            <p className={`sm:col-span-2 text-sm ${profileMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {profileMsg.text}
            </p>
          )}
          <div className="sm:col-span-2">
            <button type="submit" disabled={profileBusy} className={primaryButtonClass}>
              {profileBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>

      {/* Notification Preferences */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16122b]">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Notification Preferences
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Platform notifications only include company-wide critical stock summaries; individual company alerts are not shown.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/5 dark:bg-white/5">
            <div className="flex items-center gap-3">
              {toastMuted ? (
                <BellOff className="h-4 w-4 shrink-0 text-slate-400" />
              ) : (
                <Bell className="h-4 w-4 shrink-0 text-violet-500" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Instant Notification Toasts
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {toastMuted ? "Toasts muted — only visible in notification list" : "New notifications appear as instant toasts on screen"}
                </div>
              </div>
            </div>
            <label className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center">
              <span className="sr-only">Mute toast notifications</span>
              <input
                type="checkbox"
                checked={toastMuted}
                onChange={(e) => setToastMuted(e.target.checked)}
                className="peer sr-only"
              />
              <span
                className={[
                  "pointer-events-none absolute inset-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2",
                  toastMuted ? "bg-violet-600 dark:bg-violet-500" : "bg-slate-200 dark:bg-white/15",
                ].join(" ")}
                aria-hidden
              />
              <span
                className={[
                  "pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                  toastMuted ? "left-5" : "left-0.5",
                ].join(" ")}
                aria-hidden
              />
            </label>
          </div>
        </div>
      </div>

      {/* Platform Management Links */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16122b]">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Platform Management
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Configure company modules and user management from the Admin panel.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              to: "/admin",
              icon: Users,
              label: "Tenant & User Management",
              desc: "Add companies, manage user roles and module assignments",
              color: "red",
            },
            {
              to: "/dashboard",
              icon: LayoutDashboard,
              label: "Platform Panel",
              desc: "Overview and metrics across all companies",
              color: "rose",
            },
            {
              to: "/ai",
              icon: Brain,
              label: "AI Command Center",
              desc: "Cross-company AI insights and anomaly analysis",
              color: "amber",
            },
            {
              to: "/admin",
              icon: Sliders,
              label: "Module Management",
              desc: "Configure active modules for each company from the Admin panel",
              color: "violet",
            },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="group flex items-start gap-3 rounded-xl border border-slate-100 p-4 transition hover:border-slate-200 hover:bg-slate-50 dark:border-white/5 dark:hover:border-white/10 dark:hover:bg-white/5"
            >
              <div className={`mt-0.5 rounded-lg bg-${item.color}-100 p-2 dark:bg-${item.color}-950/40`}>
                <item.icon className={`h-4 w-4 text-${item.color}-600 dark:text-${item.color}-400`} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-100">
                  {item.label}
                  <ExternalLink className="ml-1 h-3 w-3 shrink-0 text-slate-400 transition group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Modül Mağazası (2C-9) ───────────────────────────────────────────────────

const STORE_MODULES: {
  key: string
  name: string
  tagline: string
  description: string
  features: string[]
  badge?: string
}[] = [
  {
    key: "sales",
    name: "Sales Management",
    tagline: "Manage all your sales from a single screen.",
    description: "Create sales records, track daily revenue in real time, view per-customer history.",
    features: ["Sales record & invoice", "Daily revenue tracking", "Per-customer sales history", "Excel/CSV export"],
    badge: "Core",
  },
  {
    key: "inventory",
    name: "Inventory Tracking",
    tagline: "Keep stock levels under control at all times.",
    description: "Monitor product-level stock quantities, receive alerts at critical levels, view movement history.",
    features: ["Real-time stock levels", "Critical stock alerts", "Stock movement history", "Reorder threshold"],
    badge: "Core",
  },
  {
    key: "finance",
    name: "Finance",
    tagline: "View your revenue & expense balance at any time.",
    description: "Analyze monthly revenue/expense trends on charts, calculate profitability.",
    features: ["Monthly revenue/expense chart", "Gross/net profit calculation", "Period comparison", "Finance summary report"],
  },
  {
    key: "crm",
    name: "Customer Management",
    tagline: "Strengthen your customer relationships.",
    description: "Manage customer profiles, view account statements, track collections.",
    features: ["Customer profile & contact", "Account statement", "Collection tracking", "B2B / B2C segmentation"],
  },
  {
    key: "suppliers",
    name: "Suppliers",
    tagline: "Organize your supplier relationships.",
    description: "Record supplier information, view purchase history and account status.",
    features: ["Supplier profile & contact", "Purchase history", "Supplier account balance", "Performance evaluation"],
  },
  {
    key: "purchasing",
    name: "Purchasing",
    tagline: "Manage your procurement process end-to-end.",
    description: "Create purchase orders, get AI-generated draft orders automatically, track deliveries.",
    features: ["Purchase order creation", "AI auto draft orders", "Delivery & status tracking", "Approval workflow"],
    badge: "AI Powered",
  },
  {
    key: "hr",
    name: "Team Management",
    tagline: "Track your team's performance and tasks.",
    description: "Assign employee tasks, performance dashboard, commission calculation and leave tracking.",
    features: ["Task assignment & tracking", "Sales-based performance", "Commission calculation", "Leave management"],
  },
  {
    key: "ai",
    name: "AI Assistant",
    tagline: "Query your data in natural language.",
    description: "AI-powered query engine, anomaly detection, sales forecasting and proactive recommendations.",
    features: ["Natural language SQL query", "Morning briefing", "Sales forecasting", "Customer churn alert"],
    badge: "AI",
  },
]

const STORE_ICON: Record<string, typeof ShoppingCart> = {
  sales: ShoppingCart,
  inventory: Package,
  finance: Wallet,
  crm: Building2,
  suppliers: Truck,
  purchasing: ClipboardList,
  hr: UserCheck,
  ai: Brain,
}

const STORE_COLOR: Record<string, { icon: string; ring: string; bg: string; btn: string; btnOff: string }> = {
  sales:     { icon: "text-violet-600 dark:text-violet-400", ring: "ring-violet-200 dark:ring-violet-500/30", bg: "bg-violet-50 dark:bg-violet-900/20",   btn: "bg-violet-600 hover:bg-violet-700", btnOff: "bg-slate-500 hover:bg-slate-600" },
  inventory: { icon: "text-blue-600 dark:text-blue-400",    ring: "ring-blue-200 dark:ring-blue-500/30",    bg: "bg-blue-50 dark:bg-blue-900/20",         btn: "bg-blue-600 hover:bg-blue-700",      btnOff: "bg-slate-500 hover:bg-slate-600" },
  finance:   { icon: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-200 dark:ring-emerald-500/30", bg: "bg-emerald-50 dark:bg-emerald-900/20", btn: "bg-emerald-600 hover:bg-emerald-700", btnOff: "bg-slate-500 hover:bg-slate-600" },
  crm:       { icon: "text-orange-600 dark:text-orange-400", ring: "ring-orange-200 dark:ring-orange-500/30", bg: "bg-orange-50 dark:bg-orange-900/20",    btn: "bg-orange-600 hover:bg-orange-700",   btnOff: "bg-slate-500 hover:bg-slate-600" },
  suppliers: { icon: "text-cyan-600 dark:text-cyan-400",    ring: "ring-cyan-200 dark:ring-cyan-500/30",    bg: "bg-cyan-50 dark:bg-cyan-900/20",         btn: "bg-cyan-600 hover:bg-cyan-700",       btnOff: "bg-slate-500 hover:bg-slate-600" },
  purchasing:{ icon: "text-indigo-600 dark:text-indigo-400",ring: "ring-indigo-200 dark:ring-indigo-500/30",bg: "bg-indigo-50 dark:bg-indigo-900/20",      btn: "bg-indigo-600 hover:bg-indigo-700",   btnOff: "bg-slate-500 hover:bg-slate-600" },
  hr:        { icon: "text-pink-600 dark:text-pink-400",    ring: "ring-pink-200 dark:ring-pink-500/30",    bg: "bg-pink-50 dark:bg-pink-900/20",         btn: "bg-pink-600 hover:bg-pink-700",       btnOff: "bg-slate-500 hover:bg-slate-600" },
  ai:        { icon: "text-amber-600 dark:text-amber-400",  ring: "ring-amber-200 dark:ring-amber-500/30",  bg: "bg-amber-50 dark:bg-amber-900/20",       btn: "bg-amber-600 hover:bg-amber-700",     btnOff: "bg-slate-500 hover:bg-slate-600" },
}

function ModuleStoreTab() {
  const { t } = useTranslation()
  const { hasPermission, user } = useAuth()
  const canEdit = hasPermission("admin.users.write") || user?.role === "manager"

  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchActiveModules()
      .then((m) => setActiveKeys(m.active_modules))
      .catch((e) => setError(getApiErrorMessage(e, "Failed to load modules.")))
      .finally(() => setLoading(false))
  }, [])

  async function toggle(key: string) {
    if (!canEdit) return
    const next = activeKeys.includes(key)
      ? activeKeys.filter((k) => k !== key)
      : [...activeKeys, key]
    setSaving(key)
    setError(null)
    try {
      await patchActiveModules({ active_modules: next })
      setActiveKeys(next)
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      setError(getApiErrorMessage(e, "Save failed."))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("moduleStore.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("moduleStore.subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {STORE_MODULES.map((mod) => {
          const isActive = activeKeys.includes(mod.key)
          const isSaving = saving === mod.key
          const Icon = STORE_ICON[mod.key] ?? Zap
          const color = STORE_COLOR[mod.key] ?? STORE_COLOR.sales

          return (
            <div
              key={mod.key}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-all dark:bg-slate-900 ${
                isActive
                  ? `border-slate-200 dark:border-slate-700 ring-2 ${color.ring}`
                  : "border-slate-200 dark:border-slate-700/60 opacity-75"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color.bg}`}>
                  <Icon className={`h-5 w-5 ${color.icon}`} strokeWidth={2} />
                </div>
                <div className="flex items-center gap-2">
                  {mod.badge && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      mod.badge === "AI" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : mod.badge === "AI Powered" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}>
                      {mod.badge}
                    </span>
                  )}
                  {isActive && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <Check className="h-2.5 w-2.5" />
                      {t("moduleStore.active")}
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="mt-3 flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white">{mod.name}</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{mod.tagline}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{mod.description}</p>

                <ul className="mt-3 space-y-1">
                  {mod.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action button */}
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                {canEdit ? (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void toggle(mod.key)}
                    className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
                      isActive ? color.btnOff : color.btn
                    }`}
                  >
                    {isSaving ? t("common.saving") : isActive ? t("moduleStore.disable") : t("moduleStore.enable")}
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs text-slate-400 dark:border-slate-700">
                    <Lock className="h-3 w-3" />
                    Only managers can edit
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Şirket Modül Ayarları ───────────────────────────────────────────────────

const MODULE_ICONS: Record<string, typeof ShoppingCart> = {
  sales:      ShoppingCart,
  inventory:  Package,
  finance:    Wallet,
  crm:        Building2,
  suppliers:  Truck,
  purchasing: ClipboardList,
  hr:         UserCheck,
  ai:         Brain,
  cashbook:   Wallet,
}

const MODULE_ACTIVE: Record<string, { card: string; icon: string; badge: string }> = {
  sales:      { card: "border-violet-300 bg-violet-50/70 dark:border-violet-500/40 dark:bg-violet-900/15",    icon: "text-violet-600 dark:text-violet-400",  badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" },
  inventory:  { card: "border-blue-300 bg-blue-50/70 dark:border-blue-500/40 dark:bg-blue-900/15",            icon: "text-blue-600 dark:text-blue-400",      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  finance:    { card: "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-900/15",icon: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
  crm:        { card: "border-orange-300 bg-orange-50/70 dark:border-orange-500/40 dark:bg-orange-900/15",    icon: "text-orange-600 dark:text-orange-400",  badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
  suppliers:  { card: "border-cyan-300 bg-cyan-50/70 dark:border-cyan-500/40 dark:bg-cyan-900/15",            icon: "text-cyan-600 dark:text-cyan-400",      badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300" },
  purchasing: { card: "border-indigo-300 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-900/15",    icon: "text-indigo-600 dark:text-indigo-400",  badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300" },
  hr:         { card: "border-pink-300 bg-pink-50/70 dark:border-pink-500/40 dark:bg-pink-900/15",            icon: "text-pink-600 dark:text-pink-400",      badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300" },
  ai:         { card: "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-900/15",        icon: "text-amber-600 dark:text-amber-400",    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  cashbook:   { card: "border-teal-300 bg-teal-50/70 dark:border-teal-500/40 dark:bg-teal-900/15",            icon: "text-teal-600 dark:text-teal-400",      badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300" },
}

type AccessLevel = 'full' | 'readonly' | 'disabled'
type ModuleAccessMap = Record<string, { managers: AccessLevel; staff: AccessLevel }>
type ModuleConfigMap = Record<string, Record<string, string>>

const ACCESS_OPTIONS: { value: AccessLevel; label: string; dot: string }[] = [
  { value: 'full',     label: 'Full Access', dot: 'bg-emerald-500' },
  { value: 'readonly', label: 'Read-only',   dot: 'bg-amber-500' },
  { value: 'disabled', label: 'No Access',   dot: 'bg-red-500' },
]

const MODULE_CONFIG_FIELDS: Record<string, { key: string; label: string; type: 'text' | 'number' | 'select'; options?: string[]; placeholder?: string }[]> = {
  sales: [
    { key: 'commission_rate',  label: 'Commission Rate (%)',  type: 'number', placeholder: '0' },
    { key: 'max_discount',     label: 'Max Discount (%)',      type: 'number', placeholder: '20' },
    { key: 'invoice_prefix',   label: 'Invoice Prefix',        type: 'text',   placeholder: 'INV' },
    { key: 'payment_terms',    label: 'Default Payment Terms', type: 'select', options: ['Immediate', 'Net 15', 'Net 30', 'Net 45', 'Net 60'] },
  ],
  finance: [
    { key: 'fiscal_year_start', label: 'Fiscal Year Start',    type: 'select', options: ['January', 'April', 'July', 'October'] },
    { key: 'default_tax_rate',  label: 'Default Tax Rate (%)', type: 'number', placeholder: '20' },
    { key: 'invoice_due_days',  label: 'Invoice Due Days',     type: 'number', placeholder: '30' },
    { key: 'currency',          label: 'Currency',             type: 'select', options: ['TRY', 'USD', 'EUR', 'GBP'] },
  ],
  hr: [
    { key: 'annual_leave_days',   label: 'Annual Leave Days',     type: 'number', placeholder: '14' },
    { key: 'work_days_per_week',  label: 'Work Days / Week',      type: 'select', options: ['5', '6', '7'] },
    { key: 'overtime_rate',       label: 'Overtime Rate',         type: 'select', options: ['1.25x', '1.5x', '2.0x'] },
    { key: 'payroll_day',         label: 'Payroll Day of Month',  type: 'number', placeholder: '1' },
  ],
  inventory: [
    { key: 'low_stock_threshold', label: 'Low Stock Alert (%)',       type: 'number', placeholder: '20' },
    { key: 'reorder_qty',         label: 'Default Reorder Quantity',  type: 'number', placeholder: '10' },
    { key: 'default_unit',        label: 'Default Unit',              type: 'select', options: ['pieces', 'kg', 'liters', 'meters', 'boxes'] },
  ],
  crm: [
    { key: 'followup_days',        label: 'Follow-up Reminder (days)', type: 'number', placeholder: '7' },
    { key: 'customer_tier_system', label: 'Tier System',               type: 'select', options: ['A / B / C', 'Bronze / Silver / Gold', 'Standard / Premium / VIP'] },
  ],
  suppliers: [
    { key: 'payment_terms', label: 'Default Payment Terms',  type: 'select', options: ['Net 15', 'Net 30', 'Net 45', 'Net 60'] },
    { key: 'lead_time_days', label: 'Default Lead Time (days)', type: 'number', placeholder: '7' },
  ],
  purchasing: [
    { key: 'approval_threshold', label: 'Approval Threshold (₺)', type: 'number', placeholder: '5000' },
    { key: 'po_prefix',          label: 'PO Number Prefix',        type: 'text',   placeholder: 'PO' },
  ],
  ai: [
    { key: 'forecast_horizon',    label: 'Forecast Horizon',    type: 'select', options: ['7 days', '30 days', '90 days'] },
    { key: 'anomaly_sensitivity', label: 'Anomaly Sensitivity', type: 'select', options: ['Low', 'Medium', 'High'] },
  ],
  cashbook: [
    { key: 'default_account',  label: 'Default Cash Account',  type: 'text',   placeholder: 'Main Cash' },
    { key: 'opening_balance',  label: 'Opening Balance (₺)',    type: 'number', placeholder: '0' },
  ],
}

const SECTOR_LABELS: Record<string, string> = {
  retail: "Retail / Market",
  restaurant: "Restaurant / Café",
  service: "Service Industry",
  production: "Production / Workshop",
  construction: "Construction / Contractor",
  other: "Other",
}

function CompanyModuleSettings() {
  const { user, hasPermission } = useAuth()
  const canEdit = hasPermission("admin.users.write") || user?.role === "manager"
  const tenantSlug = user?.tenant_slug ?? 'default'

  const ACCESS_KEY = `erp_module_access_${tenantSlug}`
  const CONFIG_KEY  = `erp_module_config_${tenantSlug}`

  const [allModules, setAllModules] = useState<ModuleInfo[]>([])
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [currentSector, setCurrentSector] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null)

  const [accessMap, setAccessMap] = useState<ModuleAccessMap>(() => {
    try { return JSON.parse(localStorage.getItem(ACCESS_KEY) ?? '{}') as ModuleAccessMap } catch { return {} }
  })
  const [configMap, setConfigMap] = useState<ModuleConfigMap>(() => {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as ModuleConfigMap } catch { return {} }
  })

  useEffect(() => {
    Promise.all([fetchOnboardingConfig(), fetchActiveModules()])
      .then(([cfg, mods]) => {
        setAllModules(cfg.all_modules)
        setActiveKeys(mods.active_modules)
        setCurrentSector(mods.sector)
      })
      .catch((err) => setError(getApiErrorMessage(err, "Failed to load data.")))
      .finally(() => setLoading(false))
  }, [])

  function toggle(key: string) {
    if (!canEdit) return
    setActiveKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
    setSaved(false)
  }

  function setAccess(moduleKey: string, group: 'managers' | 'staff', level: AccessLevel) {
    const prev = accessMap[moduleKey] ?? { managers: 'full', staff: 'readonly' }
    const next = { ...accessMap, [moduleKey]: { ...prev, [group]: level } }
    setAccessMap(next)
    localStorage.setItem(ACCESS_KEY, JSON.stringify(next))
  }

  function setConfigValue(moduleKey: string, field: string, value: string) {
    const next = { ...configMap, [moduleKey]: { ...configMap[moduleKey], [field]: value } }
    setConfigMap(next)
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next))
  }

  async function handleSave() {
    if (!canEdit || activeKeys.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await patchActiveModules({ active_modules: activeKeys })
      setSaved(true)
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      setError(getApiErrorMessage(err, "Save failed. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Module Management</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enable modules, set role access, and configure module-specific settings.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
          {activeKeys.length} / {allModules.length} active
        </span>
      </div>

      {/* Sector banner */}
      {currentSector && (
        <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-5 py-3.5 dark:border-violet-500/30 dark:bg-violet-900/20">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-400">Active Sector</p>
            <p className="mt-0.5 font-semibold text-violet-900 dark:text-violet-100">{SECTOR_LABELS[currentSector] ?? currentSector}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Access legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-white/10 dark:bg-slate-800/50">
        <span className="font-medium text-slate-400 dark:text-slate-500">Role access levels:</span>
        {ACCESS_OPTIONS.map(o => (
          <span key={o.value} className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
            <span className={`h-2 w-2 rounded-full ${o.dot}`} />
            {o.label}
          </span>
        ))}
        {!canEdit && <span className="ml-auto text-slate-400">Manager role required to edit</span>}
      </div>

      {/* Module list */}
      <div className="space-y-3">
        {allModules.map((mod) => {
          const isActive = activeKeys.includes(mod.key)
          const Icon = MODULE_ICONS[mod.key] ?? Zap
          const colors = MODULE_ACTIVE[mod.key] ?? { card: 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/40', icon: 'text-slate-500', badge: '' }
          const access = accessMap[mod.key] ?? { managers: 'full', staff: 'readonly' }
          const configFields = MODULE_CONFIG_FIELDS[mod.key] ?? []
          const isConfigOpen = expandedConfig === mod.key

          return (
            <div
              key={mod.key}
              className={`overflow-hidden rounded-2xl border-2 shadow-sm transition-all duration-200 ${
                isActive
                  ? colors.card
                  : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-800/30'
              }`}
            >
              {/* ── Top row ── */}
              <div className="flex items-center gap-4 px-5 py-4">
                {/* Module icon */}
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  isActive ? 'bg-white/90 shadow-sm dark:bg-white/10' : 'bg-slate-100 dark:bg-slate-700'
                }`}>
                  <Icon className={`h-5 w-5 ${isActive ? colors.icon : 'text-slate-400'}`} strokeWidth={1.75} />
                </div>

                {/* Title + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                      {mod.label}
                    </span>
                    {isActive && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${colors.badge}`}>
                        Active
                      </span>
                    )}
                    {mod.key === 'ai' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        AI-powered
                      </span>
                    )}
                  </div>
                  <p className={`mt-0.5 truncate text-sm ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-600'}`}>
                    {mod.description}
                  </p>
                </div>

                {/* Toggle switch */}
                <button
                  type="button"
                  onClick={() => toggle(mod.key)}
                  disabled={!canEdit}
                  aria-label={isActive ? 'Disable module' : 'Enable module'}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isActive ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    isActive ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* ── Bottom row: access levels + configure (only when active) ── */}
              {isActive && (
                <div className="border-t border-black/[0.06] bg-white/50 px-5 py-3 dark:border-white/[0.04] dark:bg-black/10">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {/* Managers access */}
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Managers</span>
                      <select
                        title={`${mod.label} — Managers access level`}
                        value={access.managers}
                        onChange={e => setAccess(mod.key, 'managers', e.target.value as AccessLevel)}
                        disabled={!canEdit}
                        className="h-7 rounded-lg border border-slate-200 bg-white pl-2 pr-6 text-xs font-semibold text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/30 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>

                    {/* Staff access */}
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Staff</span>
                      <select
                        title={`${mod.label} — Staff access level`}
                        value={access.staff}
                        onChange={e => setAccess(mod.key, 'staff', e.target.value as AccessLevel)}
                        disabled={!canEdit}
                        className="h-7 rounded-lg border border-slate-200 bg-white pl-2 pr-6 text-xs font-semibold text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/30 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>

                    <div className="flex-1" />

                    {/* Configure button */}
                    {configFields.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedConfig(isConfigOpen ? null : mod.key)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isConfigOpen
                            ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/50 dark:bg-violet-900/20 dark:text-violet-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-300'
                        }`}
                      >
                        <Sliders className="h-3.5 w-3.5" />
                        Configure
                        <svg className={`h-3 w-3 transition-transform duration-200 ${isConfigOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* ── Config panel ── */}
                  {isConfigOpen && configFields.length > 0 && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        {mod.label} — Settings
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {configFields.map((field) => {
                          const val = configMap[mod.key]?.[field.key] ?? ''
                          return (
                            <div key={field.key}>
                              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {field.label}
                              </label>
                              {field.type === 'select' ? (
                                <select
                                  title={field.label}
                                  value={val}
                                  onChange={e => setConfigValue(mod.key, field.key, e.target.value)}
                                  disabled={!canEdit}
                                  className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/30 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                >
                                  <option value="">Select…</option>
                                  {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <input
                                  type={field.type}
                                  value={val}
                                  onChange={e => setConfigValue(mod.key, field.key, e.target.value)}
                                  disabled={!canEdit}
                                  placeholder={field.placeholder}
                                  className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 placeholder-slate-300 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/30 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-600"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                        Configuration is saved per-device. Changes apply to this module immediately.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Save bar */}
      {canEdit && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-800/50">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeKeys.length === 0
              ? 'You must activate at least 1 module.'
              : `${activeKeys.length} module${activeKeys.length !== 1 ? 's' : ''} will be active after save.`}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || activeKeys.length === 0 || saved}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" />Saved!</>
            ) : saving ? (
              <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
            ) : (
              <><Save className="h-4 w-4" />Save Changes</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Şirket Profili Sekmesi (2B-11) ─────────────────────────────────────────

// ─── My Account Tab ─────────────────────────────────────────────────────────

function MyAccountTab() {
  const { user, refreshMe } = useAuth()
  const [copiedSlug, setCopiedSlug] = useState(false)

  // Profile form
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [department, setDepartment] = useState(user?.department ?? '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Password form
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function copySlug() {
    const slug = user?.tenant_slug ?? ''
    void navigator.clipboard.writeText(slug).then(() => {
      setCopiedSlug(true)
      setTimeout(() => setCopiedSlug(false), 2000)
    })
  }

  async function onProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    setProfileMsg(null)
    const patch: { full_name?: string | null; department?: string | null } = {}
    if (fullName.trim() !== (user?.full_name?.trim() ?? '')) patch.full_name = fullName.trim() || null
    if (department.trim() !== (user?.department?.trim() ?? '')) patch.department = department.trim() || null
    if (Object.keys(patch).length === 0) { setProfileMsg({ ok: false, text: 'No changes to save.' }); return }
    setProfileBusy(true)
    try {
      await updateMe(patch)
      await refreshMe()
      setProfileMsg({ ok: true, text: 'Profile updated.' })
    } catch (err: unknown) {
      setProfileMsg({ ok: false, text: getApiErrorMessage(err, 'Update failed.') })
    } finally { setProfileBusy(false) }
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentPw || !newPw) { setPwMsg({ ok: false, text: 'Fill in both password fields.' }); return }
    setPwBusy(true); setPwMsg(null)
    try {
      await changeOwnPassword({ current_password: currentPw, new_password: newPw })
      setCurrentPw(''); setNewPw('')
      setPwMsg({ ok: true, text: 'Password changed successfully.' })
    } catch (err: unknown) {
      setPwMsg({ ok: false, text: getApiErrorMessage(err, 'Password change failed.') })
    } finally { setPwBusy(false) }
  }

  const avatarChar = (user?.full_name || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <div className="space-y-6">
      {/* Account header */}
      <div className="rounded-2xl border border-ui-border-sub bg-ui-surface p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white shadow-lg">
            {avatarChar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ui-text">{user?.full_name || '—'}</div>
            <div className="truncate text-sm text-ui-muted">{user?.email}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {user?.role ?? 'user'}
              </span>
              {user?.department && (
                <span className="rounded-full bg-ui-surface-2 px-2.5 py-0.5 text-xs text-ui-muted">
                  {user.department}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Company code */}
      {user?.tenant_slug && (
        <div className="rounded-2xl border border-ui-border-sub bg-ui-surface p-6">
          <h2 className="mb-1 text-sm font-semibold text-ui-text">Company Code</h2>
          <p className="mb-3 text-xs text-ui-muted">Share this code with employees so they can log in.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-xl border border-ui-border bg-ui-surface-2 px-3 py-2.5 font-mono text-sm font-semibold text-ui-text">
              {user.tenant_slug}
            </code>
            <button
              type="button"
              onClick={copySlug}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ui-border bg-ui-surface-2 text-ui-muted transition hover:bg-ui-accent/10 hover:text-ui-accent active:scale-95"
              title="Copy"
            >
              {copiedSlug ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Profile edit */}
      <div className="rounded-2xl border border-ui-border-sub bg-ui-surface p-6">
        <h2 className="mb-1 text-sm font-semibold text-ui-text flex items-center gap-2">
          <User className="h-4 w-4 text-ui-muted" /> Profile
        </h2>
        <p className="mb-4 text-xs text-ui-muted">Update your display name and department.</p>
        <form onSubmit={(e) => void onProfileSubmit(e)} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-ui-muted block mb-1" htmlFor="ma-name">Full Name</label>
            <input id="ma-name" type="text" className={inputFieldClass} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="text-xs font-medium text-ui-muted block mb-1" htmlFor="ma-dept">Department</label>
            <input id="ma-dept" type="text" className={inputFieldClass} value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Sales" />
          </div>
          {profileMsg && (
            <p className={`sm:col-span-2 text-sm ${profileMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {profileMsg.text}
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={profileBusy} className={primaryButtonClass}>
              <Save className="mr-1.5 h-4 w-4" />
              {profileBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      {/* Password change */}
      <div className="rounded-2xl border border-ui-border-sub bg-ui-surface p-6">
        <h2 className="mb-1 text-sm font-semibold text-ui-text flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-ui-muted" /> Change Password
        </h2>
        <p className="mb-4 text-xs text-ui-muted">Use a strong password with uppercase letters and numbers.</p>
        <form onSubmit={(e) => void onPasswordSubmit(e)} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-ui-muted block mb-1" htmlFor="ma-cpw">Current Password</label>
            <input id="ma-cpw" type="password" autoComplete="current-password" className={inputFieldClass} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" />
          </div>
          <div>
            <label className="text-xs font-medium text-ui-muted block mb-1" htmlFor="ma-npw">New Password</label>
            <input id="ma-npw" type="password" autoComplete="new-password" className={inputFieldClass} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 8 chars, 1 uppercase, 1 digit" />
          </div>
          {pwMsg && (
            <p className={`sm:col-span-2 text-sm ${pwMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {pwMsg.text}
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={pwBusy} className={primaryButtonClass}>
              <Lock className="mr-1.5 h-4 w-4" />
              {pwBusy ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CompanyProfileTab() {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [form, setForm] = useState<CompanyProfile>({ name: '', address: '', phone: '', tax_number: '', bank_info: '', logo_url: '' })
  const [busy, setBusy] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [logoErr, setLogoErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchCompanyProfile()
      .then((p) => { setProfile(p); setForm(p) })
      .catch(() => {})
  }, [])

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true); setLogoErr(null)
    try {
      const url = await uploadCompanyLogo(file)
      setForm(f => ({ ...f, logo_url: url }))
    } catch (e: unknown) {
      setLogoErr(getApiErrorMessage(e, 'Logo could not be loaded.'))
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setOk(null); setErr(null)
    try {
      const updated = await patchCompanyProfile(form)
      setProfile(updated)
      setActiveLocale(updated.currency, updated.language)
      setOk(t('settings.saved'))
    } catch (e: unknown) {
      setErr(getApiErrorMessage(e, 'Save failed.'))
    } finally {
      setBusy(false)
    }
  }

  if (!profile) return <p className="text-sm text-slate-400 py-6 text-center">{t("common.loading")}</p>

  const field = (id: string, label: string, key: keyof CompanyProfile, multiline?: boolean) => (
    <div key={id}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          className={inputFieldClass}
          value={(form[key] as string) ?? ''}
          onChange={e => setForm({ ...form, [key]: e.target.value })}
        />
      ) : (
        <input
          id={id}
          type="text"
          className={inputFieldClass}
          value={(form[key] as string) ?? ''}
          onChange={e => setForm({ ...form, [key]: e.target.value })}
        />
      )}
    </div>
  )

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('settings.company')}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('settings.companyHint')}</p>
      </div>

      {/* Logo yükleme */}
      <div className="flex items-center gap-5">
        <div className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
          {form.logo_url ? (
            <img src={form.logo_url} alt="Company logo" className="h-full w-full object-contain p-1" />
          ) : (
            <span className="text-2xl text-slate-300 dark:text-slate-600 select-none">🏢</span>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('settings.logo')}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('settings.logoHint')}</p>
          <button
            type="button"
            disabled={logoUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {logoUploading ? t('common.loading') : t('settings.selectLogo')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            title="Select company logo"
            onChange={onLogoChange}
          />
          {logoErr && <p className="text-xs text-rose-600 dark:text-rose-400">{logoErr}</p>}
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        {field('cp-name', t('settings.companyName'), 'name')}
        {field('cp-phone', t('common.phone'), 'phone')}
        {field('cp-tax', t('settings.taxNumber'), 'tax_number')}
        <div />
        {/* C: Para birimi + dil — global iş temeli */}
        <div>
          <label htmlFor="cp-currency" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('settings.currency')}</label>
          <select
            id="cp-currency"
            className={inputFieldClass}
            value={form.currency ?? 'TRY'}
            onChange={e => setForm({ ...form, currency: e.target.value })}
          >
            {(profile.supported_currencies ?? ['TRY']).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div />
        <div className="sm:col-span-2">
          {field('cp-address', t('settings.address'), 'address', true)}
        </div>
        <div className="sm:col-span-2">
          {field('cp-bank', t('settings.bankInfo'), 'bank_info', true)}
        </div>
        {ok && <p className="sm:col-span-2 text-sm text-emerald-600 dark:text-emerald-400">{ok}</p>}
        {err && <p className="sm:col-span-2 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
        <div className="sm:col-span-2 flex justify-end">
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            <Save className="mr-1.5 h-4 w-4" />
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Sayfa girişi ────────────────────────────────────────────────────────────

type SettingsTab = "modules" | "profile" | "account"

export default function SettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<SettingsTab>("account")

  if (user?.role === "admin") {
    return <AdminPlatformSettings />
  }

  const isManager = user?.role === "manager" || user?.role_kind === "owner"

  const tabs: { id: SettingsTab; label: string; icon: typeof Store }[] = [
    { id: "account",  label: "My Account", icon: User },
    ...(isManager ? [
      { id: "modules" as SettingsTab,  label: t("moduleStore.tabQuick"),   icon: Sliders },
      { id: "profile" as SettingsTab,  label: t("moduleStore.tabCompany"), icon: Building2 },
    ] : []),
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Sekme başlıkları */}
      <div className="border-b border-slate-200 dark:border-white/10">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Ayarlar sekmeleri">
          {tabs.map((tabItem) => {
            const TabIcon = tabItem.icon
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setTab(tabItem.id)}
                className={[
                  "flex shrink-0 items-center gap-1.5 px-3 pb-3 text-sm font-medium transition border-b-2",
                  tab === tabItem.id
                    ? "border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                ].join(" ")}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {tabItem.label}
              </button>
            )
          })}
        </nav>
      </div>

      {tab === "account"  && <MyAccountTab />}
      {isManager && tab === "modules"  && <CompanyModuleSettings />}
      {isManager && tab === "profile"  && <CompanyProfileTab />}
    </div>
  )
}
