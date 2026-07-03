/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";
import type {
  SleepConfig,
  MenuBarAutoHideMode,
  LowPowerMode,
} from "@/lib/tauri/types/system-settings";

// Sleep inhibitor
export function toggleSleepInhibitor(config: SleepConfig, enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.toggleSleepInhibitor, { config, enabled });
}
export function getSleepInhibitorState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getSleepInhibitorState);
}
export function resetSleepInhibitor() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.resetSleepInhibitor);
}

// Finder
export function getFinderShowHiddenFiles() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getFinderShowHiddenFiles);
}
export function setFinderShowHiddenFiles(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowHiddenFiles, { show });
}
export function getFinderShowPathbar() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getFinderShowPathbar);
}
export function setFinderShowPathbar(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowPathbar, { show });
}
export function getFinderShowStatusbar() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getFinderShowStatusbar);
}
export function setFinderShowStatusbar(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowStatusbar, { show });
}
export function getFinderShowLibraryDir() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getFinderShowLibraryDir);
}
export function setFinderShowLibraryDir(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowLibraryDir, { show });
}
export function getFinderShowFileExtensions() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getFinderShowFileExtensions);
}
export function setFinderShowFileExtensions(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowFileExtensions, { show });
}
export function getFinderSpotlightExternalDisk() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getFinderSpotlightExternalDisk);
}
export function setFinderSpotlightExternalDisk(disk: string, enable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderSpotlightExternalDisk, { disk, enable });
}
export function getFinderNoDsStore() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getFinderNoDsStore);
}
export function setFinderNoDsStore(noDs: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderNoDsStore, { noDs });
}

// Dock
export function getDockOrientation() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getDockOrientation);
}
export function setDockOrientation(pos: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setDockOrientation, { pos });
}
export function getMinimizeScaleEnabled() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getMinimizeScaleEnabled);
}
export function setMinimizeScaleEnabled(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setMinimizeScaleEnabled, { enabled });
}

// Keyboard
export function getKeyboardFnKeyState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getKeyboardFnKeyState);
}
export function setKeyboardFnKeyState(useFn: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setKeyboardFnKeyState, { useFn });
}
export function getAutoCorrectState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getAutoCorrectState);
}
export function setAutoCorrectState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setAutoCorrectState, { enabled });
}
export function getSmartQuotesState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getSmartQuotesState);
}
export function setSmartQuotesState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setSmartQuotesState, { enabled });
}
export function getSmartDashesState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getSmartDashesState);
}
export function setSmartDashesState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setSmartDashesState, { enabled });
}
export function getAutoCapitalizeState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getAutoCapitalizeState);
}
export function setAutoCapitalizeState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setAutoCapitalizeState, { enabled });
}

// Display
export function getDisplayBatteryPercent() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getDisplayBatteryPercent);
}
export function setDisplayBatteryPercent(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setDisplayBatteryPercent, { show });
}

// Network
export function getNetworkFirewallState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getNetworkFirewallState);
}
export function setNetworkFirewallState(enable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkFirewallState, { enable });
}
export function getNetworkSshState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getNetworkSshState);
}
export function setNetworkSshState(enable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkSshState, { enable });
}
export function getNetworkScreenSharingState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getNetworkScreenSharingState);
}
export function setNetworkScreenSharingState(enable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkScreenSharingState, { enable });
}
export function getNetworkAirdropDisabled() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getNetworkAirdropDisabled);
}
export function setNetworkAirdropDisabled(disable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkAirdropDisabled, { disable });
}

// Screenshot
export function getScreenshotFormat() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getScreenshotFormat);
}
export function setScreenshotFormat(format: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotFormat, { format });
}
export function getScreenshotDisableShadow() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getScreenshotDisableShadow);
}
export function setScreenshotDisableShadow(disable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotDisableShadow, { disable });
}
export function getScreenshotShowThumbnail() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getScreenshotShowThumbnail);
}
export function setScreenshotShowThumbnail(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotShowThumbnail, { show });
}
export function getScreenshotSaveLocation() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getScreenshotSaveLocation);
}
export function setScreenshotSaveLocation(path: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotSaveLocation, { path });
}

// Privacy
export function getTccPermissions(service: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getTccPermissions, { service });
}

