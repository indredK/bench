/**
 * 插件内 i18n：独立 i18next 实例，资源仅含本插件命名空间（cleanSpace/devCleaner/common）。
 * 语言跟随 WebView locale（navigator.language）；宿主语言经
 * window.__BENCH_EXT_LOCALE 注入（P3 契约），此处先按注入/navigator 判定。
 */
import i18next from "i18next"
import { initReactI18next } from "react-i18next"

import en from "../locales/en.json"
import zh from "../locales/zh.json"

const injected =
  typeof window !== "undefined" && (window as { __BENCH_EXT_LOCALE?: string }).__BENCH_EXT_LOCALE
const preferred =
  injected ??
  (typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh" : "en")

void i18next.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: preferred,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export default i18next
