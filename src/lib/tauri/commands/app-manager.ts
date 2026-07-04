/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";
import type {
  InstallSource,
  UpdateInfo,
} from "@/lib/tauri/types/app-manager";

export function scanInstalledApps() {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.scanInstalledApps);
}

export function getAppIconBase64(installPath: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.getAppIconBase64, { installPath });
}

export function launchApp(appPath: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.launchApp, { appPath });
}

export function revealAppInFinder(appPath: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.revealAppInFinder, { appPath });
}

export function checkManagedAppUpdates(appIds: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.checkManagedAppUpdates, { appIds });
}

export function upgradeApp(appId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.upgradeApp, { appId });
}

export function uninstallApp(appId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.uninstallApp, { appId });
}

export function batchUpgradeApps(appIds: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.batchUpgradeApps, { appIds });
}

export function batchUninstallApps(appIds: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.batchUninstallApps, { appIds });
}

export function installApp(appId: string, installSource: InstallSource) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.installApp, { appId, installSource });
}

export function cancelBatchOperation() {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.cancelBatchOperation);
}

export function checkAllAppUpdates(forceRefresh?: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.checkAllAppUpdates, { forceRefresh });
}

export function openInMacAppStore(adamId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.openInMacAppStore, { adamId });
}

export function openMacAppStoreUpdates() {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.openMacAppStoreUpdates);
}

/**
 * v1.2: kick off the in-place install pipeline (download → verify → extract
 * → replace) for a Sparkle / Electron / Squirrel update. Returns immediately
 * after spawning the orchestrator; progress is delivered via the
 * `app-update-install:progress` / `app-update-install:finished` events.
 */
export function installAppUpdate(update: UpdateInfo) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.installAppUpdate, { update });
}

/** v1.2: request cancellation of an in-flight install. Idempotent. */
export function cancelAppUpdate(appId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.cancelAppUpdate, { appId });
}

/**
 * v1.2: resolve a `developerIdChanged` checkpoint with the user's decision.
 * `approved = true` continues the install; `false` rolls back.
 */
export function confirmDeveloperIdChange(appId: string, approved: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.confirmDeveloperIdChange, {
    appId,
    approved,
  });
}
