/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 *
 * v2: 重设计 — 9 个 Tab → 3 个 Tab (appearance/security/system)，
 * SettingsDialog 合并入主设置页。
 */
import { create } from "zustand";
import type { SleepState, LoginItem, MenuBarAutoHideMode, LowPowerMode, GatekeeperMode } from "@/lib/tauri/types/system-settings";

export type SettingsTab = "appearance" | "security" | "system" | "advanced";

interface SystemSettingsState {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;

  loadedTabs: Set<string>;
  markTabLoaded: (tab: string) => void;

  // ── Appearance ──
  // Theme & Language (from old SettingsDialog)
  theme: "system" | "light" | "dark";
  setTheme: (v: "system" | "light" | "dark") => void;
  language: "system" | "en" | "zh";
  setLanguage: (v: "system" | "en" | "zh") => void;
  windowThemeId: string;
  setWindowThemeId: (v: string) => void;

  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  displayBatteryPercent: boolean;
  setDisplayBatteryPercent: (v: boolean) => void;
  autohideDock: boolean;
  setAutohideDock: (v: boolean) => void;
  dockOrientation: string;
  setDockOrientation: (v: string) => void;
  autohideMenuBar: MenuBarAutoHideMode;
  setAutohideMenuBar: (v: MenuBarAutoHideMode) => void;
  dockShowRecents: boolean;
  setDockShowRecents: (v: boolean) => void;
  hideDesktopIcons: boolean;
  setHideDesktopIcons: (v: boolean) => void;
  screenSaver: boolean;
  setScreenSaver: (v: boolean) => void;

  screenshotFormat: string;
  setScreenshotFormat: (v: string) => void;
  screenshotDisableShadow: boolean;
  setScreenshotDisableShadow: (v: boolean) => void;
  screenshotShowThumbnail: boolean;
  setScreenshotShowThumbnail: (v: boolean) => void;
  screenshotSaveLocation: string;
  setScreenshotSaveLocation: (v: string) => void;

  // ── Security ──
  lockScreenPassword: boolean;
  setLockScreenPassword: (v: boolean) => void;
  lockScreenPasswordDelay: number;
  setLockScreenPasswordDelay: (v: number) => void;

  networkFirewall: boolean;
  setNetworkFirewall: (v: boolean) => void;
  networkSsh: boolean;
  setNetworkSsh: (v: boolean) => void;
  networkScreenSharing: boolean;
  setNetworkScreenSharing: (v: boolean) => void;
  networkAirdropDisabled: boolean;
  setNetworkAirdropDisabled: (v: boolean) => void;

  gatekeeper: GatekeeperMode;

  // ── System ──
  sleepState: SleepState | null;
  setSleepState: (state: SleepState | null) => void;

  keyboardFnKey: boolean;
  setKeyboardFnKey: (v: boolean) => void;

  lowPowerMode: LowPowerMode;
  setLowPowerMode: (v: LowPowerMode) => void;

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

  loginItems: LoginItem[];
  setLoginItems: (items: LoginItem[]) => void;

  defaultBrowser: string;
  setDefaultBrowser: (v: string) => void;

  // ── Shared ──
  loading: boolean;
  setLoading: (v: boolean) => void;

  applyingKeys: Set<string>;
  setApplyingKey: (key: string, on: boolean) => void;
}

export const useSystemSettingsStore = create<SystemSettingsState>((set) => ({
  activeTab: "appearance",
  setActiveTab: (tab) => set({ activeTab: tab }),

  loadedTabs: new Set<string>(),
  markTabLoaded: (tab) => set((state) => {
    const next = new Set(state.loadedTabs);
    next.add(tab);
    return { loadedTabs: next };
  }),

  // ── Appearance defaults ──
  theme: "system",
  setTheme: (v) => set({ theme: v }),
  language: "system",
  setLanguage: (v) => set({ language: v }),
  windowThemeId: "system",
  setWindowThemeId: (v) => set({ windowThemeId: v }),

  darkMode: false,
  setDarkMode: (v) => set({ darkMode: v }),
  displayBatteryPercent: false,
  setDisplayBatteryPercent: (v) => set({ displayBatteryPercent: v }),
  autohideDock: false,
  setAutohideDock: (v) => set({ autohideDock: v }),
  dockOrientation: "bottom",
  setDockOrientation: (v) => set({ dockOrientation: v }),
  autohideMenuBar: "in_full_screen_only",
  setAutohideMenuBar: (v) => set({ autohideMenuBar: v }),
  dockShowRecents: false,
  setDockShowRecents: (v) => set({ dockShowRecents: v }),
  hideDesktopIcons: false,
  setHideDesktopIcons: (v) => set({ hideDesktopIcons: v }),
  screenSaver: false,
  setScreenSaver: (v) => set({ screenSaver: v }),

  screenshotFormat: "png",
  setScreenshotFormat: (v) => set({ screenshotFormat: v }),
  screenshotDisableShadow: false,
  setScreenshotDisableShadow: (v) => set({ screenshotDisableShadow: v }),
  screenshotShowThumbnail: true,
  setScreenshotShowThumbnail: (v) => set({ screenshotShowThumbnail: v }),
  screenshotSaveLocation: "~/Desktop",
  setScreenshotSaveLocation: (v) => set({ screenshotSaveLocation: v }),

  // ── Security defaults ──
  lockScreenPassword: false,
  setLockScreenPassword: (v) => set({ lockScreenPassword: v }),
  lockScreenPasswordDelay: 5,
  setLockScreenPasswordDelay: (v) => set({ lockScreenPasswordDelay: v }),

  networkFirewall: false,
  setNetworkFirewall: (v) => set({ networkFirewall: v }),
  networkSsh: false,
  setNetworkSsh: (v) => set({ networkSsh: v }),
  networkScreenSharing: false,
  setNetworkScreenSharing: (v) => set({ networkScreenSharing: v }),
  networkAirdropDisabled: false,
  setNetworkAirdropDisabled: (v) => set({ networkAirdropDisabled: v }),

  gatekeeper: "identified_developers",

  // ── System defaults ──
  sleepState: null,
  setSleepState: (state) => set({ sleepState: state }),

  keyboardFnKey: false,
  setKeyboardFnKey: (v) => set({ keyboardFnKey: v }),

  lowPowerMode: "never",
  setLowPowerMode: (v) => set({ lowPowerMode: v }),

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

  loginItems: [],
  setLoginItems: (items) => set({ loginItems: items }),

  defaultBrowser: "Safari",
  setDefaultBrowser: (v) => set({ defaultBrowser: v }),

  // ── Shared ──
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
