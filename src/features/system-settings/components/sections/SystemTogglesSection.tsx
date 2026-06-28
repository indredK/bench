import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "../SettingToggle";
import { SettingGroup } from "../SettingGroup";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { canUseTauriWindow } from "@/platform/capabilities";
import type { MenuBarAutoHideMode, LowPowerMode } from "@/lib/tauri/types/system-settings";

export function SystemTogglesSection() {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  const refresh = useCallback(() => {
    Promise.all([
      systemSettingsUseCases.getDarkModeState(),
      systemSettingsUseCases.getAutohideDockState(),
      systemSettingsUseCases.getAutohideMenuBarState(),
      systemSettingsUseCases.getDockShowRecentsState(),
      systemSettingsUseCases.getHideDesktopIconsState(),
      systemSettingsUseCases.getMuteMicState(),
      systemSettingsUseCases.getLowPowerModeState(),
      systemSettingsUseCases.getScreenSaverState(),
      systemSettingsUseCases.getSmallLaunchpadIconState(),
    ]).then(([dark, dock, menu, recents, desktop, mic, power, saver, launchpad]) => {
      store.setDarkMode(dark);
      store.setAutohideDock(dock);
      store.setAutohideMenuBar(menu);
      store.setDockShowRecents(recents);
      store.setHideDesktopIcons(desktop);
      store.setMuteMic(mic);
      store.setLowPowerMode(power);
      store.setScreenSaver(saver);
      store.setSmallLaunchpadIcon(launchpad);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();

    let unlisten: (() => void) | undefined;

    if (canUseTauriWindow()) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        win.onFocusChanged(({ payload: focused }) => {
          if (focused) refresh();
        }).then((un) => { unlisten = un; });
      });
    }

    return () => { unlisten?.(); };
  }, [refresh]);

  return (
    <SettingGroup title={t("systemSettings.toggles.title")}>
      <SettingToggle
        label={t("systemSettings.toggles.darkMode")}
        description={t("systemSettings.toggles.darkModeDesc")}
        checked={store.darkMode}
        loading={store.applyingKeys.has("toggles.darkMode")}
        onCheckedChange={async (v) => {
          await run("toggles.darkMode", async () => {
            await systemSettingsUseCases.setDarkModeState(v);
            store.setDarkMode(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.toggles.autohideDock")}
        description={t("systemSettings.toggles.autohideDockDesc")}
        checked={store.autohideDock}
        loading={store.applyingKeys.has("toggles.autohideDock")}
        onCheckedChange={async (v) => {
          await run("toggles.autohideDock", async () => {
            await systemSettingsUseCases.setAutohideDockState(v);
            store.setAutohideDock(v);
          });
        }}
      />
      {/* 自动隐藏菜单栏:四态选择 (Never / In Full Screen Only / On Desktop Only / Always)
          对应 macOS 系统设置 > Menu Bar (Tahoe) / Control Center (旧版) > Automatically hide and show the menu bar */}
      <div className="space-y-2 py-2">
        <Label className="text-sm font-medium">{t("systemSettings.toggles.autohideMenuBar")}</Label>
        <p className="text-xs text-muted-foreground">{t("systemSettings.toggles.autohideMenuBarDesc")}</p>
        <div className="flex gap-2 flex-wrap">
          {([
            { mode: "never", label: t("systemSettings.toggles.menuBarNever") },
            { mode: "in_full_screen_only", label: t("systemSettings.toggles.menuBarFullScreen") },
            { mode: "on_desktop_only", label: t("systemSettings.toggles.menuBarDesktop") },
            { mode: "always", label: t("systemSettings.toggles.menuBarAlways") },
          ] as { mode: MenuBarAutoHideMode; label: string }[]).map(({ mode, label }) => (
            <Button
              key={mode}
              variant={store.autohideMenuBar === mode ? "default" : "outline"}
              size="sm"
              disabled={store.applyingKeys.has("toggles.autohideMenuBar")}
              onClick={async () => {
                if (store.autohideMenuBar === mode) return;
                await run("toggles.autohideMenuBar", async () => {
                  await systemSettingsUseCases.setAutohideMenuBarState(mode);
                  store.setAutohideMenuBar(mode);
                });
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <SettingToggle
        label={t("systemSettings.toggles.dockShowRecents")}
        description={t("systemSettings.toggles.dockShowRecentsDesc")}
        checked={store.dockShowRecents}
        loading={store.applyingKeys.has("toggles.dockShowRecents")}
        onCheckedChange={async (v) => {
          await run("toggles.dockShowRecents", async () => {
            await systemSettingsUseCases.setDockShowRecentsState(v);
            store.setDockShowRecents(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.toggles.hideDesktopIcons")}
        description={t("systemSettings.toggles.hideDesktopIconsDesc")}
        checked={store.hideDesktopIcons}
        loading={store.applyingKeys.has("toggles.hideDesktopIcons")}
        onCheckedChange={async (v) => {
          await run("toggles.hideDesktopIcons", async () => {
            await systemSettingsUseCases.setHideDesktopIconsState(v);
            store.setHideDesktopIcons(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.toggles.muteMic")}
        description={t("systemSettings.toggles.muteMicDesc")}
        checked={store.muteMic}
        loading={store.applyingKeys.has("toggles.muteMic")}
        onCheckedChange={async (v) => {
          await run("toggles.muteMic", async () => {
            await systemSettingsUseCases.setMuteMicState(v);
            store.setMuteMic(v);
          });
        }}
      />
      {/* 低电量模式：四态选择 (Never / Always / On Battery Only / On AC Power Only)
          对应 macOS 系统设置 > Battery > Low Power Mode */}
      <div className="space-y-2 py-2">
        <Label className="text-sm font-medium">{t("systemSettings.toggles.lowPowerMode")}</Label>
        <p className="text-xs text-muted-foreground">{t("systemSettings.toggles.lowPowerModeDesc")}</p>
        <div className="flex gap-2 flex-wrap">
          {([
            { mode: "never", label: t("systemSettings.toggles.lowPowerNever") },
            { mode: "always", label: t("systemSettings.toggles.lowPowerAlways") },
            { mode: "on_battery_only", label: t("systemSettings.toggles.lowPowerOnBattery") },
            { mode: "on_ac_only", label: t("systemSettings.toggles.lowPowerOnAC") },
          ] as { mode: LowPowerMode; label: string }[]).map(({ mode, label }) => (
            <Button
              key={mode}
              variant={store.lowPowerMode === mode ? "default" : "outline"}
              size="sm"
              disabled={store.applyingKeys.has("toggles.lowPowerMode")}
              onClick={async () => {
                if (store.lowPowerMode === mode) return;
                await run("toggles.lowPowerMode", async () => {
                  await systemSettingsUseCases.setLowPowerModeState(mode);
                  store.setLowPowerMode(mode);
                });
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <SettingToggle
        label={t("systemSettings.toggles.screenSaver")}
        description={t("systemSettings.toggles.screenSaverDesc")}
        checked={store.screenSaver}
        loading={store.applyingKeys.has("toggles.screenSaver")}
        onCheckedChange={async (v) => {
          await run("toggles.screenSaver", async () => {
            await systemSettingsUseCases.setScreenSaverState(v);
            store.setScreenSaver(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.toggles.smallLaunchpadIcon")}
        description={t("systemSettings.toggles.smallLaunchpadIconDesc")}
        checked={store.smallLaunchpadIcon}
        loading={store.applyingKeys.has("toggles.smallLaunchpadIcon")}
        onCheckedChange={async (v) => {
          await run("toggles.smallLaunchpadIcon", async () => {
            await systemSettingsUseCases.setSmallLaunchpadIconState(v);
            store.setSmallLaunchpadIcon(v);
          });
        }}
      />
    </SettingGroup>
  );
}
