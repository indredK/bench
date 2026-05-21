import type {
  AppInfo,
  AppScanResult,
  BatchOperationResult,
  InstallListAppInfo,
  OperationRecord,
  OperationResult,
} from "@/lib/tauri/types/app-manager";
import { appManagerRepository } from "@/features/app-manager/services/app-manager.repository";
import { isDesktopRuntime } from "@/platform/runtime";

export const appManagerUseCases = {
  isAvailable() {
    return isDesktopRuntime();
  },

  scanInstalledApps(): Promise<AppScanResult> {
    return appManagerRepository.scanInstalledApps();
  },

  async findManagedAppUpdates(apps: AppInfo[]): Promise<Set<string>> {
    if (!isDesktopRuntime() || apps.length === 0) return new Set();

    const managedIds = apps.filter((app) => app.canUpgrade).map((app) => app.appId);
    if (managedIds.length === 0) return new Set();

    const updatableIds = await appManagerRepository.checkManagedAppUpdates(managedIds);
    return new Set(updatableIds);
  },

  upgradeApp(appId: string): Promise<OperationResult> {
    return appManagerRepository.upgradeApp(appId);
  },

  uninstallApp(appId: string): Promise<OperationResult> {
    return appManagerRepository.uninstallApp(appId);
  },

  installApp(
    appId: string,
    installSource: InstallListAppInfo["installSource"]
  ): Promise<OperationResult> {
    return appManagerRepository.installApp(appId, installSource);
  },

  batchUpgradeApps(ids: string[]): Promise<BatchOperationResult> {
    return appManagerRepository.batchUpgradeApps(ids);
  },

  batchUninstallApps(ids: string[]): Promise<BatchOperationResult> {
    return appManagerRepository.batchUninstallApps(ids);
  },

  loadHistory(): Promise<OperationRecord[]> {
    return appManagerRepository.getAppOperationHistory();
  },

  launchApp(app: AppInfo) {
    if (!isDesktopRuntime()) return Promise.resolve();
    return appManagerRepository.launchApp(app.installPath);
  },

  revealApp(app: AppInfo) {
    if (!isDesktopRuntime()) return Promise.resolve();
    return appManagerRepository.revealAppInFinder(app.installPath);
  },

  openExternal(reference: string) {
    return appManagerRepository.openExternal(reference);
  },
};
