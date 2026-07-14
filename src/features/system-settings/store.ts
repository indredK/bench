/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 *
 * v2: 重设计 — 9 个 Tab → 3 个 Tab (appearance/security/system)，
 * SettingsDialog 合并入主设置页。
 */
import { create } from "zustand"
import type {
  SleepState,
  LoginItem,
  MenuBarAutoHideMode,
  LowPowerMode,
  GatekeeperMode,
} from "@/lib/tauri/types/system-settings"

export type SettingsTab = "appearance" | "security" | "system" | "advanced"

interface SystemSettingsState {
  activeTab: SettingsTab
  setActiveTab: (tab: SettingsTab) => void

  loadedTabs: Set<string>
  markTabLoaded: (tab: string) => void

  // ── Appearance ──
  // Theme & Language (from old SettingsDialog)
  theme: "system" | "light" | "dark"
  setTheme: (v: "system" | "light" | "dark") => void
  language: "system" | "en" | "zh"
  setLanguage: (v: "system" | "en" | "zh") => void
  windowThemeId: string
  setWindowThemeId: (v: string) => void

  darkMode: boolean
  setDarkMode: (v: boolean) => void
  displayBatteryPercent: boolean
  setDisplayBatteryPercent: (v: boolean) => void
  autohideDock: boolean | null
  setAutohideDock: (v: boolean) => void
  dockOrientation: string
  setDockOrientation: (v: string) => void
  minimizeScaleEnabled: boolean
  setMinimizeScaleEnabled: (v: boolean) => void
  autohideMenuBar: MenuBarAutoHideMode | null
  setAutohideMenuBar: (v: MenuBarAutoHideMode) => void
  dockShowRecents: boolean | null
  setDockShowRecents: (v: boolean) => void
  hideDesktopIcons: boolean | null
  setHideDesktopIcons: (v: boolean) => void
  screenSaver: boolean | null
  setScreenSaver: (v: boolean) => void

  screenshotFormat: string | null
  setScreenshotFormat: (v: string) => void
  screenshotDisableShadow: boolean | null
  setScreenshotDisableShadow: (v: boolean) => void
  screenshotShowThumbnail: boolean | null
  setScreenshotShowThumbnail: (v: boolean) => void
  screenshotSaveLocation: string | null
  setScreenshotSaveLocation: (v: string) => void

  // ── Security ──
  lockScreenPassword: boolean
  setLockScreenPassword: (v: boolean) => void
  lockScreenPasswordDelay: number
  setLockScreenPasswordDelay: (v: number) => void

  networkFirewall: boolean | null
  setNetworkFirewall: (v: boolean) => void
  networkSsh: boolean | null
  setNetworkSsh: (v: boolean) => void
  networkScreenSharing: boolean | null
  setNetworkScreenSharing: (v: boolean) => void
  networkAirdropDisabled: boolean | null
  setNetworkAirdropDisabled: (v: boolean) => void

  gatekeeper: GatekeeperMode | null

  // ── System ──
  sleepState: SleepState | null
  setSleepState: (state: SleepState | null) => void

  keyboardFnKey: boolean
  setKeyboardFnKey: (v: boolean) => void
  autoCorrect: boolean
  setAutoCorrect: (v: boolean) => void
  smartQuotes: boolean
  setSmartQuotes: (v: boolean) => void
  smartDashes: boolean
  setSmartDashes: (v: boolean) => void
  autoCapitalize: boolean
  setAutoCapitalize: (v: boolean) => void

  lowPowerMode: LowPowerMode | null
  setLowPowerMode: (v: LowPowerMode) => void

  finderShowHiddenFiles: boolean | null
  setFinderShowHiddenFiles: (v: boolean) => void
  finderShowPathbar: boolean | null
  setFinderShowPathbar: (v: boolean) => void
  finderShowStatusbar: boolean | null
  setFinderShowStatusbar: (v: boolean) => void
  finderShowLibraryDir: boolean | null
  setFinderShowLibraryDir: (v: boolean) => void
  finderShowFileExtensions: boolean | null
  setFinderShowFileExtensions: (v: boolean) => void
  finderSpotlightExternalDisk: boolean | null
  setFinderSpotlightExternalDisk: (v: boolean) => void
  finderNoDsStore: boolean | null
  setFinderNoDsStore: (v: boolean) => void

  loginItems: LoginItem[]
  setLoginItems: (items: LoginItem[]) => void

  defaultBrowser: string
  setDefaultBrowser: (v: string) => void

  // ── Shared ──
  loading: boolean
  setLoading: (v: boolean) => void

