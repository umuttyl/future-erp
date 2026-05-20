/**
 * Combined auth page — Login tab + 3-step Signup wizard.
 * Rendered by Login.tsx (initialTab="login") and Signup.tsx (initialTab="signup").
 */
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ClipboardList,
  Package,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import {
  AuthSplitLayout,
  authInputClass,
  authLinkClass,
  authPrimaryButtonClass,
  authSelectFieldClass,
} from "../components/auth/AuthSplitLayout";
import { useAuth } from "../context/AuthContext";
import { postOnboardingSetup } from "../lib/api";

// ---------------------------------------------------------------------------
// Static sector + module data (mirrors app/core/module_config.py)
// ---------------------------------------------------------------------------

const SECTORS = [
  {
    key: "retail",
    label: "Perakende / Market",
    emoji: "🛒",
    description: "Market, bakkal, giyim, elektronik mağazası",
    defaultModules: ["sales", "inventory", "finance", "crm", "suppliers", "purchasing", "ai"],
  },
  {
    key: "restaurant",
    label: "Restoran / Kafe",
    emoji: "☕",
    description: "Restoran, kafe, pastane, yemek işletmeleri",
    defaultModules: ["sales", "inventory", "finance", "suppliers", "ai"],
  },
  {
    key: "service",
    label: "Hizmet Sektörü",
    emoji: "💼",
    description: "Danışmanlık, temizlik, güzellik salonu, tamirhane",
    defaultModules: ["finance", "crm", "hr", "ai"],
  },
  {
    key: "production",
    label: "Üretim / Atölye",
    emoji: "🏭",
    description: "Küçük imalathane, atölye, montaj birimi",
    defaultModules: ["inventory", "purchasing", "finance", "suppliers", "hr", "ai"],
  },
  {
    key: "construction",
    label: "İnşaat / Müteahhit",
    emoji: "🏗️",
    description: "Müteahhit, tadilat, yapı malzemeleri",
    defaultModules: ["purchasing", "finance", "hr", "suppliers", "ai"],
  },
  {
    key: "other",
    label: "Diğer",
    emoji: "⚙️",
    description: "Sektörünüze uygun modülleri kendiniz seçin",
    defaultModules: ["sales", "inventory", "finance", "crm", "suppliers", "purchasing", "hr", "ai"],
  },
] as const;

type SectorKey = (typeof SECTORS)[number]["key"];

const MODULE_ICONS: Record<string, typeof ShoppingCart> = {
  sales: ShoppingCart,
  inventory: Package,
  finance: Wallet,
  crm: Users,
  suppliers: Truck,
  purchasing: ClipboardList,
  hr: UserCheck,
  ai: Brain,
};

const MODULES = [
  { key: "sales",     label: "Satış Yönetimi",      description: "Satış kayıtları, günlük ciro" },
  { key: "inventory", label: "Stok Takibi",          description: "Stok seviyeleri, kritik uyarılar" },
  { key: "finance",   label: "Finans",               description: "Gelir/gider, aylık trendler" },
  { key: "crm",       label: "Müşteri Yönetimi",     description: "Müşteri kayıtları, satış geçmişi" },
  { key: "suppliers", label: "Tedarikçi",            description: "Tedarikçi bilgileri, alım geçmişi" },
  { key: "purchasing",label: "Satınalma / Sipariş",  description: "Tedarik siparişleri, teslimat" },
  { key: "hr",        label: "İnsan Kaynakları",     description: "Çalışan bilgileri, performans" },
  { key: "ai",        label: "AI Asistan",           description: "Chatbot, anomali tespiti, tahmin" },
];

