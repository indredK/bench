/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Monitor, Sun, Moon, Globe, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import i18n, { detectSystemLanguage } from "@/i18n/config";
import { setCurrentWindowTitle } from "@/platform/window";
import { readStorageItem, removeStorageItem, writeStorageItem } from "@/platform/storage";
import { useWindowTheme } from "@/hooks/useWindowTheme";
import { WINDOW_THEMES } from "@/lib/windowTheme";
import { getAutostartStatus, setAutostart } from "@/lib/tauri/commands/system-settings";
import { setTrayLabels } from "@/lib/tauri/commands";
import { getErrorMessage } from "@/lib/tauri/errors";

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
  const { themeId: windowThemeId, setThemeId: setWindowThemeId, isSupported } =
    useWindowTheme();

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
    const title = i18n.t("common.appTitle");
    await setCurrentWindowTitle(title);
    await setTrayLabels({
      show: i18n.t("tray.show"),
      sleep: i18n.t("tray.preventSleep"),
      autostart: i18n.t("tray.launchAtLogin"),
      quit: i18n.t("tray.quit"),
    });
  }, []);

  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAutostartLoading(true);
    getAutostartStatus()
      .then((v) => {
        if (!cancelled) setAutostartEnabled(v);
      })
      .catch(() => {
        // best-effort: leave toggle off on read failure
      })
      .finally(() => {
        if (!cancelled) setAutostartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleToggleAutostart = useCallback(async (v: boolean) => {
    setAutostartLoading(true);
    try {
      await setAutostart(v);
      setAutostartEnabled(v);
    } catch (e) {
      toast.error(t("startup.launchAtLoginError", { error: getErrorMessage(e) }));
    } finally {
      setAutostartLoading(false);
    }
  }, [t]);

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
            <h4 className="mb-2 text-sm font-medium">{t("theme.sectionTitle")}</h4>
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

          <div>
            <h4 className="mb-2 text-sm font-medium">{t("windowTheme.label")}</h4>
            <div className="flex flex-wrap gap-2">
              {WINDOW_THEMES.map((desc) => {
                const Icon = desc.icon;
                const supported = isSupported(desc.id);
                const button = (
                  <Button
                    key={desc.id}
                    variant={windowThemeId === desc.id ? "default" : "outline"}
                    size="sm"
                    disabled={!supported}
                    onClick={() => setWindowThemeId(desc.id)}
                    className="gap-1.5"
                  >
                    {windowThemeId === desc.id && <Check className="size-3.5" />}
                    <Icon className="size-3.5" />
                    {t(desc.labelKey)}
                  </Button>
                );
                if (supported) return button;
                return (
                  <TooltipProvider key={desc.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent side="top">{t("windowTheme.unsupportedTooltip")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">{t("startup.title")}</h4>
            <div className="flex items-center justify-between py-2">
              <div className="min-w-0 pr-3">
                <div className="text-sm">{t("startup.launchAtLogin")}</div>
                <div className="text-xs text-muted-foreground">{t("startup.launchAtLoginDesc")}</div>
              </div>
              <Switch
                checked={autostartEnabled}
                loading={autostartLoading}
                onCheckedChange={handleToggleAutostart}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
