/**
 * System Settings Page / 系统设置页面: main page view.
 *
 * v2 — 重设计: 9 个 Tab → 3 个 Tab (外观/安全/系统)，
 * SettingsDialog 内容合并入此页，devtools/diagnostics/info 移入独立页面。
 */
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2Icon, ExternalLink } from "lucide-react";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "./components/SettingToggle";
import { SettingGroup } from "@/components/ui/setting-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { AppFeature } from "@/features/types";
import type { SettingsTab } from "./store";
import type { GatekeeperMode, LowPowerMode, MenuBarAutoHideMode } from "@/lib/tauri/types/system-settings";
import {
  SleepSection, LockScreenSection, KeyboardSection, DisplaySection, DockSection,
  QuickActionsSection,
} from "./components/sections";
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog";

// ── Constants ──

const TAB_IDS: SettingsTab[] = ["appearance", "security", "system"];

const BROWSER_OPTIONS = [
  { value: "com.apple.Safari", labelKey: "systemSettings.browser.options.safari" },
  { value: "com.google.Chrome", labelKey: "systemSettings.browser.options.chrome" },
  { value: "com.microsoft.edgemac", labelKey: "systemSettings.browser.options.edge" },
  { value: "org.mozilla.firefox", labelKey: "systemSettings.browser.options.firefox" },
  { value: "com.brave.Browser", labelKey: "systemSettings.browser.options.brave" },
  { value: "com.operasoftware.Opera", labelKey: "systemSettings.browser.options.opera" },
  { value: "company.thebrowser.Browser", labelKey: "systemSettings.browser.options.arc" },
] as const;

interface SystemSettingsProps { feature: AppFeature; }