const DEPARTMENTS = [
  { value: "", label: "Seçiniz (isteğe bağlı)" },
  { value: "Yönetim", label: "Yönetim" },
  { value: "Satış", label: "Satış" },
  { value: "Finans", label: "Finans" },
  { value: "İnsan Kaynakları", label: "İnsan Kaynakları" },
  { value: "Tedarik", label: "Tedarik" },
  { value: "Bilişim (IT)", label: "Bilişim (IT)" },
] as const;

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
      {text}
    </div>
  );
}

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all ${
              i + 1 < step
                ? "bg-violet-600 text-white"
                : i + 1 === step
                ? "bg-violet-600 text-white ring-4 ring-violet-600/20"
                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            }`}
          >
            {i + 1 < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-0.5 w-8 rounded-full transition-all ${
                i + 1 < step ? "bg-violet-600" : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
        {step === 1 && "Şirket Bilgileri"}
        {step === 2 && "Sektör Seçimi"}
        {step === 3 && "Modül Seçimi"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab toggle
// ---------------------------------------------------------------------------

type Tab = "login" | "signup";

function TabSwitcher({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="mb-6 flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800/60">
      {(["login", "signup"] as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
            active === t
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {t === "login" ? "Giriş Yap" : "Kayıt Ol"}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

const DEMO_ACCOUNTS = [
  { slug: 'default',        email: 'admin@demo.example.com',        label: 'Platform Admin',  role: 'Admin',   pw: 'Admin12345' },
  { slug: 'default',        email: 'manager@demo.example.com',      label: 'Retail Müdürü',   role: 'Manager', pw: 'Manager12345' },
  { slug: 'default',        email: 'employee@demo.example.com',     label: 'Çalışan',         role: 'Employee',pw: 'Employee12345' },
  { slug: 'lezzet-dunyasi', email: 'restaurant@demo.example.com',   label: 'Restoran Müdürü', role: 'Manager', pw: 'Manager12345' },
  { slug: 'tekno-cozumler', email: 'service@demo.example.com',      label: 'Hizmet Müdürü',   role: 'Manager', pw: 'Manager12345' },
  { slug: 'makine-pro',     email: 'production@demo.example.com',   label: 'Üretim Müdürü',   role: 'Manager', pw: 'Manager12345' },
  { slug: 'insaat-as',      email: 'construction@demo.example.com', label: 'İnşaat Müdürü',   role: 'Manager', pw: 'Manager12345' },
] as const;

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [tenantSlug, setTenantSlug] = useState("default");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login({
        tenant_slug: tenantSlug.trim() || "default",
        email: email.trim(),
        password,
      });
      navigate(from, { replace: true });
    } catch {
      /* error shown via context */
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(acc: typeof DEMO_ACCOUNTS[number]) {
    setTenantSlug(acc.slug);
    setEmail(acc.email);
    setPassword(acc.pw);
    setDemoOpen(false);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {import.meta.env.DEV && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 dark:border-indigo-500/20 dark:bg-indigo-950/40">
          <button
            type="button"
            onClick={() => setDemoOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-indigo-800 dark:text-indigo-200"
          >
            Demo hesaplar — tıkla ve otomatik doldur
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${demoOpen ? 'rotate-180' : ''}`} />
          </button>
          {demoOpen && (
            <div className="border-t border-indigo-100 px-2 pb-2 dark:border-indigo-500/20">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-indigo-100/80 dark:hover:bg-indigo-900/40"
                >
                  <span className="min-w-[120px] text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">{acc.label}</span>
                  <span className="font-mono text-[10px] text-indigo-600/80 dark:text-indigo-400/80">{acc.email}</span>
                  <span className="ml-auto font-mono text-[10px] text-indigo-400">·{acc.slug}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="login-tenant">
          Şirket kodu
        </label>
        <input
          id="login-tenant"
          className={authInputClass}
          autoComplete="organization"
          value={tenantSlug}
          onChange={(e) => setTenantSlug(e.target.value)}
          placeholder="default"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="login-email">
          E-posta
        </label>
        <input
          id="login-email"
          type="email"
          required
          className={authInputClass}
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="login-password">
          Şifre
        </label>
        <input
          id="login-password"
          type="password"
          required
          className={authInputClass}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <ErrorBox text={error} />}

      <button type="submit" disabled={busy} className={authPrimaryButtonClass}>
        {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Hesabınız yok mu?{" "}
        <button type="button" onClick={onSwitch} className={authLinkClass}>
          Kayıt ol
        </button>
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Signup wizard
// ---------------------------------------------------------------------------

function SignupWizard({ onSwitch }: { onSwitch: () => void }) {
  const { signup, error, refreshMe } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Step 1 fields
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: sector
  const [sector, setSector] = useState<SectorKey | null>(null);

  // Step 3: modules
  const [activeModules, setActiveModules] = useState<string[]>([]);

  function goToSectorStep() {
    if (!orgName.trim() || !fullName.trim() || !email.trim() || password.length < 8) {
      setLocalError("Lütfen tüm zorunlu alanları doldurun (şifre en az 8 karakter).");
      return;
    }
    setLocalError(null);
    setStep(2);
  }

  function selectSector(key: SectorKey) {
    setSector(key);
    const found = SECTORS.find((s) => s.key === key);
    setActiveModules(found ? [...found.defaultModules] : []);
  }

  function goToModuleStep() {
    if (!sector) {
      setLocalError("Lütfen bir sektör seçin.");
      return;
    }
    setLocalError(null);
    setStep(3);
  }

  function toggleModule(key: string) {
    setActiveModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (activeModules.length === 0) {
      setLocalError("En az bir modül seçmelisiniz.");
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      await signup({
        organization_name: orgName.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        department: department || undefined,
      });
      // Tokens are now saved — call onboarding setup
      await postOnboardingSetup({
        sector: sector!,
        active_modules: activeModules,
      });
      await refreshMe();
      navigate("/dashboard", { replace: true });
    } catch {
      /* errors shown via context.error or localError */
    } finally {
      setBusy(false);
    }
  }

  const displayError = localError ?? error;

  // --- Step 1: Company info ---
  if (step === 1) {
    return (
      <div className="space-y-4">
        <StepIndicator step={1} total={3} />
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-org">
            Şirket / Organizasyon adı <span className="text-red-500">*</span>
          </label>
          <input
            id="sg-org"
            required
            minLength={2}
            className={authInputClass}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Future Teknoloji A.Ş."
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-name">
            Ad soyad <span className="text-red-500">*</span>
          </label>
          <input
            id="sg-name"
            required
            className={authInputClass}
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ahmet Yılmaz"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-dept">
            Departman
          </label>
          <div className="relative mt-1.5">
            <select
              id="sg-dept"
              className={authSelectFieldClass}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.value || "none"} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-email">
            E-posta <span className="text-red-500">*</span>
          </label>
          <input
            id="sg-email"
            type="email"
            required
            className={authInputClass}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@sirket.com"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-pass">
            Şifre <span className="text-red-500">*</span>
          </label>
          <input
            id="sg-pass"
            type="password"
            required
            minLength={8}
            className={authInputClass}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-400">En az 8 karakter, bir büyük harf ve bir rakam.</p>
        </div>

        {displayError && <ErrorBox text={displayError} />}

        <button
          type="button"
          onClick={goToSectorStep}
          className={authPrimaryButtonClass + " flex items-center justify-center gap-2"}
        >
          Devam Et
          <ArrowRight className="h-4 w-4" />
        </button>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Zaten hesabınız var mı?{" "}
          <button type="button" onClick={onSwitch} className={authLinkClass}>
            Giriş yap
          </button>
        </p>
      </div>
    );
  }

  // --- Step 2: Sector selection ---
  if (step === 2) {
    return (
      <div className="space-y-4">
        <StepIndicator step={2} total={3} />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          İşletmenizin sektörünü seçin. Modüller otomatik olarak önerilecek, dilediğinizde değiştirebilirsiniz.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {SECTORS.map((s) => {
            const isSelected = sector === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => selectSector(s.key)}
                className={`flex flex-col gap-1.5 rounded-xl border-2 p-3 text-left transition-all ${
                  isSelected
                    ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-900/20"
                    : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-violet-500/50"
                }`}
              >
                <span className="text-xl">{s.emoji}</span>
                <span className={`text-xs font-semibold ${isSelected ? "text-violet-800 dark:text-violet-200" : "text-slate-700 dark:text-slate-200"}`}>
                  {s.label}
                </span>
                <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                  {s.description}
                </span>
                {isSelected && (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                    <Check className="h-3 w-3" /> Seçildi
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {displayError && <ErrorBox text={displayError} />}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Geri
          </button>
          <button
            type="button"
            onClick={goToModuleStep}
            className={authPrimaryButtonClass.replace("w-full", "flex-[2]") + " flex items-center justify-center gap-2"}
          >
            Devam Et
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // --- Step 3: Module customization ---
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <StepIndicator step={3} total={3} />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Sektörünüze göre modüller seçildi. İstediğiniz modülleri açıp kapatabilirsiniz.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {MODULES.map((mod) => {
          const Icon = MODULE_ICONS[mod.key] ?? Zap;
          const isActive = activeModules.includes(mod.key);
          return (
            <button
              key={mod.key}
              type="button"
              onClick={() => toggleModule(mod.key)}
              className={`flex items-start gap-2 rounded-xl border-2 p-2.5 text-left transition-all ${
                isActive
                  ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-violet-900/20"
                  : "border-slate-200 bg-white opacity-60 hover:opacity-80 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800"
              }`}
            >
              <div className={`mt-0.5 rounded-lg p-1.5 ${isActive ? "bg-violet-100 dark:bg-violet-800/40" : "bg-slate-100 dark:bg-slate-700"}`}>
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-violet-600 dark:text-violet-300" : "text-slate-400"}`} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className={`text-[11px] font-semibold ${isActive ? "text-violet-800 dark:text-violet-200" : "text-slate-700 dark:text-slate-300"}`}>
                  {mod.label}
                </div>
                <div className="mt-0.5 text-[10px] leading-tight text-slate-400 dark:text-slate-500">
                  {mod.description}
                </div>
              </div>
              <div className={`ml-auto mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${isActive ? "border-violet-500 bg-violet-500" : "border-slate-300 dark:border-slate-600"}`}>
                {isActive && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </div>
            </button>
          );
        })}
      </div>

      {activeModules.length === 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">En az bir modül seçmelisiniz.</p>
      )}

      {displayError && <ErrorBox text={displayError} />}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStep(2)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </button>
        <button
          type="submit"
          disabled={busy || activeModules.length === 0}
          className={authPrimaryButtonClass.replace("w-full", "flex-[2]") + " flex items-center justify-center gap-2"}
        >
          {busy ? "Hesap oluşturuluyor…" : "Hesabı Oluştur"}
          {!busy && <Check className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function AuthPage({ initialTab }: { initialTab: Tab }) {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);

  if (loading) {
    return (
      <AuthSplitLayout cardTitle="Yükleniyor" cardDescription="Oturum bilgileri kontrol ediliyor…" cardWide>
        <div className="mt-8 flex justify-center py-10">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400"
            role="status"
            aria-label="Yükleniyor"
          />
        </div>
      </AuthSplitLayout>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  const cardTitle = tab === "login" ? "Hesabınıza giriş yapın" : "Yeni hesap oluşturun";
  const cardDescription =
    tab === "login"
      ? "Şirket kodunuz ve hesap bilgilerinizle devam edin."
      : "Birkaç adımda şirketinizi sisteme ekleyin.";

  return (
    <AuthSplitLayout cardTitle={cardTitle} cardDescription={cardDescription} cardWide>
      <div className="mt-6">
        <TabSwitcher active={tab} onChange={setTab} />
        {tab === "login" ? (
          <LoginForm onSwitch={() => setTab("signup")} />
        ) : (
          <SignupWizard onSwitch={() => setTab("login")} />
        )}
      </div>
    </AuthSplitLayout>
  );
}
