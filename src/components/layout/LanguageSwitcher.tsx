/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
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
import { readStorageItem, removeStorageItem, writeStorageItem } from "@/platform/storage";
import { setTrayLabels } from "@/lib/tauri/commands";

type LangMode = "system" | "zh" | "en";
const CYCLE_ORDER: LangMode[] = ["system", "zh", "en"];

const FLAG_ICON: Record<LangMode, React.ReactNode> = {
  system: <Globe className="size-4" />,
  zh: <span className="text-sm leading-none">🇨🇳</span>,
  en: <span className="text-sm leading-none">🇺🇸</span>,
};

function getStoredMode(): LangMode {
  const stored = readStorageItem("languageMode");
  if (stored === "zh" || stored === "en") return stored;
  return "system";
}

function setStoredMode(mode: LangMode) {
  if (mode === "system") {
    removeStorageItem("languageMode");
    removeStorageItem("language");
  } else {
    writeStorageItem("languageMode", mode);
    writeStorageItem("language", mode);
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
    const title = t("common.appTitle");
    await setCurrentWindowTitle(title);
    await setTrayLabels({
      show: i18n.t("tray.show"),
      sleep: i18n.t("tray.preventSleep"),
      autostart: i18n.t("tray.launchAtLogin"),
      quit: i18n.t("tray.quit"),
    });
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