  applyingKeys: Set<string>
  setApplyingKey: (key: string, on: boolean) => void
}

export const useSystemSettingsStore = create<SystemSettingsState>((set) => ({
  activeTab: "appearance",
  setActiveTab: (tab) => set({ activeTab: tab }),

  loadedTabs: new Set<string>(),
  markTabLoaded: (tab) =>
    set((state) => {
      const next = new Set(state.loadedTabs)
      next.add(tab)
      return { loadedTabs: next }
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
  autohideDock: null,
  setAutohideDock: (v) => set({ autohideDock: v }),
  dockOrientation: "bottom",
  setDockOrientation: (v) => set({ dockOrientation: v }),
  minimizeScaleEnabled: false,
  setMinimizeScaleEnabled: (v) => set({ minimizeScaleEnabled: v }),
  autohideMenuBar: null,
  setAutohideMenuBar: (v) => set({ autohideMenuBar: v }),
  dockShowRecents: null,
  setDockShowRecents: (v) => set({ dockShowRecents: v }),
  hideDesktopIcons: null,
  setHideDesktopIcons: (v) => set({ hideDesktopIcons: v }),
  screenSaver: null,
  setScreenSaver: (v) => set({ screenSaver: v }),

  screenshotFormat: null,
  setScreenshotFormat: (v) => set({ screenshotFormat: v }),
  screenshotDisableShadow: null,
  setScreenshotDisableShadow: (v) => set({ screenshotDisableShadow: v }),
  screenshotShowThumbnail: null,
  setScreenshotShowThumbnail: (v) => set({ screenshotShowThumbnail: v }),
  screenshotSaveLocation: null,
  setScreenshotSaveLocation: (v) => set({ screenshotSaveLocation: v }),

  // ── Security defaults ──
  lockScreenPassword: false,
  setLockScreenPassword: (v) => set({ lockScreenPassword: v }),
  lockScreenPasswordDelay: 5,
  setLockScreenPasswordDelay: (v) => set({ lockScreenPasswordDelay: v }),

  networkFirewall: null,
  setNetworkFirewall: (v) => set({ networkFirewall: v }),
  networkSsh: null,
  setNetworkSsh: (v) => set({ networkSsh: v }),
  networkScreenSharing: null,
  setNetworkScreenSharing: (v) => set({ networkScreenSharing: v }),
  networkAirdropDisabled: null,
  setNetworkAirdropDisabled: (v) => set({ networkAirdropDisabled: v }),

  gatekeeper: null,

  // ── System defaults ──
  sleepState: null,
  setSleepState: (state) => set({ sleepState: state }),

  keyboardFnKey: false,
  setKeyboardFnKey: (v) => set({ keyboardFnKey: v }),
  autoCorrect: false,
  setAutoCorrect: (v) => set({ autoCorrect: v }),
  smartQuotes: false,
  setSmartQuotes: (v) => set({ smartQuotes: v }),
  smartDashes: false,
  setSmartDashes: (v) => set({ smartDashes: v }),
  autoCapitalize: false,
  setAutoCapitalize: (v) => set({ autoCapitalize: v }),

  lowPowerMode: null,
  setLowPowerMode: (v) => set({ lowPowerMode: v }),

  finderShowHiddenFiles: null,
  setFinderShowHiddenFiles: (v) => set({ finderShowHiddenFiles: v }),
  finderShowPathbar: null,
  setFinderShowPathbar: (v) => set({ finderShowPathbar: v }),
  finderShowStatusbar: null,
  setFinderShowStatusbar: (v) => set({ finderShowStatusbar: v }),
  finderShowLibraryDir: null,
  setFinderShowLibraryDir: (v) => set({ finderShowLibraryDir: v }),
  finderShowFileExtensions: null,
  setFinderShowFileExtensions: (v) => set({ finderShowFileExtensions: v }),
  finderSpotlightExternalDisk: null,
  setFinderSpotlightExternalDisk: (v) => set({ finderSpotlightExternalDisk: v }),
  finderNoDsStore: null,
  setFinderNoDsStore: (v) => set({ finderNoDsStore: v }),

  loginItems: [],
  setLoginItems: (items) => set({ loginItems: items }),

  defaultBrowser: "Safari",
  setDefaultBrowser: (v) => set({ defaultBrowser: v }),

  // ── Shared ──
  loading: false,
  setLoading: (v) => set({ loading: v }),

  applyingKeys: new Set<string>(),
  setApplyingKey: (key, on) =>
    set((state) => {
      const next = new Set(state.applyingKeys)
      if (on) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return { applyingKeys: next }
    }),
}))
