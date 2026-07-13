/**
 * Layout UI / 布局 UI: shared quick controls (language / theme / prefs).
 *
 * Reused by the sidebar footer, the top-tab bar, and (as a gear) the bottom
 * dock so the same affordances stay reachable in every display form.
 */
import { useTranslation } from "react-i18next"
import { Settings } from "lucide-react"
import LanguageSwitcher from "./LanguageSwitcher"
import ThemeSwitcher from "./ThemeSwitcher"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface QuickControlsProps {
  onPrefs?: () => void
  /** Tooltip side for the prefs button (top bar → bottom, dock → top). */
  prefsSide?: "top" | "bottom"
}

export function QuickControls({ onPrefs, prefsSide = "top" }: QuickControlsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5">
      <LanguageSwitcher />
      <ThemeSwitcher />
      {onPrefs && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onPrefs}
              aria-label={t("sidebar.preferences")}
            >
              <Settings size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={prefsSide}>
            <p>{t("sidebar.preferences")}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export default QuickControls
