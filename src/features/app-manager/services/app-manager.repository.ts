/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import {
  batchInstallApps,
  batchUninstallApps,
  batchUpgradeApps,
  checkManagedAppUpdates,
  getAppOperationHistory,
  installApp,
  launchApp,
  refreshAppUpdates,
  revealAppInFinder,
  scanInstalledApps,
  uninstallApp,
  upgradeApp,
} from "@/lib/tauri/commands/app-manager";
import { openExternal } from "@/platform/shell";

export const appManagerRepository = {
  scanInstalledApps,
  launchApp,
  revealAppInFinder,
  checkManagedAppUpdates,
  upgradeApp,
  uninstallApp,
  getAppOperationHistory,
  batchUpgradeApps,
  batchUninstallApps,
  refreshAppUpdates,
  installApp,
  batchInstallApps,
  openExternal,
};

export type AppManagerRepository = typeof appManagerRepository;
