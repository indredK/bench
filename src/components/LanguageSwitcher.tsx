import { useTranslation } from "react-i18next";
import i18n from "../i18n/config";
import { getCurrentWindow } from "@tauri-apps/api/window";

function LanguageSwitcher() {
  const { t } = useTranslation();

  const changeLanguage = async (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
    const window = await getCurrentWindow();
    const title = lng === "zh" ? "端口管理器 - DevTools" : "Port Manager - DevTools";
    await window.setTitle(title);
  };

  return (
    <div className="flex gap-1.5">
      <button
        className={`min-h-7 cursor-pointer rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-indigo-200 transition hover:bg-white/10 ${
          i18n.language === "en" ? "bg-indigo-500 border-indigo-500 text-white" : ""
        }`}
        onClick={() => changeLanguage("en")}
      >
        {t("language.en")}
      </button>
      <button
        className={`min-h-7 cursor-pointer rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-indigo-200 transition hover:bg-white/10 ${
          i18n.language === "zh" ? "bg-indigo-500 border-indigo-500 text-white" : ""
        }`}
        onClick={() => changeLanguage("zh")}
      >
        {t("language.zh")}
      </button>
    </div>
  );
}

export default LanguageSwitcher;