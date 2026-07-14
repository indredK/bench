/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  Monitor,
  Sun,
  Moon,
  Globe,
  Check,
  Settings,
  Palette,
  Info,
  RefreshCw,
  X,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import i18n, { detectSystemLanguage } from "@/i18n/config"
import { setCurrentWindowTitle } from "@/platform/window"
import { readStorageItem, removeStorageItem, writeStorageItem } from "@/platform/storage"
import { useWindowTheme } from "@/hooks/useWindowTheme"
import { WINDOW_THEMES } from "@/lib/windowTheme"
import { NAVIGATION_LAYOUTS } from "@/lib/navigationLayout"
import { useNavigationLayout } from "@/hooks/useNavigationLayout"
import { getAutostartStatus, setAutostart } from "@/lib/tauri/commands/system-settings"
import { setTrayLabels } from "@/lib/tauri/commands"
import { getCloseBehavior, setCloseBehavior } from "@/lib/tauri/commands/app-preferences"
import { getErrorMessage } from "@/lib/tauri/errors"

const THEME_ORDER = ["system", "light", "dark"] as const
type ThemeMode = (typeof THEME_ORDER)[number]

const THEME_ICON: Record<ThemeMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

const LANG_OPTIONS = [
  { value: "system", labelKey: "language.system" },
  { value: "en", labelKey: "language.en" },
  { value: "zh", labelKey: "language.zh" },
] as const

type SettingsTab = "general" | "appearance" | "about"

