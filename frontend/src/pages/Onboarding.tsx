import { useEffect, useState } from "react";
import { LogOut, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  fetchOnboardingConfig,
  postOnboardingSetup,
  getApiErrorMessage,
  type OnboardingConfigResponse,
  type SectorInfo,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";

// Sektör ikonları (Lucide alternatifi — SVG inline)
const SECTOR_EMOJIS: Record<string, string> = {
  retail: "🛒",
  restaurant: "☕",
  service: "💼",
  production: "🏭",
  construction: "🏗️",
  other: "⚙️",
};

const MODULE_EMOJIS: Record<string, string> = {
  sales: "🛍️",
  inventory: "📦",
  finance: "📈",
  crm: "👥",
  suppliers: "🚚",
  purchasing: "📋",
  hr: "👤",
  ai: "⚡",
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { refreshMe, logout } = useAuth();

  async function handleBackToLogin() {
    await logout();
    navigate("/login", { replace: true });
  }
  // Backend sektör/modül etiketleri TR gelir; mevcutsa i18n çevirisini, yoksa backend metnini kullan.
  const sectorLabel = (key: string, fallback: string) => t(`onboarding.sector.${key}`, { defaultValue: fallback });
  const sectorDesc = (key: string, fallback: string) => t(`onboarding.sectorDesc.${key}`, { defaultValue: fallback });
  const moduleLabel = (key: string, fallback: string) => t(`onboarding.module.${key}`, { defaultValue: fallback });
  const moduleDesc = (key: string, fallback: string) => t(`onboarding.moduleDesc.${key}`, { defaultValue: fallback });
  const [config, setConfig] = useState<OnboardingConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [currency, setCurrency] = useState("TRY");
  const [language, setLanguage] = useState("tr");
  const [step, setStep] = useState<1 | 2>(1); // 1: sektör seç, 2: modül özelleştir

  useEffect(() => {
    fetchOnboardingConfig()
      .then((cfg) => {
        setConfig(cfg);
        setCurrency(cfg.currency || "TRY");
        setLanguage(cfg.language || "tr");
        if (cfg.current_sector) {
          setSelectedSector(cfg.current_sector);
          setSelectedModules(cfg.current_modules);
        }
      })
      .catch((err) => setError(getApiErrorMessage(err, t("onboarding.configLoadError"))))
      .finally(() => setLoading(false));
  }, [t]);

  function handleSectorSelect(sector: SectorInfo) {
    setSelectedSector(sector.key);
    setSelectedModules([...sector.default_modules]);
  }

  function toggleModule(key: string) {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  async function handleFinish() {
    if (!selectedSector || selectedModules.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await postOnboardingSetup({
        sector: selectedSector,
        active_modules: selectedModules,
        currency,
        language,
      });
      await refreshMe();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, t("onboarding.saveError")));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-500">{t("onboarding.loading")}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">{error ?? t("onboarding.configLoadError")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-10 px-4">
      <div className="mx-auto max-w-4xl">
        {/* Back to login */}
        <div className="mb-4 flex justify-start">
          <button
            type="button"
            onClick={() => void handleBackToLogin()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition"
          >
            <LogOut className="h-4 w-4" />
            Back to login
          </button>
        </div>

        {/* Başlık */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            ⚡ {t("onboarding.welcome")}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t("onboarding.welcomeSub")}
          </p>

          {/* Adım göstergesi */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${step >= 1 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step >= 1 ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
                1
              </div>
              <span className="text-sm font-medium">{t("onboarding.step1")}</span>
            </div>
            <div className="h-px w-16 bg-gray-300" />
            <div className={`flex items-center gap-2 ${step >= 2 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step >= 2 ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
                2
              </div>
              <span className="text-sm font-medium">{t("onboarding.step2")}</span>
            </div>
          </div>
        </div>

        {/* Hata */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Adım 1: Sektör Seçimi */}
        {step === 1 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                {t("onboarding.selectSector")}
              </h2>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("erp:open-copilot", { detail: { text: "Which modules should I use for my business?", autoSend: true } }))}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask AI for help
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {config.sectors.map((sector) => (
                <button
                  type="button"
                  key={sector.key}
                  onClick={() => handleSectorSelect(sector)}
                  className={`rounded-xl border-2 p-5 text-left transition-all hover:shadow-md ${
                    selectedSector === sector.key
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30"
                      : "border-gray-200 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800"
                  }`}
                >
                  <div className="mb-2 text-3xl">{SECTOR_EMOJIS[sector.key] ?? "🏢"}</div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{sectorLabel(sector.key, sector.label)}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{sectorDesc(sector.key, sector.description)}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {sector.default_modules.slice(0, 4).map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      >
                        {MODULE_EMOJIS[m]} {m}
                      </span>
                    ))}
                    {sector.default_modules.length > 4 && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        +{sector.default_modules.length - 4}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                disabled={!selectedSector}
                onClick={() => setStep(2)}
                className="rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("onboarding.continue")}
              </button>
            </div>
          </div>
        )}

        {/* Adım 2: Modül Özelleştirme */}
        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                {t("onboarding.selectModules")}
              </h2>
              <span className="text-sm text-gray-500">
                {t("onboarding.modulesActive", { count: selectedModules.length })}
              </span>
            </div>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              {t("onboarding.modulesHint")}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {config.all_modules.map((mod) => {
                const isSelected = selectedModules.includes(mod.key);
                const isAI = mod.key === "ai";
                return (
                  <button
                    type="button"
                    key={mod.key}
                    onClick={() => toggleModule(mod.key)}
                    className={`flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                        : "border-gray-200 bg-white opacity-60 hover:opacity-90 dark:border-gray-700 dark:bg-gray-800"
                    }`}
                  >
                    <div className="mt-0.5 text-2xl">{MODULE_EMOJIS[mod.key] ?? "📌"}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {moduleLabel(mod.key, mod.label)}
                        </span>
                        {isAI && (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                            AI
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {moduleDesc(mod.key, mod.description)}
                      </p>
                    </div>
                    <div className={`mt-1 h-5 w-5 flex-shrink-0 rounded-full border-2 transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}>
                      {isSelected && (
                        <svg className="h-full w-full text-white" fill="none" viewBox="0 0 20 20">
                          <path stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M5 10l4 4 6-6" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* C: Para birimi + dil — global iş temeli */}
            <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">{t("onboarding.regionSettings")}</h3>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                {t("onboarding.regionHint")}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ob-currency" className="text-xs font-medium text-gray-600 dark:text-gray-400">{t("onboarding.currency")}</label>
                  <select
                    id="ob-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {config.supported_currencies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ob-language" className="text-xs font-medium text-gray-600 dark:text-gray-400">{t("onboarding.language")}</label>
                  <select
                    id="ob-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {config.supported_languages.map((l) => (
                      <option key={l} value={l}>{l === "tr" ? "Turkish" : l === "en" ? "English" : l}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t("onboarding.back")}
              </button>
              <button
                type="button"
                disabled={selectedModules.length === 0 || saving}
                onClick={handleFinish}
                className="rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? t("onboarding.saving") : t("onboarding.start")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
