/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import {
  batchUninstallApps,
  batchUpgradeApps,
  cancelBatchOperation,
  checkAllAppUpdates,
  checkManagedAppUpdates,
  getAppIconBase64,
  installApp,
  launchApp,
  openInMacAppStore,
  openMacAppStoreUpdates,
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
  getAppIconBase64,
  launchApp,
  revealAppInFinder,
  checkManagedAppUpdates,
  upgradeApp,
  uninstallApp,
  batchUpgradeApps,
  batchUninstallApps,
  installApp,
  cancelBatchOperation,
  checkAllAppUpdates,
  openInMacAppStore,
  openMacAppStoreUpdates,
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
