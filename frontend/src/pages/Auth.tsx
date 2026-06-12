/**
 * Combined auth page — Login tab + 3-step Signup wizard.
 * Rendered by Login.tsx (initialTab="login") and Signup.tsx (initialTab="signup").
 */
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Rocket,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  AuthSplitLayout,
  authInputClass,
  authLinkClass,
  authPrimaryButtonClass,
} from "../components/auth/AuthSplitLayout";
import { useAuth } from "../context/AuthContext";
import { forgotPassword, resetPassword } from "../lib/api";


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

const STEP_LABEL_KEYS = ["auth.stepAccount", "auth.stepBusiness", "auth.stepScale", "auth.stepReady"];

function StepIndicator({ step }: { step: number }) {
  const { t } = useTranslation();
  const total = 4;
  return (
    <div className="mb-5 flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
              i + 1 < step
                ? "bg-violet-600 text-white"
                : i + 1 === step
                ? "bg-violet-600 text-white ring-4 ring-violet-600/20"
                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            }`}
          >
            {i + 1 < step ? <Check className="h-3 w-3" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-6 rounded-full transition-all ${i + 1 < step ? "bg-violet-600" : "bg-slate-200 dark:bg-slate-700"}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs font-medium text-violet-600 dark:text-violet-400">
        {t(STEP_LABEL_KEYS[step - 1])}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forgot / Reset password panels
// ---------------------------------------------------------------------------

function ForgotPasswordPanel({ onBack }: { onBack: () => void }) {
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await forgotPassword({ tenant_slug: tenantSlug.trim(), email: email.trim() });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
          <Check className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Check your inbox</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          If that email exists in our system, we've sent a reset link. Check your spam folder too.
        </p>
        <button type="button" onClick={onBack} className={authLinkClass + " flex items-center justify-center gap-1"}>
          <ArrowLeft className="h-3 w-3" /> Back to login
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Enter your company name and email and we'll send you a reset link.
        </p>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="fp-tenant">
          Company Name <span className="text-slate-400">(leave blank for platform admin)</span>
        </label>
        <input id="fp-tenant" className={authInputClass} value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} placeholder="" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="fp-email">
          Email <span className="text-red-500">*</span>
        </label>
        <input id="fp-email" type="email" required className={authInputClass} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">{error}</div>}
      <button type="submit" disabled={busy} className={authPrimaryButtonClass}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-xs">
        <button type="button" onClick={onBack} className={authLinkClass + " inline-flex items-center gap-1"}>
          <ArrowLeft className="h-3 w-3" /> Back to login
        </button>
      </p>
    </form>
  );
}

function ResetPasswordPanel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPwPassed = pwRules.every((r) => r.test(password));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allPwPassed) { setError("Password does not meet all requirements."); return; }
    setBusy(true);
    setError(null);
    try {
      await resetPassword({ token, new_password: password });
      setDone(true);
    } catch {
      setError("Invalid or expired reset link. Please request a new one.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
          <Check className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Password updated!</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">You can now log in with your new password.</p>
        <button type="button" onClick={() => navigate("/login", { replace: true })} className={authPrimaryButtonClass}>
          Go to login
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <p className="text-sm text-slate-600 dark:text-slate-400">Enter your new password below.</p>
      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="rp-pass">
          New Password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input id="rp-pass" type={showPassword ? "text" : "password"} required className={authInputClass + " pr-10"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {password.length > 0 && (
          <ul className="mt-2 space-y-1">
            {pwRules.map((rule) => {
              const ok = rule.test(password);
              return (
                <li key={rule.key} className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                  {ok ? <Check className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600" />}
                  {rule.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">{error}</div>}
      <button type="submit" disabled={busy} className={authPrimaryButtonClass}>
        {busy ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab toggle
// ---------------------------------------------------------------------------

type Tab = "login" | "signup";

function TabSwitcher({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800/60">
      {(["login", "signup"] as Tab[]).map((tabKey) => (
        <button
          key={tabKey}
          type="button"
          onClick={() => onChange(tabKey)}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
            active === tabKey
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {tabKey === "login" ? t("auth.tabLogin") : t("auth.tabSignup")}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

const DEMO_ACCOUNTS = [
  { slug: '', email: 'admin@demo.example.com', label: 'Platform Admin', role: 'Admin', pw: 'Admin12345' },
] as const;

function LoginForm({ onSwitch, onForgot }: { onSwitch: () => void; onForgot: () => void }) {
  const { t } = useTranslation();
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [busy, setBusy]             = useState(false);
  const [demoOpen, setDemoOpen]     = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login({
        tenant_slug: tenantSlug.trim(),   // boşsa backend platform admin dener
        email: email.trim(),
        password,
      });
      navigate(from, { replace: true });
    } catch {
      /* hata AuthContext üzerinden gösterilir */
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(acc: typeof DEMO_ACCOUNTS[number]) {
    // Platform Admin için slug boş bırak — backend otomatik algılar
    setTenantSlug(acc.role === 'Admin' ? '' : acc.slug);
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
            {t("auth.demoAccounts")}
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
                  <span className={`min-w-[120px] text-[10px] font-semibold ${acc.role === 'Admin' ? 'text-red-700 dark:text-red-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                    {t(`auth.demo.${acc.email.split('@')[0]}`, { defaultValue: acc.label })}
                  </span>
                  <span className="font-mono text-[10px] text-indigo-600/80 dark:text-indigo-400/80">{acc.email}</span>
                  {acc.role !== 'Admin' && <span className="ml-auto font-mono text-[10px] text-indigo-400">·{acc.slug}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="login-tenant">
          Company Name
        </label>
        <input
          id="login-tenant"
          className={authInputClass}
          autoComplete="organization"
          value={tenantSlug}
          onChange={(e) => setTenantSlug(e.target.value)}
          placeholder=""
        />
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Enter the name you used when signing up.
        </p>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="login-email">
          {t("common.email")}
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
          {t("auth.password")}
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
        {busy ? t("auth.loggingIn") : t("auth.login")}
      </button>

      <div className="flex items-center justify-between text-xs">
        <p className="text-slate-500 dark:text-slate-400">
          {t("auth.noAccount")}{" "}
          <button type="button" onClick={onSwitch} className={authLinkClass}>
            {t("auth.signup")}
          </button>
        </p>
        <button type="button" onClick={onForgot} className={authLinkClass}>
          Forgot password?
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Signup wizard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

const pwRules = [
  { key: "len",   label: "At least 8 characters",      test: (p: string) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter (A–Z)",  test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter (a–z)",  test: (p: string) => /[a-z]/.test(p) },
  { key: "num",   label: "One number (0–9)",            test: (p: string) => /[0-9]/.test(p) },
];

function passwordStrength(p: string): 0 | 1 | 2 | 3 {
  const passed = pwRules.filter((r) => r.test(p)).length;
  if (passed <= 1) return 0;
  if (passed === 2) return 1;
  if (passed === 3) return 2;
  return 3;
}

const strengthLabel  = ["Weak", "Fair", "Good", "Strong"];
const strengthColor  = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-500"];
const strengthText   = ["text-red-500", "text-orange-400", "text-yellow-500", "text-emerald-600"];

function SignupWizard({ onSwitch }: { onSwitch: () => void }) {
  const { t } = useTranslation();
  const { signup, error } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [signupSlug, setSignupSlug] = useState("");
  const [copied, setCopied] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // touched flags — only show errors after user has interacted
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const emailError    = emailTouched && email && !isValidEmail(email);
  const allPwPassed   = pwRules.every((r) => r.test(password));
  const strength      = passwordStrength(password);
  const displayError  = localError ?? error;

  async function handleCreateAccount() {
    setEmailTouched(true);
    setPasswordTouched(true);

    if (!orgName.trim() || !fullName.trim()) {
      setLocalError("Please fill in all required fields.");
      return;
    }
    if (!isValidEmail(email)) {
      setLocalError("Please enter a valid email address.");
      return;
    }
    if (!allPwPassed) {
      setLocalError("Your password does not meet all requirements.");
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      const slug = await signup({
        organization_name: orgName.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim(),
      });
      setSignupSlug(slug);
      setStep(2);
    } catch {
      /* errors shown via context.error */
    } finally {
      setBusy(false);
    }
  }

  // --- Step 1: Account info ---
  if (step === 1) {
    return (
      <div className="space-y-4">
        {/* Company name */}
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-org">
            {t("auth.orgName")} <span className="text-red-500">*</span>
          </label>
          <input
            id="sg-org"
            required
            minLength={2}
            className={authInputClass}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={t("auth.orgPlaceholder")}
          />
        </div>

        {/* Full name */}
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-name">
            {t("auth.fullName")} <span className="text-red-500">*</span>
          </label>
          <input
            id="sg-name"
            required
            className={authInputClass}
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("auth.namePlaceholder")}
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-email">
            {t("auth.email")} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="sg-email"
              type="email"
              required
              className={authInputClass + (emailError ? " border-red-400 focus:border-red-500 focus:ring-red-200" : "")}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder="you@company.com"
            />
            {emailTouched && email && (
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${isValidEmail(email) ? "text-emerald-500" : "text-red-400"}`}>
                {isValidEmail(email) ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
            )}
          </div>
          {emailError && (
            <p className="mt-1 text-[11px] text-red-500">Please enter a valid email (e.g. name@company.com).</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="sg-pass">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="sg-pass"
              type={showPassword ? "text" : "password"}
              required
              className={authInputClass + " pr-10"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordTouched(true)}
              placeholder="Create a strong password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Strength bar — visible once user starts typing */}
          {password.length > 0 && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColor[strength] : "bg-slate-200 dark:bg-slate-700"}`}
                    />
                  ))}
                </div>
                <span className={`text-[11px] font-semibold ${strengthText[strength]}`}>
                  {strengthLabel[strength]}
                </span>
              </div>

              {/* Requirements checklist */}
              <ul className="space-y-1">
                {pwRules.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <li key={rule.key} className={`flex items-center gap-1.5 text-[11px] transition-colors ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                      {ok
                        ? <Check className="h-3 w-3 shrink-0" />
                        : <div className="h-3 w-3 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" />
                      }
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {displayError && <ErrorBox text={displayError} />}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCreateAccount()}
          className={authPrimaryButtonClass + " flex items-center justify-center gap-2"}
        >
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {t("auth.creatingAccount")}
            </>
          ) : (
            <>
              {t("auth.ready")}
              <Rocket className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {t("auth.haveAccount")}{" "}
          <button type="button" onClick={onSwitch} className={authLinkClass}>
            {t("auth.login")}
          </button>
        </p>
      </div>
    );
  }

  // --- Step 2: Company code + proceed to module setup ---
  function copySlug() {
    void navigator.clipboard.writeText(signupSlug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">{t("auth.accountCreated")}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Next: choose the modules for your business.</p>
          </div>
        </div>
      </div>

      {/* Company code — critical for employee login */}
      <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-4 dark:border-indigo-500/40 dark:bg-indigo-950/40">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
          Your Company Code
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold text-indigo-700 shadow-sm dark:bg-indigo-900/60 dark:text-indigo-200">
            {signupSlug}
          </code>
          <button
            type="button"
            onClick={copySlug}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
            title="Copy company code"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-indigo-600/80 dark:text-indigo-400/80">
          Employees need this code to log in. Save it somewhere safe.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        You can find your company code anytime in Settings → My Account.
      </div>

      <button
        type="button"
        onClick={() => navigate("/onboarding", { replace: true })}
        className={authPrimaryButtonClass + " flex items-center justify-center gap-2"}
      >
        <Rocket className="h-4 w-4" />
        Set Up Modules →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function AuthPage({ initialTab }: { initialTab: Tab }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showForgot, setShowForgot] = useState(false);
  const [searchParams] = useSearchParams();
  const isReset = searchParams.has("token");

  if (loading) {
    return (
      <AuthSplitLayout cardTitle={t("common.loading")} cardDescription="" cardWide>
        <div className="mt-8 flex justify-center py-10">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400"
            role="status"
            aria-label={t("common.loading")}
          />
        </div>
      </AuthSplitLayout>
    );
  }

  if (user && !isReset) return <Navigate to="/dashboard" replace />;

  if (isReset) {
    return (
      <AuthSplitLayout cardTitle="Set new password" cardDescription="" cardWide>
        <div className="mt-6">
          <ResetPasswordPanel />
        </div>
      </AuthSplitLayout>
    );
  }

  if (showForgot) {
    return (
      <AuthSplitLayout cardTitle="Forgot your password?" cardDescription="" cardWide>
        <div className="mt-6">
          <ForgotPasswordPanel onBack={() => setShowForgot(false)} />
        </div>
      </AuthSplitLayout>
    );
  }

  const cardTitle = tab === "login" ? t("auth.loginTitle") : t("auth.signupTitle");
  const cardDescription = tab === "login" ? t("auth.loginSubtitle") : t("auth.signupSubtitle");

  return (
    <AuthSplitLayout cardTitle={cardTitle} cardDescription={cardDescription} cardWide>
      <div className="mt-6">
        <TabSwitcher active={tab} onChange={setTab} />
        {tab === "login" ? (
          <LoginForm onSwitch={() => setTab("signup")} onForgot={() => setShowForgot(true)} />
        ) : (
          <SignupWizard onSwitch={() => setTab("login")} />
        )}
      </div>
    </AuthSplitLayout>
  );
}
