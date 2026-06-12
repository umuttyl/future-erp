import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

export const LANG_STORAGE_KEY = "erp_lang";

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });

/** No-op kept for API compatibility — app is English only. */
export function setAppLanguage(_lang: string | null | undefined): void {
  // English only
}

export default i18n;
