/**
 * Use Cases / 用例层: business logic; 业务逻辑.
 */
import { canUseDesktopFeatures } from "@/platform/capabilities";
import { systemSettingsRepository } from "./system-settings.repository";

export const systemSettingsUseCases = {
  isAvailable() {
    return canUseDesktopFeatures();
  },

  // Sleep
  toggleSleepInhibitor: systemSettingsRepository.toggleSleepInhibitor,
  getSleepInhibitorState: systemSettingsRepository.getSleepInhibitorState,
  resetSleepInhibitor: systemSettingsRepository.resetSleepInhibitor,

  // Finder
  getFinderShowHiddenFiles: systemSettingsRepository.getFinderShowHiddenFiles,
  setFinderShowHiddenFiles: systemSettingsRepository.setFinderShowHiddenFiles,
  getFinderShowPathbar: systemSettingsRepository.getFinderShowPathbar,
  setFinderShowPathbar: systemSettingsRepository.setFinderShowPathbar,
  getFinderShowStatusbar: systemSettingsRepository.getFinderShowStatusbar,
  setFinderShowStatusbar: systemSettingsRepository.setFinderShowStatusbar,
  getFinderShowLibraryDir: systemSettingsRepository.getFinderShowLibraryDir,
  setFinderShowLibraryDir: systemSettingsRepository.setFinderShowLibraryDir,
  getFinderShowFileExtensions: systemSettingsRepository.getFinderShowFileExtensions,
  setFinderShowFileExtensions: systemSettingsRepository.setFinderShowFileExtensions,
  getFinderSpotlightExternalDisk: systemSettingsRepository.getFinderSpotlightExternalDisk,
  setFinderSpotlightExternalDisk: systemSettingsRepository.setFinderSpotlightExternalDisk,
  getFinderNoDsStore: systemSettingsRepository.getFinderNoDsStore,
  setFinderNoDsStore: systemSettingsRepository.setFinderNoDsStore,

  // Dock
  getDockOrientation: systemSettingsRepository.getDockOrientation,
  setDockOrientation: systemSettingsRepository.setDockOrientation,

  // Keyboard
  getKeyboardFnKeyState: systemSettingsRepository.getKeyboardFnKeyState,
  setKeyboardFnKeyState: systemSettingsRepository.setKeyboardFnKeyState,

  // Display
  getDisplayBatteryPercent: systemSettingsRepository.getDisplayBatteryPercent,
  setDisplayBatteryPercent: systemSettingsRepository.setDisplayBatteryPercent,

  // Network
  getNetworkFirewallState: systemSettingsRepository.getNetworkFirewallState,
  setNetworkFirewallState: systemSettingsRepository.setNetworkFirewallState,
  getNetworkSshState: systemSettingsRepository.getNetworkSshState,
  setNetworkSshState: systemSettingsRepository.setNetworkSshState,
  getNetworkScreenSharingState: systemSettingsRepository.getNetworkScreenSharingState,
  setNetworkScreenSharingState: systemSettingsRepository.setNetworkScreenSharingState,
  getNetworkAirdropDisabled: systemSettingsRepository.getNetworkAirdropDisabled,
  setNetworkAirdropDisabled: systemSettingsRepository.setNetworkAirdropDisabled,

  // Screenshot
  getScreenshotFormat: systemSettingsRepository.getScreenshotFormat,
  setScreenshotFormat: systemSettingsRepository.setScreenshotFormat,
  getScreenshotDisableShadow: systemSettingsRepository.getScreenshotDisableShadow,
  setScreenshotDisableShadow: systemSettingsRepository.setScreenshotDisableShadow,
  getScreenshotShowThumbnail: systemSettingsRepository.getScreenshotShowThumbnail,
  setScreenshotShowThumbnail: systemSettingsRepository.setScreenshotShowThumbnail,
  getScreenshotSaveLocation: systemSettingsRepository.getScreenshotSaveLocation,
  setScreenshotSaveLocation: systemSettingsRepository.setScreenshotSaveLocation,

  // Privacy
  getTccPermissions: systemSettingsRepository.getTccPermissions,

  // Maintenance
  rebuildIconCache: systemSettingsRepository.rebuildIconCache,
  flushDnsCache: systemSettingsRepository.flushDnsCache,
  rebuildSpotlightIndex: systemSettingsRepository.rebuildSpotlightIndex,
  resetLaunchServices: systemSettingsRepository.resetLaunchServices,
  flushFontCache: systemSettingsRepository.flushFontCache,

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

  openSystemPane: systemSettingsRepository.openSystemPane,
  // Privacy
  resetTccPermission: systemSettingsRepository.resetTccPermission,

  // Login items
  getLoginItems: systemSettingsRepository.getLoginItems,
  addLoginItem: systemSettingsRepository.addLoginItem,
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
  dnsLookup: systemSettingsRepository.dnsLookup,
  portCheck: systemSettingsRepository.portCheck,
  tracerouteHost: systemSettingsRepository.tracerouteHost,
  getLocalIp: systemSettingsRepository.getLocalIp,
  getWifiInfo: systemSettingsRepository.getWifiInfo,

  // System toggles
  getDarkModeState: systemSettingsRepository.getDarkModeState,
  setDarkModeState: systemSettingsRepository.setDarkModeState,
  getAutohideDockState: systemSettingsRepository.getAutohideDockState,
  setAutohideDockState: systemSettingsRepository.setAutohideDockState,
  getAutohideMenuBarState: systemSettingsRepository.getAutohideMenuBarState,
  setAutohideMenuBarState: systemSettingsRepository.setAutohideMenuBarState,
  getDockShowRecentsState: systemSettingsRepository.getDockShowRecentsState,
  setDockShowRecentsState: systemSettingsRepository.setDockShowRecentsState,
  getHideDesktopIconsState: systemSettingsRepository.getHideDesktopIconsState,
  setHideDesktopIconsState: systemSettingsRepository.setHideDesktopIconsState,
  getMuteMicState: systemSettingsRepository.getMuteMicState,
  setMuteMicState: systemSettingsRepository.setMuteMicState,
  getLowPowerModeState: systemSettingsRepository.getLowPowerModeState,
  setLowPowerModeState: systemSettingsRepository.setLowPowerModeState,
  getGatekeeperState: systemSettingsRepository.getGatekeeperState,
  getScreenSaverState: systemSettingsRepository.getScreenSaverState,
  setScreenSaverState: systemSettingsRepository.setScreenSaverState,
  emptyPasteboard: systemSettingsRepository.emptyPasteboard,
  ejectDiscs: systemSettingsRepository.ejectDiscs,
  getSmallLaunchpadIconState: systemSettingsRepository.getSmallLaunchpadIconState,
  setSmallLaunchpadIconState: systemSettingsRepository.setSmallLaunchpadIconState,
};
