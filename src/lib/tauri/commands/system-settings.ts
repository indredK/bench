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

// Finder
export function setFinderShowHiddenFiles(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowHiddenFiles, { show });
}
export function setFinderShowPathbar(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowPathbar, { show });
}
export function setFinderShowStatusbar(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowStatusbar, { show });
}
export function setFinderShowLibraryDir(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowLibraryDir, { show });
}
export function setFinderShowFileExtensions(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setFinderShowFileExtensions, { show });
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
export function setNetworkFirewallState(enable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkFirewallState, { enable });
}
export function setNetworkSshState(enable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkSshState, { enable });
}
export function setNetworkScreenSharingState(enable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkScreenSharingState, { enable });
}
export function setNetworkAirdropDisabled(disable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setNetworkAirdropDisabled, { disable });
}

// Screenshot
export function setScreenshotFormat(format: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotFormat, { format });
}
export function setScreenshotDisableShadow(disable: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotDisableShadow, { disable });
}
export function setScreenshotShowThumbnail(show: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotShowThumbnail, { show });
}
export function setScreenshotSaveLocation(path: string) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenshotSaveLocation, { path });
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

// Login items
export function getLoginItems() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLoginItems);
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
export function getAutostartStatus() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getAutostartStatus);
}
export function setAutostart(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setAutostart, { enabled });
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
export function portCheck(host: string, port: number) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.portCheck, { host, port });
}
export function getLocalIp() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getLocalIp);
}
export function getWifiInfo() {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.getWifiInfo);
}

// System toggles
export function setAutohideDockState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setAutohideDockState, { enabled });
}
export function setAutohideMenuBarState(mode: MenuBarAutoHideMode) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setAutohideMenuBarState, { mode });
}
export function setDockShowRecentsState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setDockShowRecentsState, { enabled });
}
export function setHideDesktopIconsState(hide: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setHideDesktopIconsState, { hide });
}
export function setLowPowerModeState(mode: LowPowerMode) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setLowPowerModeState, { mode });
}
export function setScreenSaverState(enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.systemSettings.setScreenSaverState, { enabled });
}

// ── Semantic pane commands ──
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
