import { useTranslation } from "react-i18next";
import i18n from "../i18n/config";
import { isTauri } from "@tauri-apps/api/core";
import { Globe } from "lucide-react";

function LanguageSwitcher() {
  const { t } = useTranslation();

  const changeLanguage = async (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const window = await getCurrentWindow();
      const title = lng === "zh" ? "端口管理器 - DevTools" : "Port Manager - DevTools";
      await window.setTitle(title);
    }
  };

  const nextLang = i18n.language === "zh" ? "en" : "zh";
  const currentLabel = i18n.language === "zh" ? "中文" : "EN";

  return (
    <button
      onClick={() => changeLanguage(nextLang)}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-white/10 hover:text-white"
      title={t("language.switch")}
    >
      <Globe className="size-3.5" />
      <span>{currentLabel}</span>
    </button>
  );
}

export default LanguageSwitcher;