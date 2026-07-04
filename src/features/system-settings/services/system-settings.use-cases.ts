/**
 * Use Cases / 用例层: business logic; 业务逻辑.
 */
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { systemSettingsRepository } from "./system-settings.repository"

export const systemSettingsUseCases = {
  isAvailable() {
    return canUseDesktopFeatures()
  },

  // Sleep
  toggleSleepInhibitor: systemSettingsRepository.toggleSleepInhibitor,
  getSleepInhibitorState: systemSettingsRepository.getSleepInhibitorState,

  // Finder
  setFinderShowHiddenFiles: systemSettingsRepository.setFinderShowHiddenFiles,
  setFinderShowPathbar: systemSettingsRepository.setFinderShowPathbar,
  setFinderShowStatusbar: systemSettingsRepository.setFinderShowStatusbar,
  setFinderShowLibraryDir: systemSettingsRepository.setFinderShowLibraryDir,
  setFinderShowFileExtensions: systemSettingsRepository.setFinderShowFileExtensions,
  setFinderNoDsStore: systemSettingsRepository.setFinderNoDsStore,

  // Dock
  getDockOrientation: systemSettingsRepository.getDockOrientation,
  setDockOrientation: systemSettingsRepository.setDockOrientation,
  getMinimizeScaleEnabled: systemSettingsRepository.getMinimizeScaleEnabled,
  setMinimizeScaleEnabled: systemSettingsRepository.setMinimizeScaleEnabled,

  // Keyboard
  getKeyboardFnKeyState: systemSettingsRepository.getKeyboardFnKeyState,
  setKeyboardFnKeyState: systemSettingsRepository.setKeyboardFnKeyState,
  getAutoCorrectState: systemSettingsRepository.getAutoCorrectState,
  setAutoCorrectState: systemSettingsRepository.setAutoCorrectState,
  getSmartQuotesState: systemSettingsRepository.getSmartQuotesState,
  setSmartQuotesState: systemSettingsRepository.setSmartQuotesState,
  getSmartDashesState: systemSettingsRepository.getSmartDashesState,
  setSmartDashesState: systemSettingsRepository.setSmartDashesState,
  getAutoCapitalizeState: systemSettingsRepository.getAutoCapitalizeState,
  setAutoCapitalizeState: systemSettingsRepository.setAutoCapitalizeState,

  // Display
  getDisplayBatteryPercent: systemSettingsRepository.getDisplayBatteryPercent,
  setDisplayBatteryPercent: systemSettingsRepository.setDisplayBatteryPercent,

  // Network
  setNetworkFirewallState: systemSettingsRepository.setNetworkFirewallState,
  setNetworkSshState: systemSettingsRepository.setNetworkSshState,
  setNetworkScreenSharingState: systemSettingsRepository.setNetworkScreenSharingState,
  setNetworkAirdropDisabled: systemSettingsRepository.setNetworkAirdropDisabled,

  // Screenshot
  setScreenshotFormat: systemSettingsRepository.setScreenshotFormat,
  setScreenshotDisableShadow: systemSettingsRepository.setScreenshotDisableShadow,
  setScreenshotShowThumbnail: systemSettingsRepository.setScreenshotShowThumbnail,
  setScreenshotSaveLocation: systemSettingsRepository.setScreenshotSaveLocation,

  // Quick actions
  lockScreen: systemSettingsRepository.lockScreen,
  emptyTrash: systemSettingsRepository.emptyTrash,
  sleepNow: systemSettingsRepository.sleepNow,
  rebootNow: systemSettingsRepository.rebootNow,
  shutdownNow: systemSettingsRepository.shutdownNow,
  getLockScreenPasswordEnabled: systemSettingsRepository.getLockScreenPasswordEnabled,
  setLockScreenPasswordEnabled: systemSettingsRepository.setLockScreenPasswordEnabled,
  getLockScreenPasswordDelay: systemSettingsRepository.getLockScreenPasswordDelay,
  setLockScreenPasswordDelay: systemSettingsRepository.setLockScreenPasswordDelay,

  // Default browser
  getDefaultBrowser: systemSettingsRepository.getDefaultBrowser,
  setDefaultBrowser: systemSettingsRepository.setDefaultBrowser,

  // Semantic pane commands
  openBatterySettings: systemSettingsRepository.openBatterySettings,
  openControlCenterSettings: systemSettingsRepository.openControlCenterSettings,
  openDesktopSettings: systemSettingsRepository.openDesktopSettings,
  openKeyboardSettings: systemSettingsRepository.openKeyboardSettings,
  openLocalizationSettings: systemSettingsRepository.openLocalizationSettings,
  openLockScreenSettings: systemSettingsRepository.openLockScreenSettings,
  openLoginItemsSettings: systemSettingsRepository.openLoginItemsSettings,
  openNetworkSettings: systemSettingsRepository.openNetworkSettings,
  openPrivacySecuritySettings: systemSettingsRepository.openPrivacySecuritySettings,
  // Privacy
  resetTccPermission: systemSettingsRepository.resetTccPermission,

  // Login items
  getLoginItems: systemSettingsRepository.getLoginItems,
  removeLoginItem: systemSettingsRepository.removeLoginItem,
  getLaunchAgents: systemSettingsRepository.getLaunchAgents,
  getLaunchDaemons: systemSettingsRepository.getLaunchDaemons,

  // Dev tools
  jsonFormat: systemSettingsRepository.jsonFormat,
  base64Encode: systemSettingsRepository.base64Encode,
  base64Decode: systemSettingsRepository.base64Decode,
  generateUuid: systemSettingsRepository.generateUuid,
  calculateHash: systemSettingsRepository.calculateHash,
  timestampConvert: systemSettingsRepository.timestampConvert,

  // Network diagnostics
  pingHost: systemSettingsRepository.pingHost,
  portCheck: systemSettingsRepository.portCheck,
  getLocalIp: systemSettingsRepository.getLocalIp,
  getWifiInfo: systemSettingsRepository.getWifiInfo,

  // System toggles
  setAutohideDockState: systemSettingsRepository.setAutohideDockState,
  setAutohideMenuBarState: systemSettingsRepository.setAutohideMenuBarState,
  setDockShowRecentsState: systemSettingsRepository.setDockShowRecentsState,
  setHideDesktopIconsState: systemSettingsRepository.setHideDesktopIconsState,
  setLowPowerModeState: systemSettingsRepository.setLowPowerModeState,
  setScreenSaverState: systemSettingsRepository.setScreenSaverState,
}
