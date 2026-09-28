/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import i18n, { detectSystemLanguage } from "@/i18n/config"
import { Globe } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { setCurrentWindowTitle } from "@/platform/window"
import { readStorageItem, removeStorageItem, writeStorageItem } from "@/platform/storage"
import { setTrayLabels } from "@/lib/tauri/commands"

type LangMode = "system" | "zh" | "en"
type Language = Exclude<LangMode, "system">
const CYCLE_ORDER: LangMode[] = ["system", "zh", "en"]

const FLAG_ICON: Record<LangMode, React.ReactNode> = {
  system: <Globe className="size-4" />,
  zh: <span className="text-sm leading-none">🇨🇳</span>,
  en: <span className="text-sm leading-none">🇺🇸</span>,
}

function getStoredMode(): LangMode {
  const stored = readStorageItem("languageMode")
  if (stored === "zh" || stored === "en") return stored
  return "system"
}

function setStoredMode(mode: LangMode) {
  if (mode === "system") {
    removeStorageItem("languageMode")
    removeStorageItem("language")
  } else {
    writeStorageItem("languageMode", mode)
    writeStorageItem("language", mode)
  }
}

function resolveLanguage(mode: LangMode, systemLanguage: Language): Language {
  return mode === "system" ? systemLanguage : mode
}

function getNextMode(currentMode: LangMode, systemLanguage: Language): LangMode {
  const currentLanguage = resolveLanguage(currentMode, systemLanguage)
  const currentIndex = CYCLE_ORDER.indexOf(currentMode)

  for (let offset = 1; offset < CYCLE_ORDER.length; offset += 1) {
    const candidate = CYCLE_ORDER[(currentIndex + offset) % CYCLE_ORDER.length]
    if (resolveLanguage(candidate, systemLanguage) !== currentLanguage) return candidate
  }

  return currentMode
}

function LanguageSwitcher() {
  const { t } = useTranslation()
  const [currentMode, setCurrentMode] = useState<LangMode>(getStoredMode)
  const systemLanguage = detectSystemLanguage() === "zh" ? "zh" : "en"

  const changeLanguage = async (mode: LangMode) => {
    const resolvedLang = mode === "system" ? detectSystemLanguage() : mode
    setStoredMode(mode)
    setCurrentMode(mode)
    await i18n.changeLanguage(resolvedLang)
    const title = t("common.appTitle")
    await setCurrentWindowTitle(title)
    await setTrayLabels({
      show: i18n.t("tray.show"),
      sleep: i18n.t("tray.preventSleep"),
      autostart: i18n.t("tray.launchAtLogin"),
      quit: i18n.t("tray.quit"),
    })
  }

  const nextMode = getNextMode(currentMode, systemLanguage)

  const tooltipText = t("language.switchTo", { next: t(`language.${nextMode}`) })

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={() => changeLanguage(nextMode)}
        className="border-border bg-accent/40 text-foreground hover:bg-accent flex cursor-pointer items-center justify-center rounded-md border p-1.5 transition"
        aria-label={tooltipText}
      >
        {FLAG_ICON[currentMode]}
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>
          {t("language.current")} {t(`language.${currentMode}`)}
        </p>
        <p className="text-muted-foreground text-xs">{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export default LanguageSwitcher
