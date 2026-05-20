import { useEffect, useState } from "react";
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
  const { refreshMe } = useAuth();
  const [config, setConfig] = useState<OnboardingConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1); // 1: sektör seç, 2: modül özelleştir

  useEffect(() => {
    fetchOnboardingConfig()
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.current_sector) {
          setSelectedSector(cfg.current_sector);
          setSelectedModules(cfg.current_modules);
        }
      })
      .catch((err) => setError(getApiErrorMessage(err, "Konfigürasyon yüklenemedi.")))
      .finally(() => setLoading(false));
  }, []);

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
      });
      await refreshMe();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Kaydedilemedi. Tekrar deneyin."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-500">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">{error ?? "Konfigürasyon yüklenemedi."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-10 px-4">
      <div className="mx-auto max-w-4xl">
        {/* Başlık */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            ⚡ Future ERP'ye Hoş Geldiniz!
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Şirketinizi birkaç adımda yapılandırın — istediğiniz zaman ayarlardan değiştirebilirsiniz.
          </p>

          {/* Adım göstergesi */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${step >= 1 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step >= 1 ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
                1
              </div>
              <span className="text-sm font-medium">Sektör Seç</span>
            </div>
            <div className="h-px w-16 bg-gray-300" />
            <div className={`flex items-center gap-2 ${step >= 2 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${step >= 2 ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
                2
              </div>
              <span className="text-sm font-medium">Modülleri Ayarla</span>
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
            <h2 className="mb-4 text-xl font-semibold text-gray-800 dark:text-white">
              Şirketinizin sektörünü seçin
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {config.sectors.map((sector) => (
                <button
                  key={sector.key}
                  onClick={() => handleSectorSelect(sector)}
                  className={`rounded-xl border-2 p-5 text-left transition-all hover:shadow-md ${
                    selectedSector === sector.key
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30"
                      : "border-gray-200 bg-white hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800"
                  }`}
                >
                  <div className="mb-2 text-3xl">{SECTOR_EMOJIS[sector.key] ?? "🏢"}</div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{sector.label}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{sector.description}</p>
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
                disabled={!selectedSector}
                onClick={() => setStep(2)}
                className="rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Devam Et →
              </button>
            </div>
          </div>
        )}

        {/* Adım 2: Modül Özelleştirme */}
        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                Kullanmak istediğiniz modülleri seçin
              </h2>
              <span className="text-sm text-gray-500">
                {selectedModules.length} modül aktif
              </span>
            </div>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Sektörünüze göre önerilen modüller seçili geldi. İstediğinizi açıp kapatabilirsiniz.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {config.all_modules.map((mod) => {
                const isSelected = selectedModules.includes(mod.key);
                const isAI = mod.key === "ai";
                return (
                  <button
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
                          {mod.label}
                        </span>
                        {isAI && (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                            AI
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {mod.description}
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

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                ← Geri
              </button>
              <button
                disabled={selectedModules.length === 0 || saving}
                onClick={handleFinish}
                className="rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Kaydediliyor..." : "✓ Başla"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
