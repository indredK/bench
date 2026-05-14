import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
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
