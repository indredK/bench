import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const changeLanguage = async (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
    const window = await getCurrentWindow();
    const title = lng === "zh" ? "端口管理器 - DevTools" : "Port Manager - DevTools";
    await window.setTitle(title);
  };

  return (
    <div className="language-switcher">
      <button
        className={`lang-btn ${i18n.language === "en" ? "active" : ""}`}
        onClick={() => changeLanguage("en")}
      >
        {t("language.en")}
      </button>
      <button
        className={`lang-btn ${i18n.language === "zh" ? "active" : ""}`}
        onClick={() => changeLanguage("zh")}
      >
        {t("language.zh")}
      </button>
    </div>
  );
}

export default LanguageSwitcher;
