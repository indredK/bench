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
  SystemSettingsSnapshot,
} from "@/lib/tauri/types/system-settings"

export type SettingsTab = "appearance" | "security" | "system" | "advanced"

interface SystemSettingsState {
  activeTab: SettingsTab
  setActiveTab: (tab: SettingsTab) => void

  loadedTabs: Set<string>
  markTabLoaded: (tab: string) => void

  loadedSections: Set<string>
  markSectionLoaded: (sectionId: string) => void

  // ── Appearance ──
  displayBatteryPercent: boolean
  setDisplayBatteryPercent: (v: boolean) => void
  autohideDock: boolean | null
  setAutohideDock: (v: boolean | null) => void
  dockOrientation: string
  setDockOrientation: (v: string) => void
  minimizeScaleEnabled: boolean
  setMinimizeScaleEnabled: (v: boolean) => void
  autohideMenuBar: MenuBarAutoHideMode | null
  setAutohideMenuBar: (v: MenuBarAutoHideMode | null) => void
  dockShowRecents: boolean | null
  setDockShowRecents: (v: boolean | null) => void
  hideDesktopIcons: boolean | null
  setHideDesktopIcons: (v: boolean | null) => void
  screenSaver: boolean | null
  setScreenSaver: (v: boolean | null) => void

  screenshotFormat: string | null
  setScreenshotFormat: (v: string | null) => void
  screenshotDisableShadow: boolean | null
  setScreenshotDisableShadow: (v: boolean | null) => void
  screenshotShowThumbnail: boolean | null
  setScreenshotShowThumbnail: (v: boolean | null) => void
  screenshotSaveLocation: string | null
  setScreenshotSaveLocation: (v: string | null) => void

  // ── Security ──
  lockScreenPassword: boolean
  setLockScreenPassword: (v: boolean) => void
  lockScreenPasswordDelay: number
  setLockScreenPasswordDelay: (v: number) => void

  networkFirewall: boolean | null
  setNetworkFirewall: (v: boolean | null) => void
  networkSsh: boolean | null
  setNetworkSsh: (v: boolean | null) => void
  networkScreenSharing: boolean | null
  setNetworkScreenSharing: (v: boolean | null) => void
  networkAirdropDisabled: boolean | null
  setNetworkAirdropDisabled: (v: boolean | null) => void

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
  setLowPowerMode: (v: LowPowerMode | null) => void

  finderShowHiddenFiles: boolean | null
  setFinderShowHiddenFiles: (v: boolean | null) => void
  finderShowPathbar: boolean | null
  setFinderShowPathbar: (v: boolean | null) => void
  finderShowStatusbar: boolean | null
  setFinderShowStatusbar: (v: boolean | null) => void
  finderShowLibraryDir: boolean | null
  setFinderShowLibraryDir: (v: boolean | null) => void
  finderShowFileExtensions: boolean | null
  setFinderShowFileExtensions: (v: boolean | null) => void
  finderNoDsStore: boolean | null
  setFinderNoDsStore: (v: boolean | null) => void

  loginItems: LoginItem[]
  setLoginItems: (items: LoginItem[]) => void

  defaultBrowser: string | null
  setDefaultBrowser: (v: string | null) => void

  // ── Shared ──
  applyingKeys: Set<string>
  setApplyingKey: (key: string, on: boolean) => void
  applySnapshot: (snapshot: SystemSettingsSnapshot) => void
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

  loadedSections: new Set<string>(),
  markSectionLoaded: (sectionId) =>
    set((state) => {
      const next = new Set(state.loadedSections)
      next.add(sectionId)
      return { loadedSections: next }
    }),

  // ── Appearance defaults ──
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
  finderNoDsStore: null,
  setFinderNoDsStore: (v) => set({ finderNoDsStore: v }),

  loginItems: [],
  setLoginItems: (items) => set({ loginItems: items }),

  defaultBrowser: null,
  setDefaultBrowser: (v) => set({ defaultBrowser: v }),

  // ── Shared ──
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
  applySnapshot: (snapshot) =>
    set({
      autohideDock: snapshot.toggles.autohide_dock,
      autohideMenuBar: snapshot.toggles.autohide_menu_bar,
      dockShowRecents: snapshot.toggles.dock_show_recents,
      hideDesktopIcons: snapshot.toggles.hide_desktop_icons,
      lowPowerMode: snapshot.toggles.low_power_mode,
      screenSaver: snapshot.toggles.screen_saver,
      screenshotFormat: snapshot.screenshot.format,
      screenshotDisableShadow: snapshot.screenshot.disable_shadow,
      screenshotShowThumbnail: snapshot.screenshot.show_thumbnail,
      screenshotSaveLocation: snapshot.screenshot.save_location,
      networkFirewall: snapshot.network.firewall,
      networkSsh: snapshot.network.ssh,
      networkScreenSharing: snapshot.network.screen_sharing,
      networkAirdropDisabled: snapshot.network.airdrop_disabled,
      finderShowHiddenFiles: snapshot.finder.show_hidden_files,
      finderShowPathbar: snapshot.finder.show_pathbar,
      finderShowStatusbar: snapshot.finder.show_statusbar,
      finderShowLibraryDir: snapshot.finder.show_library_dir,
      finderShowFileExtensions: snapshot.finder.show_file_extensions,
      finderNoDsStore: snapshot.finder.no_ds_store,
    }),
}))
