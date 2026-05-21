import { invoke } from "@tauri-apps/api/core";
import type {
  AppScanResult,
  BatchOperationResult,
  InstallSource,
  OperationRecord,
  OperationResult,
} from "@/lib/tauri/types/app-manager";

export function scanInstalledApps() {
  return invoke<AppScanResult>("scan_installed_apps");
}

export function launchApp(appPath: string) {
  return invoke<void>("launch_app", { appPath });
}

export function revealAppInFinder(appPath: string) {
  return invoke<void>("reveal_app_in_finder", { appPath });
}

export function checkManagedAppUpdates(appIds: string[]) {
  return invoke<string[]>("check_managed_app_updates", { appIds });
}

export function upgradeApp(appId: string) {
  return invoke<OperationResult>("upgrade_app", { appId });
}

export function uninstallApp(appId: string) {
  return invoke<OperationResult>("uninstall_app", { appId });
}

export function getAppOperationHistory(appId?: string) {
  return invoke<OperationRecord[]>("get_app_operation_history", { appId: appId || null });
}

export function batchUpgradeApps(appIds: string[]) {
  return invoke<BatchOperationResult>("batch_upgrade_apps", { appIds });
}

export function batchUninstallApps(appIds: string[]) {
  return invoke<BatchOperationResult>("batch_uninstall_apps", { appIds });
}

export function refreshAppUpdates(appIds: string[]) {
  return invoke<string[]>("refresh_app_updates", { appIds });
}

export function installApp(appId: string, installSource: InstallSource) {
  return invoke<OperationResult>("install_app", { appId, installSource });
}

export function batchInstallApps(items: { appId: string; installSource: InstallSource }[]) {
  return invoke<BatchOperationResult>("batch_install_apps", { items });
}
