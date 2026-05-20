import {
  Bell,
  BellOff,
  Brain,
  Building2,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Package,
  RefreshCw,
  Save,
  ShoppingCart,
  Sliders,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import { LoadingState } from "../components/ui/LoadingState";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import {
  fetchActiveModules,
  fetchOnboardingConfig,
  getApiErrorMessage,
  patchActiveModules,
  type ModuleInfo,
} from "../lib/api";

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

  const setToastMuted = (v: boolean) => {
    setToastMutedState(v);
    try {
      localStorage.setItem(TOAST_MUTE_KEY, v ? "1" : "0");
    } catch {
      /* */
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Platform Ayarları
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Platform yöneticisi hesap ve bildirim tercihlerinizi yönetin.
        </p>
      </div>

      {/* Profil Bilgileri */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16122b]">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Hesap Bilgileri
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-700 text-xl font-bold text-white shadow-lg shadow-red-500/25">
            {(user?.full_name?.trim() || user?.email || "A").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-900 dark:text-white">
              {user?.full_name?.trim() || "—"}
            </div>
            <div className="truncate text-sm text-slate-500 dark:text-slate-400">
              {user?.email}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                Platform Admin
              </span>
              {user?.tenant_name && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {user.tenant_name}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-950/20 dark:text-amber-300">
          Profil bilgilerini ve şifreyi değiştirmek için sistem yöneticisiyle iletişime geçin.
        </p>
      </div>

      {/* Bildirim Tercihleri */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16122b]">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Bildirim Tercihleri
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Platform bildirimleri yalnızca şirket geneli kritik stok özetlerini içerir; bireysel şirket uyarıları gösterilmez.
        </p>

        <div className="space-y-3">
          {/* Toast bildirim susturma */}
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/5 dark:bg-white/5">
            <div className="flex items-center gap-3">
              {toastMuted ? (
                <BellOff className="h-4 w-4 shrink-0 text-slate-400" />
              ) : (
                <Bell className="h-4 w-4 shrink-0 text-violet-500" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Anlık Bildirim Toastları
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {toastMuted ? "Toastlar susturuldu — sadece bildirim listesinde görünür" : "Yeni bildirimler ekranda anlık toast olarak gösterilir"}
                </div>
              </div>
            </div>
            <label className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center">
              <span className="sr-only">Toast bildirimlerini sustur</span>
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

      {/* Platform Yönetim Linkleri */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#16122b]">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Platform Yönetimi
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Şirket modüllerini ve kullanıcı yönetimini Admin panelinden yapılandırın.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              to: "/admin",
              icon: Users,
              label: "Tenant & Kullanıcı Yönetimi",
              desc: "Şirket ekleme, kullanıcı rolleri ve modül atamaları",
              color: "red",
            },
            {
              to: "/dashboard",
              icon: LayoutDashboard,
              label: "Platform Paneli",
              desc: "Tüm şirketlerin genel görünümü ve metrikleri",
              color: "rose",
            },
            {
              to: "/ai",
              icon: Brain,
              label: "AI Komuta Merkezi",
              desc: "Çapraz şirket AI içgörüleri ve anomali analizi",
              color: "amber",
            },
            {
              to: "/admin",
              icon: Sliders,
              label: "Modül Yönetimi",
              desc: "Her şirket için aktif modülleri Admin panelinden yapılandırın",
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

// ─── Şirket Modül Ayarları ───────────────────────────────────────────────────

const MODULE_ICONS: Record<string, typeof ShoppingCart> = {
  sales: ShoppingCart,
  inventory: Package,
  finance: Wallet,
  crm: Building2,
  suppliers: Truck,
  purchasing: ClipboardList,
  hr: UserCheck,
  ai: Brain,
};

const MODULE_COLORS: Record<string, string> = {
  sales: "violet",
  inventory: "blue",
  finance: "emerald",
  crm: "orange",
  suppliers: "cyan",
  purchasing: "indigo",
  hr: "pink",
  ai: "amber",
};

function moduleColorClasses(key: string, active: boolean) {
  const color = MODULE_COLORS[key] ?? "slate";
  if (active) {
    return {
      card: `border-${color}-400 bg-${color}-50 dark:border-${color}-500/50 dark:bg-${color}-900/20`,
      icon: `text-${color}-600 dark:text-${color}-400`,
      badge: `bg-${color}-100 text-${color}-700 dark:bg-${color}-900/50 dark:text-${color}-300`,
    };
  }
  return {
    card: "border-slate-200 bg-white opacity-60 hover:opacity-80 dark:border-slate-700 dark:bg-slate-800",
    icon: "text-slate-400",
    badge: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  };
}

function CompanyModuleSettings() {
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission("admin.users.write") || user?.role === "manager";

  const [allModules, setAllModules] = useState<ModuleInfo[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [currentSector, setCurrentSector] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchOnboardingConfig(), fetchActiveModules()])
      .then(([cfg, mods]) => {
        setAllModules(cfg.all_modules);
        setActiveKeys(mods.active_modules);
        setCurrentSector(mods.sector);
      })
      .catch((err) => setError(getApiErrorMessage(err, "Veriler yüklenemedi.")))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    if (!canEdit) return;
    setActiveKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setSaved(false);
  }

  async function handleSave() {
    if (!canEdit || activeKeys.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await patchActiveModules({ active_modules: activeKeys });
      setSaved(true);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError(getApiErrorMessage(err, "Kaydedilemedi. Tekrar deneyin."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  const SECTOR_LABELS: Record<string, string> = {
    retail: "Perakende / Market",
    restaurant: "Restoran / Kafe",
    service: "Hizmet Sektörü",
    production: "Üretim / Atölye",
    construction: "İnşaat / Müteahhit",
    other: "Diğer",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Modül Ayarları
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Şirketinizin ihtiyacına göre modülleri açıp kapatın. Değişiklikler anında uygulanır.
        </p>
      </div>

      {currentSector && (
        <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 dark:border-violet-500/30 dark:bg-violet-900/20">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-500 dark:text-violet-400">
              Aktif Sektör
            </p>
            <p className="mt-0.5 font-semibold text-violet-900 dark:text-violet-100">
              {SECTOR_LABELS[currentSector] ?? currentSector}
            </p>
          </div>
          <Link
            to="/onboarding"
            className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-900/40"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Sektörü Değiştir
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">
            Modüller{" "}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {activeKeys.length} / {allModules.length} aktif
            </span>
          </h2>
          {!canEdit && (
            <span className="text-xs text-slate-400">
              Sadece yöneticiler değiştirebilir
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {allModules.map((mod) => {
            const isActive = activeKeys.includes(mod.key);
            const Icon = MODULE_ICONS[mod.key] ?? Zap;
            const colors = moduleColorClasses(mod.key, isActive);

            return (
              <button
                key={mod.key}
                type="button"
                onClick={() => toggle(mod.key)}
                disabled={!canEdit}
                className={`flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${colors.card} ${
                  canEdit ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    isActive
                      ? "bg-white/80 dark:bg-white/10"
                      : "bg-slate-100 dark:bg-slate-700"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${colors.icon}`} strokeWidth={2} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {mod.label}
                    </span>
                    {mod.key === "ai" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        AI
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                    {mod.description}
                  </p>
                </div>

                <div
                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    isActive
                      ? "border-violet-500 bg-violet-500"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {isActive && (
                    <svg
                      className="h-full w-full text-white"
                      fill="none"
                      viewBox="0 0 20 20"
                    >
                      <path
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 10l4 4 6-6"
                      />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-6 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeKeys.length === 0
              ? "En az 1 modül seçmelisiniz."
              : `${activeKeys.length} modül aktif olacak.`}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || activeKeys.length === 0 || saved}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saved ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Kaydedildi
              </>
            ) : saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Kaydediliyor…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Değişiklikleri Kaydet
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sayfa girişi ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();

  if (user?.role === "admin") {
    return <AdminPlatformSettings />;
  }

  return <CompanyModuleSettings />;
}