export default function SystemSettings(_props: SystemSettingsProps) {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  // ── State for System tab (Login items) ──

  const [loginItems, setLoginItems] = useState(useSystemSettingsStore.getState().loginItems);
  const [launchAgents, setLaunchAgents] = useState<{ name: string; path: string; enabled: boolean }[]>([]);
  const [launchDaemons, setLaunchDaemons] = useState<{ name: string; path: string; enabled: boolean }[]>([]);
  const [newLoginItemPath, setNewLoginItemPath] = useState("");
  const [loginItemToRemove, setLoginItemToRemove] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Default browser state
  const [defaultBrowser, setDefaultBrowser] = useState(store.defaultBrowser);
  const [browserLoading, setBrowserLoading] = useState(false);

  const loadTabSettings = useCallback(async (tab: SettingsTab) => {
    const s = useSystemSettingsStore.getState();
    if (s.loadedTabs.has(tab)) return;
    setTabLoading(true);
    try {
      switch (tab) {
        case "appearance": break; // Self-loading sections
        case "security": break;   // Self-loading sections
        case "system": {
          try {
            const b = await systemSettingsUseCases.getDefaultBrowser();
            store.setDefaultBrowser(b);
            setDefaultBrowser(b);
          } catch {
            toast.error(t("systemSettings.browser.loadFailed"));
          }
          const [items, agents, daemons] = await Promise.all([
            systemSettingsUseCases.getLoginItems(),
            systemSettingsUseCases.getLaunchAgents(),
            systemSettingsUseCases.getLaunchDaemons(),
          ]);
          s.setLoginItems(items);
          setLoginItems(items);
          setLaunchAgents(agents);
          setLaunchDaemons(daemons);
          break;
        }
      }
      s.markTabLoaded(tab);
    } catch (err) {
      console.error(`Failed to load ${tab} settings:`, err);
    } finally {
      setTabLoading(false);
    }
  }, [store, t]);

  useEffect(() => {
    if (systemSettingsUseCases.isAvailable()) {
      void loadTabSettings(store.activeTab);
    }
  }, [store.activeTab, loadTabSettings]);

  const handleTabChange = (tab: SettingsTab) => {
    store.setActiveTab(tab);
  };

  const renderTabContent = () => {
    if (tabLoading) {
      return (
        <div className="flex items-center justify-center h-32">
          <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    switch (store.activeTab) {
      // ═══════════════════════════════════════════
      // 外观 Appearance
      // ═══════════════════════════════════════════
      case "appearance":
        return (
          <div className="space-y-6">
            {/* ── Display ── */}
            <DisplaySection />

            {/* ── Dock & Menu Bar ── */}
            <DockSection />
            <SettingGroup title={t("systemSettings.toggles.title")}>
              <SettingToggle
                label={t("systemSettings.toggles.autohideDock")}
                description={t("systemSettings.toggles.autohideDockDesc")}
                checked={store.autohideDock}
                loading={store.applyingKeys.has("toggles.autoHideDock")}
                onCheckedChange={async (v) => { await run("toggles.autoHideDock", async () => { await systemSettingsUseCases.setAutohideDockState(v); store.setAutohideDock(v); }); }}
              />
              <div className="space-y-2 py-2">
                <Label className="text-sm font-medium">{t("systemSettings.toggles.autohideMenuBar")}</Label>
                <p className="text-xs text-muted-foreground">{t("systemSettings.toggles.autohideMenuBarDesc")}</p>
                <div className="flex gap-2 flex-wrap">
                  {([{ mode: "never", label: t("systemSettings.toggles.menuBarNever") }, { mode: "in_full_screen_only", label: t("systemSettings.toggles.menuBarFullScreen") }, { mode: "on_desktop_only", label: t("systemSettings.toggles.menuBarDesktop") }, { mode: "always", label: t("systemSettings.toggles.menuBarAlways") }] as { mode: MenuBarAutoHideMode; label: string }[]).map(({ mode, label }) => (
                    <Button key={mode} variant={store.autohideMenuBar === mode ? "default" : "outline"} size="sm" disabled={store.applyingKeys.has("toggles.autoHideMenuBar")} onClick={async () => {
                      if (store.autohideMenuBar === mode) return;
                      await run("toggles.autoHideMenuBar", async () => { await systemSettingsUseCases.setAutohideMenuBarState(mode); store.setAutohideMenuBar(mode); });
                    }}>{label}</Button>
                  ))}
                </div>
              </div>
              <SettingToggle
                label={t("systemSettings.toggles.dockShowRecents")}
                description={t("systemSettings.toggles.dockShowRecentsDesc")}
                checked={store.dockShowRecents}
                loading={store.applyingKeys.has("toggles.dockShowRecents")}
                onCheckedChange={async (v) => { await run("toggles.dockShowRecents", async () => { await systemSettingsUseCases.setDockShowRecentsState(v); store.setDockShowRecents(v); }); }}
              />
              <SettingToggle
                label={t("systemSettings.toggles.smallLaunchpadIcon")}
                description={t("systemSettings.toggles.smallLaunchpadIconDesc")}
                checked={store.smallLaunchpadIcon}
                loading={store.applyingKeys.has("toggles.smallLaunchpadIcon")}
                onCheckedChange={async (v) => { await run("toggles.smallLaunchpadIcon", async () => { await systemSettingsUseCases.setSmallLaunchpadIconState(v); store.setSmallLaunchpadIcon(v); }); }}
              />
            </SettingGroup>

            {/* ── Desktop ── */}
            <SettingToggle
              label={t("systemSettings.toggles.hideDesktopIcons")}
              description={t("systemSettings.toggles.hideDesktopIconsDesc")}
              checked={store.hideDesktopIcons}
              loading={store.applyingKeys.has("toggles.hideDesktopIcons")}
              onCheckedChange={async (v) => { await run("toggles.hideDesktopIcons", async () => { await systemSettingsUseCases.setHideDesktopIconsState(v); store.setHideDesktopIcons(v); }); }}
            />

            {/* ── Screenshot ── */}
            <SettingGroup title={t("systemSettings.screenshot.title")}>
              <SettingToggle
                label={t("systemSettings.screenshot.disableShadow")}
                checked={store.screenshotDisableShadow}
                loading={store.applyingKeys.has("screenshot.disableShadow")}
                onCheckedChange={async (v) => { await run("screenshot.disableShadow", async () => { await systemSettingsUseCases.setScreenshotDisableShadow(v); store.setScreenshotDisableShadow(v); }); }}
              />
              <SettingToggle
                label={t("systemSettings.screenshot.showThumbnail")}
                checked={store.screenshotShowThumbnail}
                loading={store.applyingKeys.has("screenshot.showThumbnail")}
                onCheckedChange={async (v) => { await run("screenshot.showThumbnail", async () => { await systemSettingsUseCases.setScreenshotShowThumbnail(v); store.setScreenshotShowThumbnail(v); }); }}
              />
              <div className="space-y-2 py-2">
                <Label className="text-sm font-medium">{t("systemSettings.screenshot.format")}</Label>
                <div className="flex gap-2">
                  {["png", "jpg", "bmp", "pdf", "tiff"].map((fmt) => (
                    <Button key={fmt} variant={store.screenshotFormat === fmt ? "default" : "outline"} size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                      await run("screenshot.format", async () => { await systemSettingsUseCases.setScreenshotFormat(fmt); store.setScreenshotFormat(fmt); });
                    }}>{fmt.toUpperCase()}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 py-2">
                <Label className="text-sm font-medium">{t("systemSettings.screenshot.saveLocation")}</Label>
                <Input value={store.screenshotSaveLocation} onChange={(e) => store.setScreenshotSaveLocation(e.target.value)} disabled={store.applyingKeys.size > 0}
                  onBlur={async () => { await run("screenshot.saveLocation", async () => { await systemSettingsUseCases.setScreenshotSaveLocation(store.screenshotSaveLocation); }); }}
                  placeholder={t("systemSettings.screenshot.saveLocationPlaceholder")} />
              </div>
            </SettingGroup>
          </div>
        );

      // ═══════════════════════════════════════════
      // 安全与隐私 Security
      // ═══════════════════════════════════════════
      case "security":
        return (
          <div className="space-y-6">
            <LockScreenSection />

            {/* ── Network ── */}
            <SettingGroup title={t("systemSettings.network.title")}>
              <SettingToggle
                label={t("systemSettings.network.firewall")}
                description={t("systemSettings.network.firewallDesc")}
                checked={store.networkFirewall}
                loading={store.applyingKeys.has("network.firewall")}
                onCheckedChange={async (v) => { await run("network.firewall", async () => { await systemSettingsUseCases.setNetworkFirewallState(v); store.setNetworkFirewall(v); }); }}
              />
              <SettingToggle
                label={t("systemSettings.network.ssh")}
                description={t("systemSettings.network.sshDesc")}
                checked={store.networkSsh}
                loading={store.applyingKeys.has("network.ssh")}
                onCheckedChange={async (v) => { await run("network.ssh", async () => { await systemSettingsUseCases.setNetworkSshState(v); store.setNetworkSsh(v); }); }}
              />
              <SettingToggle
                label={t("systemSettings.network.screenSharing")}
                checked={store.networkScreenSharing}
                loading={store.applyingKeys.has("network.screenSharing")}
                onCheckedChange={async (v) => { await run("network.screenSharing", async () => { await systemSettingsUseCases.setNetworkScreenSharingState(v); store.setNetworkScreenSharing(v); }); }}
              />
              <SettingToggle
                label={t("systemSettings.network.airdrop")}
                description={t("systemSettings.network.airdropDesc")}
                checked={store.networkAirdropDisabled}
                loading={store.applyingKeys.has("network.airdrop")}
                onCheckedChange={async (v) => { await run("network.airdrop", async () => { await systemSettingsUseCases.setNetworkAirdropDisabled(v); store.setNetworkAirdropDisabled(v); }); }}
              />
            </SettingGroup>

            {/* ── Gatekeeper ── */}
            <SettingGroup title={t("systemSettings.privacy.gatekeeper")}>
              <p className="text-xs text-muted-foreground py-2">{t("systemSettings.privacy.gatekeeperDesc")}</p>
              <div className="flex gap-2">
                {([{ mode: "app_store" as GatekeeperMode, label: t("systemSettings.privacy.gatekeeperAppStore") }, { mode: "identified_developers" as GatekeeperMode, label: t("systemSettings.privacy.gatekeeperIdentifiedDevs") }]).map(({ mode, label }) => (
                  <Button key={mode} variant={store.gatekeeper === mode ? "default" : "outline"} size="sm" disabled>{label}</Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground py-1">{t("systemSettings.privacy.gatekeeperReadonly")}</p>
            </SettingGroup>

            {/* ── TCC Permissions ── */}
            <SettingGroup title={t("systemSettings.privacy.title")}>
              <p className="text-xs text-muted-foreground py-2">{t("systemSettings.privacy.description")}</p>
              {([{ service: "kTCCServiceCamera", key: "camera" }, { service: "kTCCServiceMicrophone", key: "microphone" }, { service: "kTCCServiceScreenCapture", key: "screenRecording" }, { service: "kTCCServiceSystemPolicyAllFiles", key: "fullDiskAccess" }, { service: "kTCCServiceLocation", key: "location" }, { service: "kTCCServiceAccessibility", key: "accessibility" }] as const).map(({ service, key }) => {
                const label = t(`systemSettings.privacy.${key}`);
                return (
                  <div key={service} className="flex items-center justify-between py-1">
                    <span className="text-sm">{label}</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                        const perms = await run(`privacy.view.${service}`, () => systemSettingsUseCases.getTccPermissions(service));
                        if (!perms) return;
                        const msg = t("systemSettings.privacy.tccDetail", {
                          label,
                          allowedLabel: t("systemSettings.privacy.tccAllowed"),
                          deniedLabel: t("systemSettings.privacy.tccDenied"),
                          allowed: perms.allowed.join(", ") || t("systemSettings.privacy.tccNone"),
                          denied: perms.denied.join(", ") || t("systemSettings.privacy.tccNone"),
                        });
                        toast.info(msg, { duration: 8000 });
                      }}>{t("systemSettings.privacy.view")}</Button>
                      <Button variant="destructive" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                        const bundleId = prompt(t("systemSettings.privacy.resetPrompt", { label }));
                        if (bundleId) { await run(`privacy.reset.${service}`, () => systemSettingsUseCases.resetTccPermission(service, bundleId), { success: t("systemSettings.privacy.resetSuccess", { label, bundleId }) }); }
                      }}>{t("systemSettings.privacy.reset")}</Button>
                    </div>
                  </div>
                );
              })}
            </SettingGroup>

            {/* ── Mic Mute ── */}
            <SettingToggle
              label={t("systemSettings.toggles.muteMic")}
              description={t("systemSettings.toggles.muteMicDesc")}
              checked={store.muteMic}
              loading={store.applyingKeys.has("toggles.muteMic")}
              onCheckedChange={async (v) => { await run("toggles.muteMic", async () => { await systemSettingsUseCases.setMuteMicState(v); store.setMuteMic(v); }); }}
            />
          </div>
        );

      // ═══════════════════════════════════════════
      // 系统 System
      // ═══════════════════════════════════════════
      case "system":
        return (
          <div className="space-y-6">
            <SleepSection />
            <KeyboardSection />

            {/* ── Finder ── */}
            <SettingGroup title={t("systemSettings.finder.title")}>
              <SettingToggle label={t("systemSettings.finder.hiddenFiles")} checked={store.finderShowHiddenFiles} loading={store.applyingKeys.has("finder.hiddenFiles")}
                onCheckedChange={async (v) => { await run("finder.hiddenFiles", async () => { await systemSettingsUseCases.setFinderShowHiddenFiles(v); store.setFinderShowHiddenFiles(v); }); }} />
              <SettingToggle label={t("systemSettings.finder.pathBar")} description={t("systemSettings.finder.pathBarDesc")} checked={store.finderShowPathbar} loading={store.applyingKeys.has("finder.pathBar")}
                onCheckedChange={async (v) => { await run("finder.pathBar", async () => { await systemSettingsUseCases.setFinderShowPathbar(v); store.setFinderShowPathbar(v); }); }} />
              <SettingToggle label={t("systemSettings.finder.statusBar")} description={t("systemSettings.finder.statusBarDesc")} checked={store.finderShowStatusbar} loading={store.applyingKeys.has("finder.statusBar")}
                onCheckedChange={async (v) => { await run("finder.statusBar", async () => { await systemSettingsUseCases.setFinderShowStatusbar(v); store.setFinderShowStatusbar(v); }); }} />
              <SettingToggle label={t("systemSettings.finder.libraryDir")} description={t("systemSettings.finder.libraryDirDesc")} checked={store.finderShowLibraryDir} loading={store.applyingKeys.has("finder.libraryDir")}
                onCheckedChange={async (v) => { await run("finder.libraryDir", async () => { await systemSettingsUseCases.setFinderShowLibraryDir(v); store.setFinderShowLibraryDir(v); }); }} />
              <SettingToggle label={t("systemSettings.finder.fileExtensions")} checked={store.finderShowFileExtensions} loading={store.applyingKeys.has("finder.fileExtensions")}
                onCheckedChange={async (v) => { await run("finder.fileExtensions", async () => { await systemSettingsUseCases.setFinderShowFileExtensions(v); store.setFinderShowFileExtensions(v); }); }} />
              <SettingToggle label={t("systemSettings.finder.noDsStore")} checked={store.finderNoDsStore} loading={store.applyingKeys.has("finder.noDsStore")}
                onCheckedChange={async (v) => { await run("finder.noDsStore", async () => { await systemSettingsUseCases.setFinderNoDsStore(v); store.setFinderNoDsStore(v); }); }} />
            </SettingGroup>

            {/* ── Power & LowPowerMode ── */}
            <SettingGroup title={t("systemSettings.toggles.lowPowerMode")}>
              <p className="text-xs text-muted-foreground py-1">{t("systemSettings.toggles.lowPowerModeDesc")}</p>
              <div className="flex gap-2 flex-wrap">
                {([{ mode: "never", label: t("systemSettings.toggles.lowPowerNever") }, { mode: "always", label: t("systemSettings.toggles.lowPowerAlways") }, { mode: "on_battery_only", label: t("systemSettings.toggles.lowPowerOnBattery") }, { mode: "on_ac_only", label: t("systemSettings.toggles.lowPowerOnAC") }] as { mode: LowPowerMode; label: string }[]).map(({ mode, label }) => (
                  <Button key={mode} variant={store.lowPowerMode === mode ? "default" : "outline"} size="sm" disabled={store.applyingKeys.has("toggles.lowPowerMode")} onClick={async () => {
                    if (store.lowPowerMode === mode) return;
                    await run("toggles.lowPowerMode", async () => { await systemSettingsUseCases.setLowPowerModeState(mode); store.setLowPowerMode(mode); });
                  }}>{label}</Button>
                ))}
              </div>
              <SettingToggle
                label={t("systemSettings.toggles.screenSaver")}
                description={t("systemSettings.toggles.screenSaverDesc")}
                checked={store.screenSaver} loading={store.applyingKeys.has("toggles.screenSaver")}
                onCheckedChange={async (v) => { await run("toggles.screenSaver", async () => { await systemSettingsUseCases.setScreenSaverState(v); store.setScreenSaver(v); }); }}
              />
            </SettingGroup>

            {/* ── Login Items ── */}
            <SettingGroup title={t("systemSettings.login.title")}>
              <div className="flex gap-2 py-2">
                <Input value={newLoginItemPath} onChange={(e) => setNewLoginItemPath(e.target.value)} placeholder={t("systemSettings.login.placeholder")} className="flex-1" />
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                  if (newLoginItemPath) { await run("login.add", async () => { await systemSettingsUseCases.addLoginItem(newLoginItemPath); setNewLoginItemPath(""); const items = await systemSettingsUseCases.getLoginItems(); store.setLoginItems(items); setLoginItems(items); }); }
                }}>{t("systemSettings.login.add")}</Button>
              </div>
              {loginItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t("systemSettings.login.noItems")}</p>
              ) : (
                <div className="space-y-1">
                  {loginItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between py-1">
                      <span className="text-sm">{item.name}</span>
                      <Button variant="destructive" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => setLoginItemToRemove(item.name)}>
                        {t("systemSettings.login.remove")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </SettingGroup>

            <SettingGroup title={t("systemSettings.login.launchAgents")}>
              {launchAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t("systemSettings.login.noAgents")}</p>
              ) : (
                <div className="space-y-1">
                  {launchAgents.map((agent) => (
                    <div key={agent.name} className="flex items-center justify-between py-1"><span className="text-sm truncate">{agent.name}</span><Badge variant="secondary" className="text-xs">{agent.path.split("/").pop()}</Badge></div>
                  ))}
                </div>
              )}
            </SettingGroup>

            <SettingGroup title={t("systemSettings.login.launchDaemons")}>
              {launchDaemons.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t("systemSettings.login.noDaemons")}</p>
              ) : (
                <div className="space-y-1">
                  {launchDaemons.map((daemon) => (
                    <div key={daemon.name} className="flex items-center justify-between py-1"><span className="text-sm truncate">{daemon.name}</span><Badge variant="secondary" className="text-xs">{daemon.path.split("/").pop()}</Badge></div>
                  ))}
                </div>
              )}
            </SettingGroup>

            {/* ── Default Browser ── */}
            <SettingGroup title={t("systemSettings.browser.title")}>
              <select
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={defaultBrowser}
                disabled={browserLoading}
                onChange={async (e) => {
                  setBrowserLoading(true);
                  try {
                    await systemSettingsUseCases.setDefaultBrowser(e.target.value);
                    store.setDefaultBrowser(e.target.value);
                    setDefaultBrowser(e.target.value);
                    toast.success(t("systemSettings.toasts.success"));
                  } catch (err) {
                    toast.error(t("systemSettings.toasts.error", { error: String(err) }));
                  } finally {
                    setBrowserLoading(false);
                  }
                }}
              >
                {BROWSER_OPTIONS.map(({ value, labelKey }) => (
                  <option key={value} value={value}>{t(labelKey)}</option>
                ))}
              </select>
            </SettingGroup>

            {/* ── 系统设置快捷入口 ── */}
            <SettingGroup title={t("systemSettings.shortcuts.title")}>
              <p className="text-xs text-muted-foreground py-1">{t("systemSettings.shortcuts.description")}</p>
              <div className="flex flex-wrap gap-2 py-2">
                {([
                  { id: "com.apple.Desktop-Settings.extension", label: t("systemSettings.shortcuts.hotCorners") },
                  { id: "com.apple.Lock-Screen-Settings.extension", label: t("systemSettings.shortcuts.lockScreen") },
                  { id: "com.apple.Localization-Settings.extension", label: t("systemSettings.shortcuts.languageRegion") },
                  { id: "com.apple.Keyboard-Settings.extension", label: t("systemSettings.shortcuts.keyboard") },
                ] as const).map(({ id, label }) => (
                  <Button
                    key={id}
                    variant="outline"
                    size="sm"
                    onClick={() => systemSettingsUseCases.openSystemPane(id)}
                    className="gap-1.5"
                  >
                    <ExternalLink size={13} /> {label}
                  </Button>
                ))}
              </div>
            </SettingGroup>

            <QuickActionsSection />
          </div>
        );

      default:
        return null;
    }
  };

  // ── UI: horizontal tab bar + content ──
  const tabLabels: Record<SettingsTab, string> = {
    appearance: t("systemSettings.tabs.appearance"),
    security: t("systemSettings.tabs.security"),
    system: t("systemSettings.tabs.system"),
  };

  return (
    <div className="flex flex-col h-full">
      {/* Horizontal tab bar */}
      <div className="border-b px-4 flex gap-1 shrink-0">
        {TAB_IDS.map((tabId) => (
          <button
            key={tabId}
            onClick={() => handleTabChange(tabId)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              store.activeTab === tabId
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {tabLabels[tabId]}
          </button>
        ))}
      </div>
      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {renderTabContent()}
      </div>

      {loginItemToRemove && (
        <DestructiveConfirmDialog
          open={loginItemToRemove !== null}
          onOpenChange={(open) => {
            if (!open) setLoginItemToRemove(null);
          }}
          title={t("systemSettings.login.removeConfirmTitle")}
          description={t("systemSettings.login.removeConfirmDescription", { name: loginItemToRemove })}
          consequence={t("systemSettings.login.removeConsequence")}
          confirmLabel={t("systemSettings.login.remove")}
          cancelLabel={t("common.cancel")}
          loading={store.applyingKeys.has(`login.remove.${loginItemToRemove}`)}
          onConfirm={async () => {
            const name = loginItemToRemove;
            if (!name) return;
            await run(`login.remove.${name}`, async () => {
              await systemSettingsUseCases.removeLoginItem(name);
              const items = await systemSettingsUseCases.getLoginItems();
              store.setLoginItems(items);
              setLoginItems(items);
            });
            setLoginItemToRemove(null);
          }}
        />
      )}
    </div>
  );
}
