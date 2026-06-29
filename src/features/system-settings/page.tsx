/**
 * System Settings Page / 系统设置页面: main page view.
 *
 * v2 — 重设计: 9 个 Tab → 3 个 Tab (外观/安全/系统)，
 * SettingsDialog 内容合并入此页，devtools/diagnostics/info 移入独立页面。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "./components/SettingToggle";
import { SettingGroup } from "@/components/ui/setting-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AppFeature } from "@/features/types";
import type { SettingsTab } from "./store";
import type { GatekeeperMode, LowPowerMode, MenuBarAutoHideMode } from "@/lib/tauri/types/system-settings";
import {
  SleepSection, LockScreenSection, KeyboardSection, DisplaySection, DockSection,
} from "./components/sections";

// ── Constants ──

const TAB_IDS: SettingsTab[] = ["appearance", "security", "system"];

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
  const [tabLoading, setTabLoading] = useState(false);

  const loadTabSettings = async (tab: SettingsTab) => {
    const s = useSystemSettingsStore.getState();
    if (s.loadedTabs.has(tab)) return;
    setTabLoading(true);
    try {
      switch (tab) {
        case "appearance": break; // Self-loading sections
        case "security": break;   // Self-loading sections
        case "system": {
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
  };

  useEffect(() => {
    if (systemSettingsUseCases.isAvailable()) {
      void loadTabSettings(store.activeTab);
    }
  }, [store.activeTab]);

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
                label={t("systemSettings.toggles.autoHideDock")}
                description={t("systemSettings.toggles.autoHideDockDesc")}
                checked={store.autohideDock}
                loading={store.applyingKeys.has("toggles.autoHideDock")}
                onCheckedChange={async (v) => { await run("toggles.autoHideDock", async () => { await systemSettingsUseCases.setAutohideDockState(v); store.setAutohideDock(v); }); }}
              />
              <div className="space-y-2 py-2">
                <Label className="text-sm font-medium">{t("systemSettings.toggles.autoHideMenuBar")}</Label>
                <p className="text-xs text-muted-foreground">{t("systemSettings.toggles.autoHideMenuBarDesc")}</p>
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
                        const msg = `${label}:\nAllowed: ${perms.allowed.join(", ") || "none"}\nDenied: ${perms.denied.join(", ") || "none"}`;
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
                      <Button variant="destructive" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                        await run(`login.remove.${item.name}`, async () => { await systemSettingsUseCases.removeLoginItem(item.name); const items = await systemSettingsUseCases.getLoginItems(); store.setLoginItems(items); setLoginItems(items); });
                      }}>{t("systemSettings.login.remove")}</Button>
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

            {/* ── 快捷操作 (危险操作区) ── */}
            <SettingGroup title={t("systemSettings.actions.title")}>
              <Alert className="mb-3 border-orange-500/50 bg-orange-500/10 text-sm">
                <AlertDescription className="text-xs">{t("systemSettings.actions.warning")}</AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => run("quickActions.lockScreen", () => systemSettingsUseCases.lockScreen())}>{t("systemSettings.actions.lockScreen")}</Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => run("quickActions.emptyTrash", () => systemSettingsUseCases.emptyTrash())}>{t("systemSettings.actions.emptyTrash")}</Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => run("quickActions.sleepNow", () => systemSettingsUseCases.sleepNow())}>{t("systemSettings.actions.sleepNow")}</Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => { if (confirm(t("systemSettings.actions.rebootConfirm"))) { await run("quickActions.reboot", () => systemSettingsUseCases.rebootNow()); } }}>{t("systemSettings.actions.reboot")}</Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => { if (confirm(t("systemSettings.actions.shutdownConfirm"))) { await run("quickActions.shutdown", () => systemSettingsUseCases.shutdownNow()); } }}>{t("systemSettings.actions.shutdown")}</Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => run("quickActions.emptyPasteboard", () => systemSettingsUseCases.emptyPasteboard())}>{t("systemSettings.actions.emptyPasteboard")}</Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => run("quickActions.ejectDiscs", () => systemSettingsUseCases.ejectDiscs())}>{t("systemSettings.actions.ejectDiscs")}</Button>
              </div>
            </SettingGroup>
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
    </div>
  );
}
