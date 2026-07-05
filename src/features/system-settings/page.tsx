/**
 * System Settings Page / 系统设置页面: main page view.
 *
 * v2 — 重设计: 9 个 Tab → 3 个 Tab (外观/安全/系统)，
 * SettingsDialog 内容合并入此页，devtools/diagnostics/info 移入独立页面。
 */
import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Loader2Icon, ExternalLink, FolderOpen, Search, X } from "lucide-react"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "./components/SettingToggle"
import { SettingGroup } from "@/components/ui/setting-group"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getErrorMessage } from "@/lib/tauri/errors"
import type { AppFeature } from "@/features/types"
import type { SettingsTab } from "./store"
import type {
  GatekeeperMode,
  LowPowerMode,
  MenuBarAutoHideMode,
} from "@/lib/tauri/types/system-settings"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"

const SleepSection = lazy(() => import("./components/sections/SleepSection").then((m) => ({ default: m.SleepSection })))
const LockScreenSection = lazy(() => import("./components/sections/LockScreenSection").then((m) => ({ default: m.LockScreenSection })))
const KeyboardSection = lazy(() => import("./components/sections/KeyboardSection").then((m) => ({ default: m.KeyboardSection })))
const DisplayDockSection = lazy(() => import("./components/sections/DisplayDockSection").then((m) => ({ default: m.DisplayDockSection })))
const QuickActionsSection = lazy(() => import("./components/sections/QuickActionsSection").then((m) => ({ default: m.QuickActionsSection })))
import { openPlatformDialog } from "@/platform/dialog"
import { searchSettings } from "./search-index"

// ── Constants ──

const TAB_IDS: SettingsTab[] = ["appearance", "security", "system", "advanced"]

const BROWSER_OPTIONS = [
  { value: "com.apple.Safari", labelKey: "systemSettings.browser.options.safari" },
  { value: "com.google.Chrome", labelKey: "systemSettings.browser.options.chrome" },
  { value: "com.microsoft.edgemac", labelKey: "systemSettings.browser.options.edge" },
  { value: "org.mozilla.firefox", labelKey: "systemSettings.browser.options.firefox" },
  { value: "com.brave.Browser", labelKey: "systemSettings.browser.options.brave" },
  { value: "com.operasoftware.Opera", labelKey: "systemSettings.browser.options.opera" },
  { value: "company.thebrowser.Browser", labelKey: "systemSettings.browser.options.arc" },
] as const

interface SystemSettingsProps {
  feature: AppFeature
}

