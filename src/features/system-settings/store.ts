/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand";
import type { SleepState, LoginItem, MenuBarAutoHideMode, LowPowerMode, GatekeeperMode } from "@/lib/tauri/types/system-settings";

export type SettingsTab = "general" | "finder" | "network" | "screenshot" | "privacy" | "login" | "devtools" | "diagnostics" | "info";

interface SystemSettingsState {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;

  loadedTabs: Set<string>;
  markTabLoaded: (tab: string) => void;

  sleepState: SleepState | null;
  setSleepState: (state: SleepState | null) => void;

  finderShowHiddenFiles: boolean;
  setFinderShowHiddenFiles: (v: boolean) => void;
  finderShowPathbar: boolean;
  setFinderShowPathbar: (v: boolean) => void;
  finderShowStatusbar: boolean;
  setFinderShowStatusbar: (v: boolean) => void;
  finderShowLibraryDir: boolean;
  setFinderShowLibraryDir: (v: boolean) => void;
  finderShowFileExtensions: boolean;
  setFinderShowFileExtensions: (v: boolean) => void;
  finderSpotlightExternalDisk: boolean;
  setFinderSpotlightExternalDisk: (v: boolean) => void;
  finderNoDsStore: boolean;
  setFinderNoDsStore: (v: boolean) => void;

  dockOrientation: string;
  setDockOrientation: (v: string) => void;

  keyboardFnKey: boolean;
  setKeyboardFnKey: (v: boolean) => void;

  displayBatteryPercent: boolean;
  setDisplayBatteryPercent: (v: boolean) => void;

  networkFirewall: boolean;
  setNetworkFirewall: (v: boolean) => void;
  networkSsh: boolean;
  setNetworkSsh: (v: boolean) => void;
  networkScreenSharing: boolean;
  setNetworkScreenSharing: (v: boolean) => void;
  networkAirdropDisabled: boolean;
  setNetworkAirdropDisabled: (v: boolean) => void;

  screenshotFormat: string;
  setScreenshotFormat: (v: string) => void;
  screenshotDisableShadow: boolean;
  setScreenshotDisableShadow: (v: boolean) => void;
  screenshotShowThumbnail: boolean;
  setScreenshotShowThumbnail: (v: boolean) => void;
  screenshotSaveLocation: string;
  setScreenshotSaveLocation: (v: string) => void;

  loginItems: LoginItem[];
  setLoginItems: (items: LoginItem[]) => void;

  defaultBrowser: string;
  setDefaultBrowser: (v: string) => void;

  lockScreenPassword: boolean;
  setLockScreenPassword: (v: boolean) => void;
  lockScreenPasswordDelay: number;
  setLockScreenPasswordDelay: (v: number) => void;

  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  autohideDock: boolean;
  setAutohideDock: (v: boolean) => void;
  autohideMenuBar: MenuBarAutoHideMode;
  setAutohideMenuBar: (v: MenuBarAutoHideMode) => void;
  dockShowRecents: boolean;
  setDockShowRecents: (v: boolean) => void;
  hideDesktopIcons: boolean;
  setHideDesktopIcons: (v: boolean) => void;
  muteMic: boolean;
  setMuteMic: (v: boolean) => void;
  lowPowerMode: LowPowerMode;
  setLowPowerMode: (v: LowPowerMode) => void;
  gatekeeper: GatekeeperMode;
  screenSaver: boolean;
  setScreenSaver: (v: boolean) => void;
  smallLaunchpadIcon: boolean;
  setSmallLaunchpadIcon: (v: boolean) => void;

  loading: boolean;
  setLoading: (v: boolean) => void;

  /**
   * 当前正在执行的设置操作 key 集合。
   *
   * 设计原因:用户操作单个开关时,只有该开关应进入 loading 状态,
   * 其他开关不应受影响(否则会出现"切换一个开关,所有开关都转圈"的误导)。
   * 每个 SettingToggle / Button 调用 useSettingAction.run 时传入唯一 key,
   * run 内部把 key 加入/移出此集合;Switch 的 loading 用 applyingKeys.has(key) 判断。
   */
  applyingKeys: Set<string>;
  setApplyingKey: (key: string, on: boolean) => void;
}

