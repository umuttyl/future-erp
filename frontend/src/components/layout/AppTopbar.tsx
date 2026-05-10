import {
  CalendarDays,
  ChevronDown,
  LogOut,
  Moon,
  Search,
  SearchX,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { NavbarCalendarDropdown } from "./NavbarCalendarDropdown";
import { NotificationBell } from "./NotificationBell";

/** Sabit modül listesi — /satis vb. App.tsx ile gerçek rotalara yönlenir. */
const GLOBAL_SEARCH_MODULES: { name: string; path: string; tokens: string[] }[] = [
  { name: "Satış", path: "/satis", tokens: ["satış", "satis", "sales", "sipariş", "siparis"] },
  {
    name: "Finans",
    path: "/finans",
    tokens: ["finans", "finance", "muhasebe", "ciro", "ödeme", "odeme", "fatura"],
  },
  { name: "Stok", path: "/stok", tokens: ["stok", "stock", "envanter", "ürün", "urun", "sku", "depo"] },
  {
    name: "İnsan Kaynakları",
    path: "/hr",
    tokens: ["insan", "ik", "hr", "personel", "çalışan", "calisan", "maaş", "maas", "kaynak"],
  },
  { name: "AI Analiz", path: "/ai", tokens: ["ai", "analiz", "tahmin", "tahmini", "forecast"] },
  { name: "Panel", path: "/dashboard", tokens: ["panel", "dashboard", "ana sayfa", "anasayfa", "özet", "ozet"] },
  { name: "Yönetim", path: "/admin", tokens: ["yönetim", "yonetim", "admin", "ayar", "kullanıcı", "kullanici"] },
];

function moduleMatches(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return GLOBAL_SEARCH_MODULES.filter((m) => m.tokens.some((t) => q.includes(t)));
}

function moduleNavigateLabel(name: string) {
  return `${name} Modülüne Git`;
}

export function AppTopbar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout, hasPermission } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const calWrapRef = useRef<HTMLDivElement>(null);

  const displayName = user?.full_name?.trim() || user?.email || "Kullanıcı";
  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "";

  const matches = useMemo(() => moduleMatches(searchQuery), [searchQuery]);
  const qTrim = searchQuery.trim();

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (searchWrapRef.current && !searchWrapRef.current.contains(t)) {
        setSearchOpen(false);
      }
      if (menuWrapRef.current && !menuWrapRef.current.contains(t)) {
        setMenuOpen(false);
      }
      if (calWrapRef.current && !calWrapRef.current.contains(t)) {
        setCalOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-surface-border bg-surface-card/90 px-4 backdrop-blur-md dark:border-white/10 dark:bg-[#12101f]/90 md:px-8">
      <div ref={searchWrapRef} className="relative min-w-0 max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Ara… (ürün, müşteri, kayıt veya modül adı)"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          className="w-full rounded-full border border-surface-border bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-800 outline-none ring-violet-500/30 placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 dark:border-white/10 dark:bg-[#1a1628] dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {searchOpen && qTrim.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-lg dark:border-white/10 dark:bg-[#1a1628]">
            {matches.length > 0 ? (
              <>
                <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
                  Modüllere git
                </div>
                {matches.map((m) => (
                  <button
                    key={m.path}
                    type="button"
                    className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-slate-800 first:border-t-0 hover:bg-violet-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
                    onClick={() => {
                      setSearchOpen(false);
                      navigate(m.path);
                    }}
                  >
                    <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
                      Modül
                    </span>
                    {moduleNavigateLabel(m.name)}
                  </button>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/10">
                  <SearchX className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  İlgili kayıt bulunamadı
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Müşteri veya SKU araması henüz bağlı değil. Modül adı yazarak
                  (ör.{" "}
                  <strong className="text-slate-600 dark:text-slate-300">
                    satış
                  </strong>
                  ,{" "}
                  <strong className="text-slate-600 dark:text-slate-300">
                    stok
                  </strong>
                  ) ilgili sayfaya gidebilirsiniz.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label={theme === "dark" ? "Açık tema" : "Koyu tema"}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>
        <NotificationBell />
        <div ref={calWrapRef} className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setCalOpen((v) => !v)}
            className="flex h-10 items-center gap-2 rounded-full border border-surface-border px-3 text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            aria-expanded={calOpen ? "true" : "false"}
            aria-haspopup="dialog"
            aria-label="Takvim"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          {calOpen ? (
            <div
              className="absolute right-0 top-full z-50 mt-2"
              role="dialog"
              aria-label="Takvim"
            >
              <NavbarCalendarDropdown />
            </div>
          ) : null}
        </div>

        <div ref={menuWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-2xl border border-surface-border bg-slate-50 py-1.5 pl-1.5 pr-2 transition hover:bg-slate-100 dark:border-white/10 dark:bg-[#1a1628] dark:hover:bg-white/5"
            aria-expanded={menuOpen ? "true" : "false"}
            aria-haspopup="menu"
          >
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#1a1628]" />
            </div>
            <div className="hidden min-w-0 text-left sm:block">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {roleLabel}
              </div>
            </div>
            <ChevronDown
              className={`hidden h-4 w-4 text-slate-400 transition sm:block ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1628]"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/dashboard");
                }}
              >
                <User className="h-4 w-4 text-slate-400" />
                Hesabım
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-violet-50 dark:text-slate-100 dark:hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  if (hasPermission("admin.access")) navigate("/admin");
                  else navigate("/dashboard");
                }}
              >
                <Settings className="h-4 w-4 text-slate-400" />
                Ayarlar
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-white/10" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                <LogOut className="h-4 w-4" />
                Çıkış yap
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
