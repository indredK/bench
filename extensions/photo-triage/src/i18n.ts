/**
 * 插件内 i18n：独立 i18next 实例，资源仅含本插件命名空间（photoTriage + common）。
 * 语言跟随 WebView locale（navigator.language）；宿主语言偏好注入留 P3。
 */
import i18next from "i18next"
import { initReactI18next } from "react-i18next"

import en from "../locales/en.json"
import zh from "../locales/zh.json"

const preferred =
  typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh" : "en"

void i18next.use(initReactI18next).init({
  resources: {
    // locale 文件本身带 "translation" 包装（{ translation: { ns... } }），
    // 这里必须解包一层 —— 直接 { translation: zh } 会双重嵌套导致 t() 全部
    // 返回 key 原文（P5 教训，四个插件曾集体中招）。
    zh: { translation: zh.translation },
    en: { translation: en.translation },
  },
  lng: preferred,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export default i18next
