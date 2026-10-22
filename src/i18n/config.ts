/**
 * Localization / 本地化: own translations only; 只处理语言资源与 i18n.
 */
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en.json"
import zh from "./locales/zh.json"
import { readStorageItem } from "@/platform/storage"

const resources = {
  en: { translation: en },
  zh: { translation: zh },
}

function detectSystemLanguage(): string {
  if (typeof navigator === "undefined") return "en"
  return navigator.language.startsWith("zh") ? "zh" : "en"
}

function resolveInitialLanguage(): string {
  const stored = readStorageItem("language")
  if (stored === "zh" || stored === "en") return stored
  return detectSystemLanguage()
}

function syncDocumentLanguage(language: string): void {
  if (typeof document === "undefined") return
  document.documentElement.lang = language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

i18n.on("languageChanged", syncDocumentLanguage)

const initPromise = i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  })
  .then((result) => {
    syncDocumentLanguage(i18n.resolvedLanguage || i18n.language)
    return result
  })

export { detectSystemLanguage, initPromise as i18nInitPromise }
export default i18n
