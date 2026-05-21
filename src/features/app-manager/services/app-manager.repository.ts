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
import { readStorageItem, writeStorageItem } from "@/platform/storage";
import type { PersistedPreferences } from "@/features/app-manager/model/preferences";

const PREF_KEY = "app-manager-preferences";
const VIEW_MODE_KEY = "view-mode:app-manager";

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
  loadPreferences() {
    return readStorageItem(PREF_KEY);
  },
  savePreferences(preferences: PersistedPreferences) {
    writeStorageItem(PREF_KEY, JSON.stringify(preferences));
  },
  loadViewMode() {
    return readStorageItem(VIEW_MODE_KEY);
  },
  saveViewMode(mode: "table" | "grid") {
    writeStorageItem(VIEW_MODE_KEY, mode);
  },
};

export type AppManagerRepository = typeof appManagerRepository;