export default function SystemSettings(_props: SystemSettingsProps) {
  const { t } = useTranslation()
  const store = useSystemSettingsStore()
  const activeTab = useSystemSettingsStore((s) => s.activeTab)
  const { run } = useSettingAction()

  // ── State for System tab (Login items) ──

  const [loginItems, setLoginItems] = useState(useSystemSettingsStore.getState().loginItems)
  const [loginItemsLoading, setLoginItemsLoading] = useState(false)
  const [launchAgents, setLaunchAgents] = useState<
    { name: string; path: string; enabled: boolean }[]
  >([])
  const [launchAgentsLoading, setLaunchAgentsLoading] = useState(false)
  const [launchDaemons, setLaunchDaemons] = useState<
    { name: string; path: string; enabled: boolean }[]
  >([])
  const [launchDaemonsLoading, setLaunchDaemonsLoading] = useState(false)
  const [loginItemToRemove, setLoginItemToRemove] = useState<string | null>(null)

  // Default browser state
  const [defaultBrowser, setDefaultBrowser] = useState(store.defaultBrowser)
  const [browserLoading, setBrowserLoading] = useState(false)

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState("")
  const searchResults = useMemo(
    () => (searchQuery ? searchSettings(searchQuery, t) : []),
    [searchQuery, t],
  )

  const loadTabSettings = useCallback(
    async (tab: SettingsTab) => {
      const s = useSystemSettingsStore.getState()
      if (s.loadedTabs.has(tab)) return
      try {
        switch (tab) {
          case "appearance":
            break // Self-loading sections
          case "security":
            break // Self-loading sections
          case "system": {
            systemSettingsUseCases
              .getDefaultBrowser()
              .then((b) => {
                s.setDefaultBrowser(b)
                setDefaultBrowser(b)
              })
              .catch(() => toast.error(t("systemSettings.browser.loadFailed")))
            setLoginItemsLoading(true)
            systemSettingsUseCases
              .getLoginItems()
              .then((items) => {
                s.setLoginItems(items)
                setLoginItems(items)
              })
              .catch(console.error)
              .finally(() => setLoginItemsLoading(false))
            break
          }
          case "advanced": {
            setLaunchAgentsLoading(true)
            setLaunchDaemonsLoading(true)
            Promise.all([
              systemSettingsUseCases.getLaunchAgents(),
              systemSettingsUseCases.getLaunchDaemons(),
            ])
              .then(([agents, daemons]) => {
                setLaunchAgents(agents)
                setLaunchDaemons(daemons)
              })
              .catch(console.error)
              .finally(() => {
                setLaunchAgentsLoading(false)
                setLaunchDaemonsLoading(false)
              })
            break
          }
        }
        s.markTabLoaded(tab)
      } catch (err) {
        console.error(`Failed to load ${tab} settings:`, err)
      }
    },
    [t],
  )

  useEffect(() => {
    if (systemSettingsUseCases.isAvailable()) {
      void loadTabSettings(activeTab)
    }
  }, [activeTab, loadTabSettings])

  const handleTabChange = (tab: SettingsTab) => {
    store.setActiveTab(tab)
  }

  const renderTabContent = () => {
    switch (store.activeTab) {
      // ═══════════════════════════════════════════
      // 外观 Appearance
      // ═══════════════════════════════════════════
      case "appearance":
        return (
          <div className="grid grid-cols-2 gap-4">
            {/* ── Display & Dock ── */}
            <Suspense fallback={<div className="text-muted-foreground col-span-2 flex h-24 items-center justify-center text-xs">{t("common.loading")}</div>}>
              <DisplayDockSection className="col-span-2" />
            </Suspense>

            {/* ── Dock & Menu Bar Toggles ── */}
            <SettingGroup title={t("systemSettings.toggles.title")} className="col-span-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <SettingToggle
                  label={t("systemSettings.toggles.autohideDock")}
                  description={t("systemSettings.toggles.autohideDockDesc")}
                  checked={store.autohideDock}
                  loading={store.applyingKeys.has("toggles.autoHideDock")}
                  onOpenSettings={() => systemSettingsUseCases.openControlCenterSettings()}
                  onCheckedChange={async (v) => {
                    await run("toggles.autoHideDock", async () => {
                      await systemSettingsUseCases.setAutohideDockState(v)
                      store.setAutohideDock(v)
                    })
                  }}
                />
                <SettingToggle
                  label={t("systemSettings.toggles.dockShowRecents")}
                  description={t("systemSettings.toggles.dockShowRecentsDesc")}
                  checked={store.dockShowRecents}
                  loading={store.applyingKeys.has("toggles.dockShowRecents")}
                  onOpenSettings={() => systemSettingsUseCases.openDesktopSettings()}
                  onCheckedChange={async (v) => {
                    await run("toggles.dockShowRecents", async () => {
                      await systemSettingsUseCases.setDockShowRecentsState(v)
                      store.setDockShowRecents(v)
                    })
                  }}
                />
                <SettingToggle
                  label={t("systemSettings.toggles.hideDesktopIcons")}
                  description={t("systemSettings.toggles.hideDesktopIconsDesc")}
                  checked={store.hideDesktopIcons}
                  loading={store.applyingKeys.has("toggles.hideDesktopIcons")}
                  onCheckedChange={async (v) => {
                    await run("toggles.hideDesktopIcons", async () => {
                      await systemSettingsUseCases.setHideDesktopIconsState(v)
                      store.setHideDesktopIcons(v)
                    })
                  }}
                />
              </div>
              <div className="mt-2 border-t pt-3">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div
                      className="flex cursor-pointer items-center gap-1.5"
                      onClick={() => systemSettingsUseCases.openControlCenterSettings()}
                    >
                      <Label className="hover:text-foreground text-sm font-medium transition-colors">
                        {t("systemSettings.toggles.autohideMenuBar")}
                      </Label>
                      <ExternalLink
                        size={12}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t("systemSettings.toggles.autohideMenuBarDesc")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { mode: "never", label: t("systemSettings.toggles.menuBarNever") },
                        {
                          mode: "in_full_screen_only",
                          label: t("systemSettings.toggles.menuBarFullScreen"),
                        },
                        {
                          mode: "on_desktop_only",
                          label: t("systemSettings.toggles.menuBarDesktop"),
                        },
                        { mode: "always", label: t("systemSettings.toggles.menuBarAlways") },
                      ] as { mode: MenuBarAutoHideMode; label: string }[]
                    ).map(({ mode, label }) => (
                      <Button
                        key={mode}
                        variant={store.autohideMenuBar === mode ? "default" : "outline"}
                        size="sm"
                        disabled={store.applyingKeys.has("toggles.autoHideMenuBar")}
                        onClick={async () => {
                          if (store.autohideMenuBar === mode) return
                          await run("toggles.autoHideMenuBar", async () => {
                            await systemSettingsUseCases.setAutohideMenuBarState(mode)
                            store.setAutohideMenuBar(mode)
                          })
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </SettingGroup>

            {/* ── Screenshot ── */}
            <SettingGroup title={t("systemSettings.screenshot.title")} className="col-span-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <SettingToggle
                  label={t("systemSettings.screenshot.disableShadow")}
                  checked={store.screenshotDisableShadow}
                  loading={store.applyingKeys.has("screenshot.disableShadow")}
                  onCheckedChange={async (v) => {
                    await run("screenshot.disableShadow", async () => {
                      await systemSettingsUseCases.setScreenshotDisableShadow(v)
                      store.setScreenshotDisableShadow(v)
                    })
                  }}
                />
                <SettingToggle
                  label={t("systemSettings.screenshot.showThumbnail")}
                  checked={store.screenshotShowThumbnail}
                  loading={store.applyingKeys.has("screenshot.showThumbnail")}
                  onCheckedChange={async (v) => {
                    await run("screenshot.showThumbnail", async () => {
                      await systemSettingsUseCases.setScreenshotShowThumbnail(v)
                      store.setScreenshotShowThumbnail(v)
                    })
                  }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 border-t pt-3">
                <div className="flex items-center justify-between py-2">
                  <Label className="text-sm font-medium">
                    {t("systemSettings.screenshot.format")}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {["png", "jpg", "bmp", "pdf", "tiff"].map((fmt) => (
                      <Button
                        key={fmt}
                        variant={store.screenshotFormat === fmt ? "default" : "outline"}
                        size="sm"
                        disabled={store.applyingKeys.size > 0}
                        onClick={async () => {
                          await run("screenshot.format", async () => {
                            await systemSettingsUseCases.setScreenshotFormat(fmt)
                            store.setScreenshotFormat(fmt)
                          })
                        }}
                      >
                        {fmt.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <Label className="text-sm font-medium">
                    {t("systemSettings.screenshot.saveLocation")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={store.screenshotSaveLocation}
                      readOnly
                      placeholder={t("systemSettings.screenshot.saveLocationPlaceholder")}
                      className="flex-1 cursor-default"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={store.applyingKeys.size > 0}
                      onClick={async () => {
                        const selected = await openPlatformDialog({
                          directory: true,
                          multiple: false,
                        })
                        if (selected && typeof selected === "string") {
                          store.setScreenshotSaveLocation(selected)
                          await run("screenshot.saveLocation", async () => {
                            await systemSettingsUseCases.setScreenshotSaveLocation(selected)
                          })
                        }
                      }}
                    >
                      <FolderOpen size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            </SettingGroup>
          </div>
        )

      // ═══════════════════════════════════════════
      // 安全与隐私 Security
      // ═══════════════════════════════════════════
      case "security":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <Suspense fallback={<div className="text-muted-foreground flex h-20 items-center justify-center text-xs">{t("common.loading")}</div>}>
                <LockScreenSection />
              </Suspense>

              {/* ── Network ── */}
              <SettingGroup title={t("systemSettings.network.title")}>
                <div className="space-y-1">
                  <SettingToggle
                    label={t("systemSettings.network.firewall")}
                    description={t("systemSettings.network.firewallDesc")}
                    checked={store.networkFirewall}
                    loading={store.applyingKeys.has("network.firewall")}
                    onOpenSettings={() => systemSettingsUseCases.openNetworkSettings()}
                    onCheckedChange={async (v) => {
                      await run("network.firewall", async () => {
                        await systemSettingsUseCases.setNetworkFirewallState(v)
                        store.setNetworkFirewall(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.network.ssh")}
                    description={t("systemSettings.network.sshDesc")}
                    checked={store.networkSsh}
                    loading={store.applyingKeys.has("network.ssh")}
                    onOpenSettings={() => systemSettingsUseCases.openNetworkSettings()}
                    onCheckedChange={async (v) => {
                      await run("network.ssh", async () => {
                        await systemSettingsUseCases.setNetworkSshState(v)
                        store.setNetworkSsh(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.network.screenSharing")}
                    checked={store.networkScreenSharing}
                    loading={store.applyingKeys.has("network.screenSharing")}
                    onOpenSettings={() => systemSettingsUseCases.openNetworkSettings()}
                    onCheckedChange={async (v) => {
                      await run("network.screenSharing", async () => {
                        await systemSettingsUseCases.setNetworkScreenSharingState(v)
                        store.setNetworkScreenSharing(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.network.airdrop")}
                    description={t("systemSettings.network.airdropDesc")}
                    checked={store.networkAirdropDisabled}
                    loading={store.applyingKeys.has("network.airdrop")}
                    onOpenSettings={() => systemSettingsUseCases.openNetworkSettings()}
                    onCheckedChange={async (v) => {
                      await run("network.airdrop", async () => {
                        await systemSettingsUseCases.setNetworkAirdropDisabled(v)
                        store.setNetworkAirdropDisabled(v)
                      })
                    }}
                  />
                </div>
              </SettingGroup>
            </div>

            <div className="space-y-4">
              {/* ── Gatekeeper ── */}
              <SettingGroup title={t("systemSettings.privacy.gatekeeper")}>
                <div
                  className="hover:bg-muted/30 -m-1 cursor-pointer rounded p-1 transition-colors"
                  onClick={() => systemSettingsUseCases.openPrivacySecuritySettings()}
                >
                  <p className="text-muted-foreground py-2 text-xs">
                    {t("systemSettings.privacy.gatekeeperDesc")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        mode: "app_store" as GatekeeperMode,
                        label: t("systemSettings.privacy.gatekeeperAppStore"),
                      },
                      {
                        mode: "identified_developers" as GatekeeperMode,
                        label: t("systemSettings.privacy.gatekeeperIdentifiedDevs"),
                      },
                    ].map(({ mode, label }) => (
                      <Button
                        key={mode}
                        variant={store.gatekeeper === mode ? "default" : "outline"}
                        size="sm"
                        disabled
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 py-1">
                    <ExternalLink size={11} className="text-muted-foreground" />
                    <p className="text-muted-foreground text-xs">
                      {t("systemSettings.privacy.gatekeeperReadonly")}
                    </p>
                  </div>
                </div>
              </SettingGroup>

              {/* ── TCC Permissions ── */}
              <SettingGroup title={t("systemSettings.privacy.title")}>
                <p className="text-muted-foreground py-2 text-xs">
                  {t("systemSettings.privacy.description")}
                </p>
                <div className="space-y-0.5">
                  {(
                    [
                      { service: "kTCCServiceCamera", key: "camera" },
                      { service: "kTCCServiceMicrophone", key: "microphone" },
                      { service: "kTCCServiceScreenCapture", key: "screenRecording" },
                      { service: "kTCCServiceSystemPolicyAllFiles", key: "fullDiskAccess" },
                      { service: "kTCCServiceLocation", key: "location" },
                      { service: "kTCCServiceAccessibility", key: "accessibility" },
                    ] as const
                  ).map(({ service, key }) => {
                    const label = t(`systemSettings.privacy.${key}`)
                    return (
                      <div
                        key={service}
                        className="hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded px-2 py-1.5 transition-colors"
                        onClick={() => systemSettingsUseCases.openPrivacySecuritySettings()}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{label}</span>
                          <ExternalLink size={12} className="text-muted-foreground" />
                        </div>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={store.applyingKeys.size > 0}
                            onClick={async () => {
                              const bundleId = prompt(
                                t("systemSettings.privacy.resetPrompt", { label }),
                              )
                              if (bundleId) {
                                await run(
                                  `privacy.reset.${service}`,
                                  () =>
                                    systemSettingsUseCases.resetTccPermission(service, bundleId),
                                  {
                                    success: t("systemSettings.privacy.resetSuccess", {
                                      label,
                                      bundleId,
                                    }),
                                  },
                                )
                              }
                            }}
                          >
                            {t("systemSettings.privacy.reset")}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </SettingGroup>
            </div>
          </div>
        )

      // ═══════════════════════════════════════════
      // 系统 System
      // ═══════════════════════════════════════════
      case "system":
        return (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <Suspense fallback={<div className="text-muted-foreground flex h-20 items-center justify-center text-xs">{t("common.loading")}</div>}>
                <SleepSection />
              </Suspense>
              <Suspense fallback={<div className="text-muted-foreground flex h-20 items-center justify-center text-xs">{t("common.loading")}</div>}>
                <QuickActionsSection />
              </Suspense>

              {/* ── 系统设置快捷入口 ── */}
              <SettingGroup title={t("systemSettings.shortcuts.title")}>
                <p className="text-muted-foreground py-1 text-xs">
                  {t("systemSettings.shortcuts.description")}
                </p>
                <div className="flex flex-wrap gap-2 py-2">
                  {(
                    [
                      {
                        id: "hotCorners",
                        action: () => systemSettingsUseCases.openDesktopSettings(),
                        label: t("systemSettings.shortcuts.hotCorners"),
                      },
                      {
                        id: "lockScreen",
                        action: () => systemSettingsUseCases.openLockScreenSettings(),
                        label: t("systemSettings.shortcuts.lockScreen"),
                      },
                      {
                        id: "languageRegion",
                        action: () => systemSettingsUseCases.openLocalizationSettings(),
                        label: t("systemSettings.shortcuts.languageRegion"),
                      },
                      {
                        id: "keyboard",
                        action: () => systemSettingsUseCases.openKeyboardSettings(),
                        label: t("systemSettings.shortcuts.keyboard"),
                      },
                    ] as const
                  ).map(({ id, action, label }) => (
                    <Button
                      key={id}
                      variant="outline"
                      size="sm"
                      onClick={action}
                      className="gap-1.5"
                    >
                      <ExternalLink size={13} /> {label}
                    </Button>
                  ))}
                </div>
              </SettingGroup>

              {/* ── Finder ── */}
              <SettingGroup title={t("systemSettings.finder.title")}>
                <div className="space-y-1">
                  <SettingToggle
                    label={t("systemSettings.finder.hiddenFiles")}
                    checked={store.finderShowHiddenFiles}
                    loading={store.applyingKeys.has("finder.hiddenFiles")}
                    onCheckedChange={async (v) => {
                      await run("finder.hiddenFiles", async () => {
                        await systemSettingsUseCases.setFinderShowHiddenFiles(v)
                        store.setFinderShowHiddenFiles(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.finder.pathBar")}
                    description={t("systemSettings.finder.pathBarDesc")}
                    checked={store.finderShowPathbar}
                    loading={store.applyingKeys.has("finder.pathBar")}
                    onCheckedChange={async (v) => {
                      await run("finder.pathBar", async () => {
                        await systemSettingsUseCases.setFinderShowPathbar(v)
                        store.setFinderShowPathbar(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.finder.statusBar")}
                    description={t("systemSettings.finder.statusBarDesc")}
                    checked={store.finderShowStatusbar}
                    loading={store.applyingKeys.has("finder.statusBar")}
                    onCheckedChange={async (v) => {
                      await run("finder.statusBar", async () => {
                        await systemSettingsUseCases.setFinderShowStatusbar(v)
                        store.setFinderShowStatusbar(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.finder.libraryDir")}
                    description={t("systemSettings.finder.libraryDirDesc")}
                    checked={store.finderShowLibraryDir}
                    loading={store.applyingKeys.has("finder.libraryDir")}
                    onCheckedChange={async (v) => {
                      await run("finder.libraryDir", async () => {
                        await systemSettingsUseCases.setFinderShowLibraryDir(v)
                        store.setFinderShowLibraryDir(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.finder.fileExtensions")}
                    checked={store.finderShowFileExtensions}
                    loading={store.applyingKeys.has("finder.fileExtensions")}
                    onCheckedChange={async (v) => {
                      await run("finder.fileExtensions", async () => {
                        await systemSettingsUseCases.setFinderShowFileExtensions(v)
                        store.setFinderShowFileExtensions(v)
                      })
                    }}
                  />
                  <SettingToggle
                    label={t("systemSettings.finder.noDsStore")}
                    checked={store.finderNoDsStore}
                    loading={store.applyingKeys.has("finder.noDsStore")}
                    onCheckedChange={async (v) => {
                      await run("finder.noDsStore", async () => {
                        await systemSettingsUseCases.setFinderNoDsStore(v)
                        store.setFinderNoDsStore(v)
                      })
                    }}
                  />
                </div>
              </SettingGroup>
            </div>

            <div className="space-y-4">
              {/* ── Power & LowPowerMode ── */}
              <SettingGroup title={t("systemSettings.toggles.batteryStrategy")}>
                <div
                  className="flex cursor-pointer items-center gap-1.5 pb-1"
                  onClick={() => systemSettingsUseCases.openBatterySettings()}
                >
                  <span className="text-muted-foreground hover:text-foreground text-xs transition-colors">
                    {t("systemSettings.toggles.lowPowerMode")}
                  </span>
                  <ExternalLink
                    size={11}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { mode: "never", label: t("systemSettings.toggles.lowPowerNever") },
                      { mode: "always", label: t("systemSettings.toggles.lowPowerAlways") },
                      {
                        mode: "on_battery_only",
                        label: t("systemSettings.toggles.lowPowerOnBattery"),
                      },
                      { mode: "on_ac_only", label: t("systemSettings.toggles.lowPowerOnAC") },
                    ] as { mode: LowPowerMode; label: string }[]
                  ).map(({ mode, label }) => (
                    <Button
                      key={mode}
                      variant={store.lowPowerMode === mode ? "default" : "outline"}
                      size="sm"
                      disabled={store.applyingKeys.has("toggles.lowPowerMode")}
                      onClick={async () => {
                        if (store.lowPowerMode === mode) return
                        await run("toggles.lowPowerMode", async () => {
                          await systemSettingsUseCases.setLowPowerModeState(mode)
                          store.setLowPowerMode(mode)
                        })
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <SettingToggle
                  label={t("systemSettings.toggles.screenSaver")}
                  description={t("systemSettings.toggles.screenSaverDesc")}
                  checked={store.screenSaver}
                  loading={store.applyingKeys.has("toggles.screenSaver")}
                  onOpenSettings={() => systemSettingsUseCases.openDesktopSettings()}
                  onCheckedChange={async (v) => {
                    await run("toggles.screenSaver", async () => {
                      await systemSettingsUseCases.setScreenSaverState(v)
                      store.setScreenSaver(v)
                    })
                  }}
                />
              </SettingGroup>

              {/* ── Default Browser ── */}
              <SettingGroup title={t("systemSettings.browser.title")}>
                <div className="relative">
                  <Select
                    value={defaultBrowser}
                    disabled={browserLoading}
                    onValueChange={async (v) => {
                      setBrowserLoading(true)
                      try {
                        await systemSettingsUseCases.setDefaultBrowser(v)
                        store.setDefaultBrowser(v)
                        setDefaultBrowser(v)
                        toast.success(t("systemSettings.toasts.success"))
                      } catch (err) {
                        toast.error(
                          t("systemSettings.toasts.error", { error: getErrorMessage(err) }),
                        )
                      } finally {
                        setBrowserLoading(false)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BROWSER_OPTIONS.map(({ value, labelKey }) => (
                        <SelectItem key={value} value={value}>
                          {t(labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {browserLoading && (
                    <Loader2Icon className="text-muted-foreground absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 animate-spin" />
                  )}
                </div>
              </SettingGroup>

              <Suspense fallback={<div className="text-muted-foreground flex h-20 items-center justify-center text-xs">{t("common.loading")}</div>}>
                <KeyboardSection />
              </Suspense>

              {/* ── Login Items ── */}
              <SettingGroup title={t("systemSettings.login.title")}>
                <div className="py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => systemSettingsUseCases.openLoginItemsSettings()}
                    disabled={loginItemsLoading}
                  >
                    <ExternalLink size={13} className="mr-1.5" />
                    {t("systemSettings.login.manageInSettings")}
                  </Button>
                </div>
                {loginItemsLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2Icon className="text-muted-foreground h-4 w-4 animate-spin" />
                    <span className="text-muted-foreground text-xs">{t("common.loading")}</span>
                  </div>
                ) : loginItems.length === 0 ? (
                  <p className="text-muted-foreground py-2 text-xs">
                    {t("systemSettings.login.noItems")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {loginItems.map((item, idx) => (
                      <div
                        key={item.name || `login-item-${idx}`}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm">{item.name || t("common.unknown")}</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={store.applyingKeys.size > 0}
                          onClick={() => setLoginItemToRemove(item.name)}
                        >
                          {t("systemSettings.login.remove")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </SettingGroup>
            </div>
          </div>
        )

      // ═══════════════════════════════════════════
      // 高级 Advanced
      // ═══════════════════════════════════════════
      case "advanced":
        return (
          <div className="space-y-4">
            <SettingGroup title={t("systemSettings.login.launchAgents")}>
              {launchAgentsLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2Icon className="text-muted-foreground h-4 w-4 animate-spin" />
                  <span className="text-muted-foreground text-xs">{t("common.loading")}</span>
                </div>
              ) : launchAgents.length === 0 ? (
                <p className="text-muted-foreground py-2 text-xs">
                  {t("systemSettings.login.noAgents")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {launchAgents.map((agent) => (
                    <div
                      key={agent.path}
                      className="hover:bg-muted/50 flex items-center justify-between rounded px-2 py-1.5 transition-colors"
                    >
                      <span className="truncate text-sm">{agent.name || t("common.unknown")}</span>
                      <Badge variant="secondary" className="text-xs">
                        {agent.path.split("/").pop()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </SettingGroup>

            <SettingGroup title={t("systemSettings.login.launchDaemons")}>
              {launchDaemonsLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2Icon className="text-muted-foreground h-4 w-4 animate-spin" />
                  <span className="text-muted-foreground text-xs">{t("common.loading")}</span>
                </div>
              ) : launchDaemons.length === 0 ? (
                <p className="text-muted-foreground py-2 text-xs">
                  {t("systemSettings.login.noDaemons")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {launchDaemons.map((daemon) => (
                    <div
                      key={daemon.path}
                      className="hover:bg-muted/50 flex items-center justify-between rounded px-2 py-1.5 transition-colors"
                    >
                      <span className="truncate text-sm">{daemon.name || t("common.unknown")}</span>
                      <Badge variant="secondary" className="text-xs">
                        {daemon.path.split("/").pop()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </SettingGroup>
          </div>
        )

      default:
        return null
    }
  }

  // ── UI: horizontal tab bar + content ──
  const tabLabels: Record<SettingsTab, string> = {
    appearance: t("systemSettings.tabs.appearance"),
    security: t("systemSettings.tabs.security"),
    system: t("systemSettings.tabs.system"),
    advanced: t("systemSettings.tabs.advanced"),
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="shrink-0 border-b px-4 py-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("systemSettings.search.placeholder")}
            className="h-8 pr-8 pl-8 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
              aria-label={t("systemSettings.search.clear")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal tab bar — hidden while searching */}
      {!searchQuery && (
        <div className="flex shrink-0 gap-1 border-b px-4">
          {TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              onClick={() => handleTabChange(tabId)}
              className={cn(
                "-mb-[1px] border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                store.activeTab === tabId
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
              )}
            >
              {tabLabels[tabId]}
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {searchQuery ? (
          searchResults.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("systemSettings.search.noResults")}
            </p>
          ) : (
            <div className="space-y-1">
              {searchResults.map((result, idx) => (
                <button
                  key={`${result.tab}-${result.labelKey}-${idx}`}
                  type="button"
                  onClick={() => {
                    handleTabChange(result.tab)
                    setSearchQuery("")
                  }}
                  className="hover:bg-muted/50 hover:border-border w-full rounded-lg border border-transparent p-3 text-left transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{result.label}</span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {result.tabLabel}
                    </Badge>
                  </div>
                  {result.desc && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                      {result.desc}
                    </p>
                  )}
                  <p className="text-muted-foreground/70 mt-1 text-xs">{result.section}</p>
                </button>
              ))}
            </div>
          )
        ) : (
          renderTabContent()
        )}
      </div>

      {loginItemToRemove && (
        <DestructiveConfirmDialog
          open={loginItemToRemove !== null}
          onOpenChange={(open) => {
            if (!open) setLoginItemToRemove(null)
          }}
          title={t("systemSettings.login.removeConfirmTitle")}
          description={t("systemSettings.login.removeConfirmDescription", {
            name: loginItemToRemove,
          })}
          consequence={t("systemSettings.login.removeConsequence")}
          confirmLabel={t("systemSettings.login.remove")}
          cancelLabel={t("common.cancel")}
          loading={store.applyingKeys.has(`login.remove.${loginItemToRemove}`)}
          onConfirm={async () => {
            const name = loginItemToRemove
            if (!name) return
            await run(`login.remove.${name}`, async () => {
              await systemSettingsUseCases.removeLoginItem(name)
              const items = await systemSettingsUseCases.getLoginItems()
              store.setLoginItems(items)
              setLoginItems(items)
            })
            setLoginItemToRemove(null)
          }}
        />
      )}
    </div>
  )
}