// Maintenance
export function rebuildIconCache() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.rebuildIconCache);
}
export function flushDnsCache() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.flushDnsCache);
}
export function rebuildSpotlightIndex() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.rebuildSpotlightIndex);
}
export function resetLaunchServices() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.resetLaunchServices);
}
export function flushFontCache() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.flushFontCache);
}

// Quick actions
export function lockScreen() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.lockScreen);
}
export function emptyTrash() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.emptyTrash);
}
export function sleepNow() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.sleepNow);
}
export function rebootNow() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.rebootNow);
}
export function shutdownNow() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.shutdownNow);
}
export function getLockScreenPasswordEnabled() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLockScreenPasswordEnabled);
}
export function setLockScreenPasswordEnabled(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setLockScreenPasswordEnabled, { enabled });
}
export function getLockScreenPasswordDelay() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLockScreenPasswordDelay);
}
export function setLockScreenPasswordDelay(seconds: number) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setLockScreenPasswordDelay, { seconds });
}

// Default browser
export function getDefaultBrowser() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getDefaultBrowser);
}
export function setDefaultBrowser(bundleId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setDefaultBrowser, { bundleId });
}

// Privacy
export function resetTccPermission(service: string, bundleId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.resetTccPermission, { service, bundleId });
}

// Gatekeeper
export function getGatekeeperState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getGatekeeperState);
}

// Login items
export function getLoginItems() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLoginItems);
}
export function addLoginItem(path: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.addLoginItem, { path });
}
export function removeLoginItem(name: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.removeLoginItem, { name });
}
export function getLaunchAgents() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLaunchAgents);
}
export function getLaunchDaemons() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLaunchDaemons);
}

// Dev tools
export function jsonFormat(input: string, indent: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.jsonFormat, { input, indent });
}
export function base64Encode(input: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.base64Encode, { input });
}
export function base64Decode(input: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.base64Decode, { input });
}
export function generateUuid() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.generateUuid);
}
export function calculateHash(input: string, algorithm: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.calculateHash, { input, algorithm });
}
export function timestampConvert(ts: number, format: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.timestampConvert, { ts, format });
}

// Network diagnostics
export function pingHost(host: string, count: number) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.pingHost, { host, count });
}
export function dnsLookup(domain: string, recordType: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.dnsLookup, { domain, recordType });
}
export function portCheck(host: string, port: number) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.portCheck, { host, port });
}
export function tracerouteHost(host: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.tracerouteHost, { host });
}
export function getLocalIp() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLocalIp);
}
export function getWifiInfo() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getWifiInfo);
}

// System toggles
export function getDarkModeState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getDarkModeState);
}
export function setDarkModeState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setDarkModeState, { enabled });
}
export function getAutohideDockState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getAutohideDockState);
}
export function setAutohideDockState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setAutohideDockState, { enabled });
}
export function getAutohideMenuBarState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getAutohideMenuBarState);
}
export function setAutohideMenuBarState(mode: MenuBarAutoHideMode) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setAutohideMenuBarState, { mode });
}
export function getDockShowRecentsState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getDockShowRecentsState);
}
export function setDockShowRecentsState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setDockShowRecentsState, { enabled });
}
export function getHideDesktopIconsState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getHideDesktopIconsState);
}
export function setHideDesktopIconsState(hide: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setHideDesktopIconsState, { hide });
}
export function getLowPowerModeState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLowPowerModeState);
}
export function setLowPowerModeState(mode: LowPowerMode) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setLowPowerModeState, { mode });
}
export function getScreenSaverState() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getScreenSaverState);
}
export function setScreenSaverState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenSaverState, { enabled });
}

// ── Semantic pane commands ──
export function openSettingsPane(pane: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openSettingsPane, { pane });
}
export function openBatterySettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openBatterySettings);
}
export function openControlCenterSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openControlCenterSettings);
}
export function openDesktopSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openDesktopSettings);
}
export function openKeyboardSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openKeyboardSettings);
}
export function openLocalizationSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openLocalizationSettings);
}
export function openLockScreenSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openLockScreenSettings);
}
export function openLoginItemsSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openLoginItemsSettings);
}
export function openNetworkSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openNetworkSettings);
}
export function openPrivacySecuritySettings() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.openPrivacySecuritySettings);
}
