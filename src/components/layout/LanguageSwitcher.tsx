import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { detectSystemLanguage } from "@/i18n/config";
import { Globe } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { setCurrentWindowTitle } from "@/platform/window";

type LangMode = "system" | "zh" | "en";
const CYCLE_ORDER: LangMode[] = ["system", "zh", "en"];

const FLAG_ICON: Record<LangMode, React.ReactNode> = {
  system: <Globe className="size-4" />,
  zh: <span className="text-sm leading-none">🇨🇳</span>,
  en: <span className="text-sm leading-none">🇺🇸</span>,
};

function getStoredMode(): LangMode {
  const stored = localStorage.getItem("languageMode");
  if (stored === "zh" || stored === "en") return stored;
  return "system";
}

function setStoredMode(mode: LangMode) {
  if (mode === "system") {
    localStorage.removeItem("languageMode");
    localStorage.removeItem("language");
  } else {
    localStorage.setItem("languageMode", mode);
    localStorage.setItem("language", mode);
  }
}

function LanguageSwitcher() {
  const { t } = useTranslation();
  const [currentMode, setCurrentMode] = useState<LangMode>(getStoredMode);

  const changeLanguage = async (mode: LangMode) => {
    const resolvedLang = mode === "system" ? detectSystemLanguage() : mode;
    setStoredMode(mode);
    setCurrentMode(mode);
    await i18n.changeLanguage(resolvedLang);
    const title = resolvedLang === "zh" ? "端口管理器 - DevTools" : "Port Manager - DevTools";
    await setCurrentWindowTitle(title);
  };

  const currentIndex = CYCLE_ORDER.indexOf(currentMode);
  const nextMode = CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length];

  const tooltipText = t("language.switchTo", { next: t(`language.${nextMode}`) });

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={() => changeLanguage(nextMode)}
        className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-accent/40 p-1.5 text-foreground transition hover:bg-accent"
        aria-label={tooltipText}
      >
        {FLAG_ICON[currentMode]}
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          {t("language.current")} {t(`language.${currentMode}`)}
        </p>
        <p className="text-xs text-muted-foreground">{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default LanguageSwitcher;
