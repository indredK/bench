import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

const resources = {
  en: { translation: en },
  zh: { translation: zh },
};

function detectSystemLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.startsWith("zh") ? "zh" : "en";
}

function resolveInitialLanguage(): string {
  const stored = localStorage.getItem("language");
  if (stored === "zh" || stored === "en") return stored;
  return detectSystemLanguage();
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export { detectSystemLanguage };
export default i18n;