const TAB_ITEMS: { id: SettingsTab; icon: typeof Settings; labelKey: string }[] = [
  { id: "general", icon: Settings, labelKey: "settings.tabs.general" },
  { id: "appearance", icon: Palette, labelKey: "settings.tabs.appearance" },
  { id: "about", icon: Info, labelKey: "settings.tabs.about" },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appVersion?: string
  tauriVersion?: string
  onCheckUpdates?: () => void
  autoCheckEnabled?: boolean
  onAutoCheckEnabledChange?: (enabled: boolean) => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  appVersion = "1.0.0",
  tauriVersion = "2.x",
  onCheckUpdates,
  autoCheckEnabled = true,
  onAutoCheckEnabledChange,
}: SettingsDialogProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const currentTheme = (theme as ThemeMode) || "system"
  const { themeId: windowThemeId, setThemeId: setWindowThemeId, isSupported } = useWindowTheme()
  const navLayout = useNavigationLayout()

  const [activeTab, setActiveTab] = useState<SettingsTab>("general")

  const storedLang = (() => {
    const s = readStorageItem("languageMode")
    if (s === "zh" || s === "en") return s
    return "system"
  })()

  const changeLanguage = useCallback(async (lang: string) => {
    if (lang === "system") {
      removeStorageItem("languageMode")
      removeStorageItem("language")
    } else {
      writeStorageItem("languageMode", lang)
      writeStorageItem("language", lang)
    }
    const resolved = lang === "system" ? detectSystemLanguage() : lang
    await i18n.changeLanguage(resolved)
    const title = i18n.t("common.appTitle")
    await setCurrentWindowTitle(title)
    await setTrayLabels({
      show: i18n.t("tray.show"),
      sleep: i18n.t("tray.preventSleep"),
      autostart: i18n.t("tray.launchAtLogin"),
      quit: i18n.t("tray.quit"),
    })
  }, [])

  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(null)
  const [autostartLoading, setAutostartLoading] = useState(false)
  const [closeBehaviorValue, setCloseBehaviorValue] = useState("minimize_to_tray")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getCloseBehavior()
      .then((v) => {
        if (!cancelled) setCloseBehaviorValue(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  const loadAutostart = useCallback(async () => {
    setAutostartLoading(true)
    try {
      setAutostartEnabled(await getAutostartStatus())
    } catch {
      setAutostartEnabled(null)
    } finally {
      setAutostartLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadAutostart()
    return () => {
      setAutostartLoading(false)
    }
  }, [loadAutostart, open])

  const handleToggleAutostart = useCallback(
    async (v: boolean) => {
      setAutostartLoading(true)
      try {
        await setAutostart(v)
        setAutostartEnabled(v)
      } catch (e) {
        toast.error(t("startup.launchAtLoginError", { error: getErrorMessage(e) }))
      } finally {
        setAutostartLoading(false)
      }
    },
    [t],
  )

  const CLOSE_BEHAVIORS = [
    {
      value: "minimize_to_tray",
      labelKey: "closeBehavior.minimizeToTray",
      descKey: "closeBehavior.minimizeToTrayDesc",
    },
    { value: "quit", labelKey: "closeBehavior.quit", descKey: "closeBehavior.quitDesc" },
    {
      value: "always_ask",
      labelKey: "closeBehavior.alwaysAsk",
      descKey: "closeBehavior.alwaysAskDesc",
    },
  ] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-[680px]">
        <div className="flex h-[480px]">
          {/* Sidebar */}
          <div className="bg-muted/30 w-44 shrink-0 border-r p-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold">{t("settings.title")}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onOpenChange(false)}
              >
                <X size={14} />
              </Button>
            </div>
            <nav className="space-y-0.5">
              {TAB_ITEMS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon size={16} />
                    {t(tab.labelKey)}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <DialogHeader className="p-0">
                <DialogTitle className="text-base">{t(`settings.tabs.${activeTab}`)}</DialogTitle>
              </DialogHeader>
            </div>

            <ScrollableArea className="flex-1 px-5 py-4" wrapperClassName="flex flex-1 min-h-0">
              {activeTab === "general" && (
                <div className="space-y-5">
                  {/* Startup */}
                  <div className="flex items-center justify-between py-1">
                    <div className="min-w-0 pr-3">
                      <div className="text-sm font-medium">{t("startup.launchAtLogin")}</div>
                      <div className="text-muted-foreground text-xs">
                        {t("startup.launchAtLoginDesc")}
                      </div>
                    </div>
                    {autostartEnabled === null && !autostartLoading ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline">{t("common.unknown")}</Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => void loadAutostart()}
                          aria-label={t("common.retry")}
                        >
                          <RefreshCw />
                        </Button>
                      </div>
                    ) : (
                      <Switch
                        checked={autostartEnabled ?? false}
                        loading={autostartLoading}
                        onCheckedChange={handleToggleAutostart}
                      />
                    )}
                  </div>

                  <div className="border-border border-t" />

                  <div className="flex items-center justify-between py-1">
                    <div className="min-w-0 pr-3">
                      <div className="text-sm font-medium">{t("updater.autoCheck")}</div>
                      <div className="text-muted-foreground text-xs">
                        {t("updater.autoCheckDescription")}
                      </div>
                    </div>
                    <Switch checked={autoCheckEnabled} onCheckedChange={onAutoCheckEnabledChange} />
                  </div>

                  <div className="border-border border-t" />

                  {/* Close behavior */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{t("closeBehavior.title")}</div>
                    <div className="flex shrink-0 gap-1.5">
                      {CLOSE_BEHAVIORS.map((opt) => (
                        <Button
                          key={opt.value}
                          variant={closeBehaviorValue === opt.value ? "default" : "outline"}
                          size="xs"
                          onClick={() => {
                            setCloseBehaviorValue(opt.value)
                            void setCloseBehavior(opt.value)
                          }}
                          className="gap-1"
                        >
                          {closeBehaviorValue === opt.value && <Check className="size-3" />}
                          {t(opt.labelKey)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "appearance" && (
                <div className="space-y-5">
                  {/* Language */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{t("language.switch")}</div>
                    <div className="flex shrink-0 gap-1.5">
                      {LANG_OPTIONS.map((opt) => (
                        <Button
                          key={opt.value}
                          variant={storedLang === opt.value ? "default" : "outline"}
                          size="xs"
                          onClick={() => changeLanguage(opt.value)}
                          className="gap-1"
                        >
                          {storedLang === opt.value && <Check className="size-3" />}
                          {opt.value === "system" && <Globe className="size-3" />}
                          {t(opt.labelKey)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="border-border border-t" />

                  {/* Theme */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{t("theme.sectionTitle")}</div>
                    <div className="flex gap-1.5">
                      {THEME_ORDER.map((mode) => {
                        const Icon = THEME_ICON[mode]
                        return (
                          <Button
                            key={mode}
                            variant={currentTheme === mode ? "default" : "outline"}
                            size="xs"
                            onClick={() => setTheme(mode)}
                            className="gap-1"
                          >
                            {currentTheme === mode && <Check className="size-3" />}
                            <Icon className="size-3" />
                            {t(`theme.${mode}`)}
                          </Button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="border-border border-t" />

                  {/* Window theme */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{t("windowTheme.label")}</div>
                    <div className="flex gap-1.5">
                      {WINDOW_THEMES.map((desc) => {
                        const Icon = desc.icon
                        const supported = isSupported(desc.id)
                        const button = (
                          <Button
                            key={desc.id}
                            variant={windowThemeId === desc.id ? "default" : "outline"}
                            size="xs"
                            disabled={!supported}
                            onClick={() => setWindowThemeId(desc.id)}
                            className="gap-1"
                          >
                            {windowThemeId === desc.id && <Check className="size-3" />}
                            <Icon className="size-3" />
                            {t(desc.labelKey)}
                          </Button>
                        )
                        if (supported) return button
                        return (
                          <TooltipProvider key={desc.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>{button}</TooltipTrigger>
                              <TooltipContent side="top">
                                {t("windowTheme.unsupportedTooltip")}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                      })}
                    </div>
                  </div>

                  <div className="border-border border-t" />

                  {/* Navigation layout */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{t("navigationLayout.label")}</div>
                    <div className="flex shrink-0 gap-1.5">
                      {NAVIGATION_LAYOUTS.map((desc) => {
                        const Icon = desc.icon
                        return (
                          <Button
                            key={desc.id}
                            variant={navLayout.layoutId === desc.id ? "default" : "outline"}
                            size="xs"
                            onClick={() => navLayout.setLayoutId(desc.id)}
                            className="gap-1"
                          >
                            {navLayout.layoutId === desc.id && <Check className="size-3" />}
                            <Icon className="size-3" />
                            {t(desc.labelKey)}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "about" && (
                <div className="space-y-5">
                  {/* App info */}
                  <div className="py-2 text-center">
                    <div className="mb-1.5 text-lg font-semibold">{t("common.appTitle")}</div>
                    <p className="text-muted-foreground text-sm">{t("about.description")}</p>
                  </div>

                  <div className="border-border border-t" />

                  {/* Version info */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("about.version")}</span>
                      <span className="font-mono">{appVersion}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("about.runtime")}</span>
                      <span className="font-mono">{tauriVersion}</span>
                    </div>
                  </div>

                  {onCheckUpdates && (
                    <>
                      <div className="border-border border-t" />

                      {/* Updates */}
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{t("updater.title")}</div>
                        <Button variant="outline" size="xs" onClick={onCheckUpdates}>
                          {t("updater.checkNow")}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </ScrollableArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
