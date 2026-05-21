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
