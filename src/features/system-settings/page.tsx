/**
 * System Settings Page / 系统设置页面: main page view; 主页面视图.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "./components/SettingToggle";
import { SettingGroup } from "./components/SettingGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AppFeature } from "@/features/types";
import {
  FolderOpen,
  Wifi, Camera, User, Zap, Network, Shield, Code, Settings
} from "lucide-react";
import type { SettingsTab } from "./store";
import {
  SleepSection,
  LockScreenSection,
  KeyboardSection,
  DisplaySection,
  DockSection,
  QuickActionsSection,
  SystemTogglesSection,
} from "./components/sections";
import { systemInfoUseCases } from "./services/system-info.use-cases";
import type { SystemInfoData } from "@/lib/tauri/types/system-info";
import type { GatekeeperMode } from "@/lib/tauri/types/system-settings";
import { formatMemory, formatUptime } from "@/lib/utils";
import { Monitor } from "lucide-react";

const TAB_IDS = [
  "general", "finder", "network",
  "screenshot", "privacy", "login", "devtools", "diagnostics", "info",
] as const;

const TAB_ICONS: Record<SettingsTab, typeof Zap> = {
  general: Settings, finder: FolderOpen,
  network: Wifi, screenshot: Camera, privacy: Shield,
  login: User, devtools: Code, diagnostics: Network, info: Monitor,
};

interface SystemSettingsProps {
  feature: AppFeature;
}

export default function SystemSettings(_props: SystemSettingsProps) {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();
  const [diagnosticTarget, setDiagnosticTarget] = useState("");
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  const [jsonInput, setJsonInput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  const [b64Input, setB64Input] = useState("");
  const [b64Output, setB64Output] = useState("");
  const [hashInput, setHashInput] = useState("");
  const [hashAlgo, setHashAlgo] = useState("sha256");
  const [hashOutput, setHashOutput] = useState("");
  const [tsInput, setTsInput] = useState("");
  const [tsFormat, setTsFormat] = useState("datetime");
  const [tsOutput, setTsOutput] = useState("");
  const [uuidOutput, setUuidOutput] = useState("");

  const [launchAgents, setLaunchAgents] = useState<{ name: string; path: string; enabled: boolean }[]>([]);
  const [launchDaemons, setLaunchDaemons] = useState<{ name: string; path: string; enabled: boolean }[]>([]);
  const [newLoginItemPath, setNewLoginItemPath] = useState("");
  const [tabLoading, setTabLoading] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [systemInfoLoading, setSystemInfoLoading] = useState(false);
  const [systemInfoError, setSystemInfoError] = useState("");

  const loadTabSettings = async (tab: SettingsTab) => {
    const s = useSystemSettingsStore.getState();
    const alwaysReload = tab === "login";
    if (!alwaysReload && s.loadedTabs.has(tab)) return;
    const isSilent = tab === "general";
    if (!isSilent) setTabLoading(true);
    try {
      switch (tab) {
        case "general": {
          // General tab sections load themselves independently
          break;
        }
        case "finder": {
          const [hidden, pathbar, statusbar, lib, ext, spotlight, dsstore] = await Promise.all([
            systemSettingsUseCases.getFinderShowHiddenFiles(),
            systemSettingsUseCases.getFinderShowPathbar(),
            systemSettingsUseCases.getFinderShowStatusbar(),
            systemSettingsUseCases.getFinderShowLibraryDir(),
            systemSettingsUseCases.getFinderShowFileExtensions(),
            systemSettingsUseCases.getFinderSpotlightExternalDisk(),
            systemSettingsUseCases.getFinderNoDsStore(),
          ]);
          s.setFinderShowHiddenFiles(hidden);
          s.setFinderShowPathbar(pathbar);
          s.setFinderShowStatusbar(statusbar);
          s.setFinderShowLibraryDir(lib);
          s.setFinderShowFileExtensions(ext);
          s.setFinderSpotlightExternalDisk(spotlight);
          s.setFinderNoDsStore(dsstore);
          break;
        }
        case "network": {
          const [firewall, ssh, screenShare, airdrop] = await Promise.all([
            systemSettingsUseCases.getNetworkFirewallState(),
            systemSettingsUseCases.getNetworkSshState(),
            systemSettingsUseCases.getNetworkScreenSharingState(),
            systemSettingsUseCases.getNetworkAirdropDisabled(),
          ]);
          s.setNetworkFirewall(firewall);
          s.setNetworkSsh(ssh);
          s.setNetworkScreenSharing(screenShare);
          s.setNetworkAirdropDisabled(airdrop);
          break;
        }
        case "screenshot": {
          const [format, shadow, thumb, location] = await Promise.all([
            systemSettingsUseCases.getScreenshotFormat(),
            systemSettingsUseCases.getScreenshotDisableShadow(),
            systemSettingsUseCases.getScreenshotShowThumbnail(),
            systemSettingsUseCases.getScreenshotSaveLocation(),
          ]);
          s.setScreenshotFormat(format);
          s.setScreenshotDisableShadow(shadow);
          s.setScreenshotShowThumbnail(thumb);
          s.setScreenshotSaveLocation(location);
          break;
        }
        case "privacy": {
          const gatekeeper = await systemSettingsUseCases.getGatekeeperState();
          useSystemSettingsStore.setState({ gatekeeper });
          break;
        }
        case "login": {
          const [loginItems, agents, daemons] = await Promise.all([
            systemSettingsUseCases.getLoginItems(),
            systemSettingsUseCases.getLaunchAgents(),
            systemSettingsUseCases.getLaunchDaemons(),
          ]);
          s.setLoginItems(loginItems);
          setLaunchAgents(agents);
          setLaunchDaemons(daemons);
          break;
        }
        case "info": {
          setSystemInfoLoading(true);
          setSystemInfoError("");
          try {
            const info = await systemInfoUseCases.loadSystemInfo();
            setSystemInfo(info);
          } catch (err) {
            setSystemInfoError(typeof err === "string" ? err : "Failed to load system info");
          } finally {
            setSystemInfoLoading(false);
          }
          break;
        }
      }
      if (tab !== "general") {
        s.markTabLoaded(tab);
      }
    } catch (err) {
      console.error(`Failed to load ${tab} settings:`, err);
    } finally {
      setTabLoading(false);
    }
  };

  useEffect(() => {
    if (systemSettingsUseCases.isAvailable()) {
      void loadTabSettings(useSystemSettingsStore.getState().activeTab);
    }
  }, [store.activeTab]);

  const handleTabChange = (tab: SettingsTab) => {
    store.setActiveTab(tab);
  };

  // 注:页面内统一的 applying 管理 + toast 通知已抽到共享 hook `useSettingAction`,
  // 与各 Section 组件 (SleepSection / DisplaySection / SystemTogglesSection 等) 共用同一套逻辑。
  // loading 状态按 key 精细化:操作单个开关时,只有该开关进入 loading,其他开关不受影响。

  const runDiagnostic = async (action: () => Promise<unknown>) => {
    // 诊断按钮共用一个 key,因为它们共用一个结果区域,并发会造成结果混乱
    const result = await run("diagnostic.run", action);
    if (result !== undefined) setDiagnosticResult(JSON.stringify(result, null, 2));
  };

  const renderTabContent = () => {
    if (tabLoading) {
      // 视觉加载态:仅显示旋转图标,无文字提示,避免文字出现/消失导致的闪烁
      return (
        <div className="flex items-center justify-center h-32">
          <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    switch (store.activeTab) {
      case "general":
        return (
          <div className="space-y-6">
            <SleepSection />
            <LockScreenSection />
            <KeyboardSection />
            <DisplaySection />
            <DockSection />
            <QuickActionsSection />
            <SystemTogglesSection />
          </div>
        );

      case "finder":
        return (
          <SettingGroup title={t("systemSettings.finder.title")}>
            <SettingToggle
              label={t("systemSettings.finder.hiddenFiles")}
              checked={store.finderShowHiddenFiles}
              loading={store.applyingKeys.has("finder.hiddenFiles")}
              onCheckedChange={async (v) => {
                await run("finder.hiddenFiles", async () => {
                  await systemSettingsUseCases.setFinderShowHiddenFiles(v);
                  store.setFinderShowHiddenFiles(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.finder.pathBar")}
              description={t("systemSettings.finder.pathBarDesc")}
              checked={store.finderShowPathbar}
              loading={store.applyingKeys.has("finder.pathBar")}
              onCheckedChange={async (v) => {
                await run("finder.pathBar", async () => {
                  await systemSettingsUseCases.setFinderShowPathbar(v);
                  store.setFinderShowPathbar(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.finder.statusBar")}
              description={t("systemSettings.finder.statusBarDesc")}
              checked={store.finderShowStatusbar}
              loading={store.applyingKeys.has("finder.statusBar")}
              onCheckedChange={async (v) => {
                await run("finder.statusBar", async () => {
                  await systemSettingsUseCases.setFinderShowStatusbar(v);
                  store.setFinderShowStatusbar(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.finder.libraryDir")}
              description={t("systemSettings.finder.libraryDirDesc")}
              checked={store.finderShowLibraryDir}
              loading={store.applyingKeys.has("finder.libraryDir")}
              onCheckedChange={async (v) => {
                await run("finder.libraryDir", async () => {
                  await systemSettingsUseCases.setFinderShowLibraryDir(v);
                  store.setFinderShowLibraryDir(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.finder.fileExtensions")}
              checked={store.finderShowFileExtensions}
              loading={store.applyingKeys.has("finder.fileExtensions")}
              onCheckedChange={async (v) => {
                await run("finder.fileExtensions", async () => {
                  await systemSettingsUseCases.setFinderShowFileExtensions(v);
                  store.setFinderShowFileExtensions(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.finder.noDsStore")}
              checked={store.finderNoDsStore}
              loading={store.applyingKeys.has("finder.noDsStore")}
              onCheckedChange={async (v) => {
                await run("finder.noDsStore", async () => {
                  await systemSettingsUseCases.setFinderNoDsStore(v);
                  store.setFinderNoDsStore(v);
                });
              }}
            />
          </SettingGroup>
        );

      case "network":
        return (
          <SettingGroup title={t("systemSettings.network.title")}>
            <SettingToggle
              label={t("systemSettings.network.firewall")}
              description={t("systemSettings.network.firewallDesc")}
              checked={store.networkFirewall}
              loading={store.applyingKeys.has("network.firewall")}
              onCheckedChange={async (v) => {
                await run("network.firewall", async () => {
                  await systemSettingsUseCases.setNetworkFirewallState(v);
                  store.setNetworkFirewall(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.network.ssh")}
              description={t("systemSettings.network.sshDesc")}
              checked={store.networkSsh}
              loading={store.applyingKeys.has("network.ssh")}
              onCheckedChange={async (v) => {
                await run("network.ssh", async () => {
                  await systemSettingsUseCases.setNetworkSshState(v);
                  store.setNetworkSsh(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.network.screenSharing")}
              checked={store.networkScreenSharing}
              loading={store.applyingKeys.has("network.screenSharing")}
              onCheckedChange={async (v) => {
                await run("network.screenSharing", async () => {
                  await systemSettingsUseCases.setNetworkScreenSharingState(v);
                  store.setNetworkScreenSharing(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.network.airdrop")}
              description={t("systemSettings.network.airdropDesc")}
              checked={store.networkAirdropDisabled}
              loading={store.applyingKeys.has("network.airdrop")}
              onCheckedChange={async (v) => {
                await run("network.airdrop", async () => {
                  await systemSettingsUseCases.setNetworkAirdropDisabled(v);
                  store.setNetworkAirdropDisabled(v);
                });
              }}
            />
          </SettingGroup>
        );

      case "screenshot":
        return (
          <SettingGroup title={t("systemSettings.screenshot.title")}>
            <SettingToggle
              label={t("systemSettings.screenshot.disableShadow")}
              checked={store.screenshotDisableShadow}
              loading={store.applyingKeys.has("screenshot.disableShadow")}
              onCheckedChange={async (v) => {
                await run("screenshot.disableShadow", async () => {
                  await systemSettingsUseCases.setScreenshotDisableShadow(v);
                  store.setScreenshotDisableShadow(v);
                });
              }}
            />
            <SettingToggle
              label={t("systemSettings.screenshot.showThumbnail")}
              checked={store.screenshotShowThumbnail}
              loading={store.applyingKeys.has("screenshot.showThumbnail")}
              onCheckedChange={async (v) => {
                await run("screenshot.showThumbnail", async () => {
                  await systemSettingsUseCases.setScreenshotShowThumbnail(v);
                  store.setScreenshotShowThumbnail(v);
                });
              }}
            />
            <div className="space-y-2 py-2">
              <Label className="text-sm font-medium">{t("systemSettings.screenshot.format")}</Label>
              <div className="flex gap-2">
                {["png", "jpg", "bmp", "pdf", "tiff"].map((fmt) => (
                  <Button
                    key={fmt}
                    variant={store.screenshotFormat === fmt ? "default" : "outline"}
                    size="sm"
                    disabled={store.applyingKeys.size > 0}
                    onClick={async () => {
                      await run("screenshot.format", async () => {
                        await systemSettingsUseCases.setScreenshotFormat(fmt);
                        store.setScreenshotFormat(fmt);
                      });
                    }}
                  >
                    {fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2 py-2">
              <Label className="text-sm font-medium">{t("systemSettings.screenshot.saveLocation")}</Label>
              <Input
                value={store.screenshotSaveLocation}
                onChange={(e) => store.setScreenshotSaveLocation(e.target.value)}
                disabled={store.applyingKeys.size > 0}
                onBlur={async () => {
                  await run("screenshot.saveLocation", async () => {
                    await systemSettingsUseCases.setScreenshotSaveLocation(store.screenshotSaveLocation);
                  });
                }}
                placeholder={t("systemSettings.screenshot.saveLocationPlaceholder")}
              />
            </div>
          </SettingGroup>
        );

      case "privacy":
        return (
          <div className="space-y-4">
          <SettingGroup title={t("systemSettings.privacy.gatekeeper")}>
            <p className="text-xs text-muted-foreground py-2">
              {t("systemSettings.privacy.gatekeeperDesc")}
            </p>
            <div className="flex gap-2">
              {([
                { mode: "app_store" as GatekeeperMode, label: t("systemSettings.privacy.gatekeeperAppStore") },
                { mode: "identified_developers" as GatekeeperMode, label: t("systemSettings.privacy.gatekeeperIdentifiedDevs") },
              ]).map(({ mode, label }) => (
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
            <p className="text-xs text-muted-foreground py-1">
              {t("systemSettings.privacy.gatekeeperReadonly")}
            </p>
          </SettingGroup>
          <SettingGroup title={t("systemSettings.privacy.title")}>
            <p className="text-xs text-muted-foreground py-2">
              {t("systemSettings.privacy.description")}
            </p>
            {([
              { service: "kTCCServiceCamera", key: "camera" },
              { service: "kTCCServiceMicrophone", key: "microphone" },
              { service: "kTCCServiceScreenCapture", key: "screenRecording" },
              { service: "kTCCServiceSystemPolicyAllFiles", key: "fullDiskAccess" },
              { service: "kTCCServiceLocation", key: "location" },
              { service: "kTCCServiceAccessibility", key: "accessibility" },
            ] as const).map(({ service, key }) => {
              const label = t(`systemSettings.privacy.${key}`);
              return (
                <div key={service} className="flex items-center justify-between py-1">
                  <span className="text-sm">{label}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={store.applyingKeys.size > 0}
                      onClick={async () => {
                        const perms = await run(`privacy.view.${service}`, () => systemSettingsUseCases.getTccPermissions(service));
                        if (!perms) return;
                        const msg = `${label}:\nAllowed: ${perms.allowed.join(", ") || "none"}\nDenied: ${perms.denied.join(", ") || "none"}`;
                        toast.info(msg, { duration: 8000 });
                      }}
                    >
                      {t("systemSettings.privacy.view")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={store.applyingKeys.size > 0}
                      onClick={async () => {
                        const bundleId = prompt(t("systemSettings.privacy.resetPrompt", { label }));
                        if (bundleId) {
                          await run(
                            `privacy.reset.${service}`,
                            () => systemSettingsUseCases.resetTccPermission(service, bundleId),
                            { success: t("systemSettings.privacy.resetSuccess", { label, bundleId }) }
                          );
                        }
                      }}
                    >
                      {t("systemSettings.privacy.reset")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </SettingGroup>
          </div>
        );

      case "login":
        return (
          <div className="space-y-4">
            <SettingGroup title={t("systemSettings.login.title")}>
              <div className="flex gap-2 py-2">
                <Input
                  value={newLoginItemPath}
                  onChange={(e) => setNewLoginItemPath(e.target.value)}
                  placeholder={t("systemSettings.login.placeholder")}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={store.applyingKeys.size > 0}
                  onClick={async () => {
                    if (newLoginItemPath) {
                      await run("login.add", async () => {
                        await systemSettingsUseCases.addLoginItem(newLoginItemPath);
                        setNewLoginItemPath("");
                        const items = await systemSettingsUseCases.getLoginItems();
                        store.setLoginItems(items);
                      });
                    }
                  }}
                >
                  {t("systemSettings.login.add")}
                </Button>
              </div>
              {store.loginItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t("systemSettings.login.noItems")}</p>
              ) : (
                <div className="space-y-1">
                  {store.loginItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between py-1">
                      <span className="text-sm">{item.name}</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={store.applyingKeys.size > 0}
                        onClick={async () => {
                          await run(`login.remove.${item.name}`, async () => {
                            await systemSettingsUseCases.removeLoginItem(item.name);
                            const items = await systemSettingsUseCases.getLoginItems();
                            store.setLoginItems(items);
                          });
                        }}
                      >
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
                    <div key={agent.name} className="flex items-center justify-between py-1">
                      <span className="text-sm truncate">{agent.name}</span>
                      <Badge variant="secondary" className="text-xs">{agent.path.split("/").pop()}</Badge>
                    </div>
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
                    <div key={daemon.name} className="flex items-center justify-between py-1">
                      <span className="text-sm truncate">{daemon.name}</span>
                      <Badge variant="secondary" className="text-xs">{daemon.path.split("/").pop()}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </SettingGroup>
          </div>
        );

      case "devtools":
        return (
          <div className="space-y-4">
            <SettingGroup title={t("systemSettings.devtools.jsonTitle")}>
              <div className="space-y-2 py-2">
                <textarea
                  className="w-full h-24 text-xs font-mono bg-muted rounded p-2"
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder={t("systemSettings.devtools.jsonPlaceholder")}
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                    const result = await run("devtools.jsonPretty", () => systemSettingsUseCases.jsonFormat(jsonInput, true));
                    if (result !== undefined) setJsonOutput(result);
                  }}>{t("systemSettings.devtools.prettyPrint")}</Button>
                  <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                    const result = await run("devtools.jsonMinify", () => systemSettingsUseCases.jsonFormat(jsonInput, false));
                    if (result !== undefined) setJsonOutput(result);
                  }}>{t("systemSettings.devtools.minify")}</Button>
                </div>
                {jsonOutput && <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">{jsonOutput}</pre>}
              </div>
            </SettingGroup>

            <SettingGroup title={t("systemSettings.devtools.base64Title")}>
              <div className="space-y-2 py-2">
                <Input value={b64Input} onChange={(e) => setB64Input(e.target.value)} placeholder={t("systemSettings.devtools.base64Placeholder")} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                    const result = await run("devtools.base64Encode", () => systemSettingsUseCases.base64Encode(b64Input));
                    if (result !== undefined) setB64Output(result);
                  }}>{t("systemSettings.devtools.encode")}</Button>
                  <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                    const result = await run("devtools.base64Decode", () => systemSettingsUseCases.base64Decode(b64Input));
                    if (result !== undefined) setB64Output(result);
                  }}>{t("systemSettings.devtools.decode")}</Button>
                </div>
                {b64Output && <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-24">{b64Output}</pre>}
              </div>
            </SettingGroup>

            <SettingGroup title={t("systemSettings.devtools.hashTitle")}>
              <div className="space-y-2 py-2">
                <Input value={hashInput} onChange={(e) => setHashInput(e.target.value)} placeholder={t("systemSettings.devtools.hashPlaceholder")} />
                <div className="flex gap-2 items-center">
                  <select value={hashAlgo} onChange={(e) => setHashAlgo(e.target.value)} className="text-xs border rounded px-2 py-1">
                    <option value="md5">MD5</option>
                    <option value="sha1">SHA1</option>
                    <option value="sha256">SHA256</option>
                    <option value="sha384">SHA384</option>
                    <option value="sha512">SHA512</option>
                  </select>
                  <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                    const result = await run("devtools.hash", () => systemSettingsUseCases.calculateHash(hashInput, hashAlgo));
                    if (result !== undefined) setHashOutput(result);
                  }}>{t("systemSettings.devtools.calculate")}</Button>
                </div>
                {hashOutput && <pre className="text-xs bg-muted p-2 rounded overflow-auto">{hashOutput}</pre>}
              </div>
            </SettingGroup>

            <SettingGroup title={t("systemSettings.devtools.uuidTitle")}>
              <div className="flex gap-2 py-2">
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                  const result = await run("devtools.uuid", () => systemSettingsUseCases.generateUuid());
                  if (result !== undefined) setUuidOutput(result);
                }}>{t("systemSettings.devtools.generateUuid")}</Button>
                {uuidOutput && <code className="text-xs bg-muted px-2 py-1 rounded">{uuidOutput}</code>}
              </div>
            </SettingGroup>

            <SettingGroup title={t("systemSettings.devtools.timestampTitle")}>
              <div className="space-y-2 py-2">
                <Input value={tsInput} onChange={(e) => setTsInput(e.target.value)} placeholder={t("systemSettings.devtools.timestampPlaceholder")} />
                <div className="flex gap-2 items-center">
                  <select value={tsFormat} onChange={(e) => setTsFormat(e.target.value)} className="text-xs border rounded px-2 py-1">
                    <option value="datetime">{t("systemSettings.devtools.formatFullDateTime")}</option>
                    <option value="date">{t("systemSettings.devtools.formatDateOnly")}</option>
                    <option value="time">{t("systemSettings.devtools.formatTimeOnly")}</option>
                    <option value="iso">{t("systemSettings.devtools.formatIso")}</option>
                  </select>
                  <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={async () => {
                    const result = await run("devtools.timestamp", () => systemSettingsUseCases.timestampConvert(parseInt(tsInput) || 0, tsFormat));
                    if (result !== undefined) setTsOutput(result);
                  }}>{t("systemSettings.devtools.convert")}</Button>
                </div>
                {tsOutput && <code className="text-xs bg-muted px-2 py-1 rounded">{tsOutput}</code>}
              </div>
            </SettingGroup>
          </div>
        );

      case "diagnostics":
        return (
          <SettingGroup title={t("systemSettings.diagnostics.title")}>
            <div className="space-y-2 py-2">
              <Label className="text-sm font-medium">{t("systemSettings.diagnostics.targetHost")}</Label>
              <div className="flex gap-2">
                <Input
                  value={diagnosticTarget}
                  onChange={(e) => setDiagnosticTarget(e.target.value)}
                  placeholder={t("systemSettings.diagnostics.targetPlaceholder")}
                />
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => runDiagnostic(() => systemSettingsUseCases.pingHost(diagnosticTarget, 5))}>
                  {t("systemSettings.diagnostics.ping")}
                </Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => runDiagnostic(() => systemSettingsUseCases.getLocalIp())}>
                  {t("systemSettings.diagnostics.localIp")}
                </Button>
                <Button variant="outline" size="sm" disabled={store.applyingKeys.size > 0} onClick={() => runDiagnostic(() => systemSettingsUseCases.getWifiInfo())}>
                  {t("systemSettings.diagnostics.wifi")}
                </Button>
              </div>
            </div>
            {diagnosticResult && (
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                {diagnosticResult}
              </pre>
            )}
          </SettingGroup>
        );

      case "info":
        if (systemInfoLoading) {
          return (
            <div className="flex items-center justify-center h-32">
              <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          );
        }
        if (systemInfoError) {
          return (
            <SettingGroup title={t("systemInfo.title")}>
              <Alert variant="destructive">
                <AlertDescription>{systemInfoError}</AlertDescription>
              </Alert>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                setTabLoading(false);
                loadTabSettings("info");
              }}>{t("systemInfo.retry")}</Button>
            </SettingGroup>
          );
        }
        if (!systemInfo) return null;
        return (
          <SettingGroup title={t("systemInfo.title")}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {[
                { label: t("systemInfo.osName"), value: systemInfo.os_name },
                systemInfo.os_version !== "Unknown" && { label: t("systemInfo.osVersion"), value: systemInfo.os_version },
                systemInfo.kernel_version !== "Unknown" && { label: t("systemInfo.kernelVersion"), value: systemInfo.kernel_version },
                systemInfo.hostname !== "Unknown" && { label: t("systemInfo.hostname"), value: systemInfo.hostname },
                systemInfo.model_name && { label: t("systemInfo.modelName"), value: systemInfo.model_name },
                systemInfo.cpu_brand !== "Unknown" && { label: t("systemInfo.cpuBrand"), value: systemInfo.cpu_brand },
                systemInfo.arch !== "Unknown" && systemInfo.arch && { label: t("systemInfo.arch"), value: systemInfo.arch },
                systemInfo.cpu_cores > 0 && { label: t("systemInfo.cpuCores"), value: String(systemInfo.cpu_cores) },
                systemInfo.total_memory > 0 && { label: t("systemInfo.totalMemory"), value: `${formatMemory(systemInfo.total_memory)} GB` },
                systemInfo.available_memory > 0 && { label: t("systemInfo.availableMemory"), value: `${formatMemory(systemInfo.available_memory)} GB` },
                systemInfo.used_memory > 0 && { label: t("systemInfo.usedMemory"), value: `${formatMemory(systemInfo.used_memory)} GB` },
                systemInfo.memory_usage_percent > 0 && { label: t("systemInfo.memoryUsage"), value: `${systemInfo.memory_usage_percent.toFixed(1)}%` },
                formatUptime(systemInfo.uptime_seconds) && { label: t("systemInfo.uptime"), value: formatUptime(systemInfo.uptime_seconds)! },
                systemInfo.distribution && { label: t("systemInfo.distribution"), value: systemInfo.distribution },
                systemInfo.browser_name && { label: t("systemInfo.browserName"), value: systemInfo.browser_name },
                systemInfo.browser_version && { label: t("systemInfo.browserVersion"), value: systemInfo.browser_version },
                systemInfo.platform && { label: t("systemInfo.platform"), value: systemInfo.platform },
                systemInfo.language && { label: t("systemInfo.language"), value: systemInfo.language },
                systemInfo.screen_resolution && { label: t("systemInfo.screenResolution"), value: systemInfo.screen_resolution },
              ].filter((item): item is { label: string; value: string } => Boolean(item)).map((item) => (
                <div key={item.label} className="rounded-lg border bg-muted/40 px-4 py-4">
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{item.label}</div>
                  <div className="text-sm font-medium break-words">{item.value}</div>
                </div>
              ))}
            </div>
          </SettingGroup>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-48 border-r p-2 space-y-0.5 overflow-y-auto">
        {TAB_IDS.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          return (
            <button
              key={tabId}
              onClick={() => handleTabChange(tabId)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                store.activeTab === tabId
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <Icon size={14} />
              {t(`systemSettings.tabs.${tabId}`)}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {renderTabContent()}
      </div>
    </div>
  );
}
