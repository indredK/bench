/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";
import type {
  InstallSource,
} from "@/lib/tauri/types/app-manager";

export function scanInstalledApps() {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.scanInstalledApps);
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

export function getAppOperationHistory(appId?: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.getAppOperationHistory, { appId: appId || null });
}

export function batchUpgradeApps(appIds: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.batchUpgradeApps, { appIds });
}

export function batchUninstallApps(appIds: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.batchUninstallApps, { appIds });
}

export function refreshAppUpdates(appIds: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.refreshAppUpdates, { appIds });
}

export function installApp(appId: string, installSource: InstallSource) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.installApp, { appId, installSource });
}

export function batchInstallApps(items: { appId: string; installSource: InstallSource }[]) {
  return invokeTauriCommand(TAURI_COMMANDS.appManager.batchInstallApps, { items });
}
