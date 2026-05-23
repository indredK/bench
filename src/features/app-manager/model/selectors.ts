/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import { classifyApp } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import { classifySeries } from "@/features/app-manager/app-series";
import type { AppFilterKey } from "@/features/app-manager/model/preferences";

interface FilterAppManagerItemsOptions {
  apps: AppInfo[];
  searchQuery: string;
  activeFilter: AppFilterKey;
  categoryFilter: AppCategoryKey | null;
  seriesFilter: AppSeriesKey | null;
}

interface FilterInstallListAppsOptions {
  installListApps: InstallListAppInfo[];
  searchQuery: string;
  categoryFilter: AppCategoryKey | null;
  seriesFilter: AppSeriesKey | null;
}

export function filterAppManagerItems({
  apps,
  searchQuery,
  activeFilter,
  categoryFilter,
  seriesFilter,
}: FilterAppManagerItemsOptions): AppInfo[] {
  return filterInstalledApps({
    apps,
    searchQuery,
    activeFilter,
    categoryFilter,
    seriesFilter,
  });
}

export function filterInstallListApps({
  installListApps,
  searchQuery,
  categoryFilter,
  seriesFilter,
}: FilterInstallListAppsOptions): InstallListAppInfo[] {
  let result = installListApps;
  const query = searchQuery.trim().toLowerCase();

  if (query) {
    result = result.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        app.description.toLowerCase().includes(query)
    );
  }

  if (categoryFilter) {
    result = result.filter((app) => app.category === categoryFilter);
  }

  if (seriesFilter) {
    result = result.filter((app) => app.series === seriesFilter);
  }

  return result;
}

function filterInstalledApps({
  apps,
  searchQuery,
  activeFilter,
  categoryFilter,
  seriesFilter,
}: Omit<FilterAppManagerItemsOptions, "installListApps">): AppInfo[] {
  const query = searchQuery.trim().toLowerCase();

  return apps.filter((app) => {
    if (
      query &&
      !app.name.toLowerCase().includes(query) &&
      !app.installPath.toLowerCase().includes(query) &&
      !app.bundleId.toLowerCase().includes(query)
    ) {
      return false;
    }

    switch (activeFilter) {
      case "user":
        if (app.isSystemApp) return false;
        break;
      case "system":
        if (!app.isSystemApp) return false;
        break;
      case "launchable":
        if (!app.allowedActions.launch) return false;
        break;
      case "managed":
        if (!app.canUpgrade && !app.canUninstall) return false;
        break;
    }

    if (categoryFilter && classifyApp(app) !== categoryFilter) return false;
    if (seriesFilter && classifySeries(app) !== seriesFilter) return false;

    return true;
  });
}
