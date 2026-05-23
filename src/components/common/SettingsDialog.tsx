/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon, Globe, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import i18n, { detectSystemLanguage } from "@/i18n/config";
import { setCurrentWindowTitle } from "@/platform/window";
import { readStorageItem, removeStorageItem, writeStorageItem } from "@/platform/storage";

const THEME_ORDER = ["system", "light", "dark"] as const;
type ThemeMode = (typeof THEME_ORDER)[number];

const THEME_ICON: Record<ThemeMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LANG_OPTIONS = [
  { value: "system", labelKey: "language.system" },
  { value: "en", labelKey: "language.en" },
  { value: "zh", labelKey: "language.zh" },
] as const;

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const currentTheme = (theme as ThemeMode) || "system";

  const storedLang = (() => {
    const s = readStorageItem("languageMode");
    if (s === "zh" || s === "en") return s;
    return "system";
  })();

  const changeLanguage = useCallback(async (lang: string) => {
    if (lang === "system") {
      removeStorageItem("languageMode");
      removeStorageItem("language");
    } else {
      writeStorageItem("languageMode", lang);
      writeStorageItem("language", lang);
    }
    const resolved = lang === "system" ? detectSystemLanguage() : lang;
    await i18n.changeLanguage(resolved);
    const title = resolved === "zh" ? "端口管理器 - DevTools" : "Port Manager - DevTools";
    await setCurrentWindowTitle(title);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("sidebar.settings")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("language.switch")} · {t("theme.currentMode")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div>
            <h4 className="mb-2 text-sm font-medium">{t("language.switch")}</h4>
            <div className="flex flex-wrap gap-2">
              {LANG_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={storedLang === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => changeLanguage(opt.value)}
                  className="gap-1.5"
                >
                  {storedLang === opt.value && <Check className="size-3.5" />}
                  {opt.value === "system" && <Globe className="size-3.5" />}
                  {t(opt.labelKey)}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">{t("theme.label", { mode: "" }).replace(": ", "").trim() || t("theme.currentMode")}</h4>
            <div className="flex flex-wrap gap-2">
              {THEME_ORDER.map((mode) => {
                const Icon = THEME_ICON[mode];
                return (
                  <Button
                    key={mode}
                    variant={currentTheme === mode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme(mode)}
                    className="gap-1.5"
                  >
                    {currentTheme === mode && <Check className="size-3.5" />}
                    <Icon className="size-3.5" />
                    {t(`theme.${mode}`)}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