export const useSystemSettingsStore = create<SystemSettingsState>((set) => ({
  activeTab: "general",
  setActiveTab: (tab) => set({ activeTab: tab }),

  loadedTabs: new Set<string>(),
  markTabLoaded: (tab) => set((state) => {
    const next = new Set(state.loadedTabs);
    next.add(tab);
    return { loadedTabs: next };
  }),

  sleepState: null,
  setSleepState: (state) => set({ sleepState: state }),

  finderShowHiddenFiles: false,
  setFinderShowHiddenFiles: (v) => set({ finderShowHiddenFiles: v }),
  finderShowPathbar: false,
  setFinderShowPathbar: (v) => set({ finderShowPathbar: v }),
  finderShowStatusbar: false,
  setFinderShowStatusbar: (v) => set({ finderShowStatusbar: v }),
  finderShowLibraryDir: false,
  setFinderShowLibraryDir: (v) => set({ finderShowLibraryDir: v }),
  finderShowFileExtensions: false,
  setFinderShowFileExtensions: (v) => set({ finderShowFileExtensions: v }),
  finderSpotlightExternalDisk: false,
  setFinderSpotlightExternalDisk: (v) => set({ finderSpotlightExternalDisk: v }),
  finderNoDsStore: false,
  setFinderNoDsStore: (v) => set({ finderNoDsStore: v }),

  dockOrientation: "bottom",
  setDockOrientation: (v) => set({ dockOrientation: v }),

  keyboardFnKey: false,
  setKeyboardFnKey: (v) => set({ keyboardFnKey: v }),

  displayBatteryPercent: false,
  setDisplayBatteryPercent: (v) => set({ displayBatteryPercent: v }),

  networkFirewall: false,
  setNetworkFirewall: (v) => set({ networkFirewall: v }),
  networkSsh: false,
  setNetworkSsh: (v) => set({ networkSsh: v }),
  networkScreenSharing: false,
  setNetworkScreenSharing: (v) => set({ networkScreenSharing: v }),
  networkAirdropDisabled: false,
  setNetworkAirdropDisabled: (v) => set({ networkAirdropDisabled: v }),

  screenshotFormat: "png",
  setScreenshotFormat: (v) => set({ screenshotFormat: v }),
  screenshotDisableShadow: false,
  setScreenshotDisableShadow: (v) => set({ screenshotDisableShadow: v }),
  screenshotShowThumbnail: true,
  setScreenshotShowThumbnail: (v) => set({ screenshotShowThumbnail: v }),
  screenshotSaveLocation: "~/Desktop",
  setScreenshotSaveLocation: (v) => set({ screenshotSaveLocation: v }),

  loginItems: [],
  setLoginItems: (items) => set({ loginItems: items }),

  defaultBrowser: "Safari",
  setDefaultBrowser: (v) => set({ defaultBrowser: v }),

  lockScreenPassword: false,
  setLockScreenPassword: (v) => set({ lockScreenPassword: v }),
  lockScreenPasswordDelay: 5,
  setLockScreenPasswordDelay: (v) => set({ lockScreenPasswordDelay: v }),

  darkMode: false,
  setDarkMode: (v) => set({ darkMode: v }),
  autohideDock: false,
  setAutohideDock: (v) => set({ autohideDock: v }),
  autohideMenuBar: "in_full_screen_only",
  setAutohideMenuBar: (v) => set({ autohideMenuBar: v }),
  dockShowRecents: false,
  setDockShowRecents: (v) => set({ dockShowRecents: v }),
  hideDesktopIcons: false,
  setHideDesktopIcons: (v) => set({ hideDesktopIcons: v }),
  muteMic: false,
  setMuteMic: (v) => set({ muteMic: v }),
  lowPowerMode: "never",
  setLowPowerMode: (v) => set({ lowPowerMode: v }),
  gatekeeper: "identified_developers",
  screenSaver: false,
  setScreenSaver: (v) => set({ screenSaver: v }),
  smallLaunchpadIcon: false,
  setSmallLaunchpadIcon: (v) => set({ smallLaunchpadIcon: v }),

  loading: false,
  setLoading: (v) => set({ loading: v }),

  applyingKeys: new Set<string>(),
  setApplyingKey: (key, on) => set((state) => {
    const next = new Set(state.applyingKeys);
    if (on) {
      next.add(key);
    } else {
      next.delete(key);
    }
    return { applyingKeys: next };
  }),
}));
