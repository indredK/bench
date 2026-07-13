/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager"
import type { AppCategoryKey } from "@/features/app-manager/app-categories"
import { classifyApp } from "@/features/app-manager/app-categories"
import type { AppSeriesKey } from "@/features/app-manager/app-series"
import { classifySeries } from "@/features/app-manager/app-series"
import type { AppFilterKey, MarketplaceFilterKey } from "@/features/app-manager/model/preferences"

interface FilterAppManagerItemsOptions {
  apps: AppInfo[]
  searchQuery: string
  activeFilter: AppFilterKey
  categoryFilter: AppCategoryKey | null
  seriesFilter: AppSeriesKey | null
}

interface FilterInstallListAppsOptions {
  installListApps: InstallListAppInfo[]
  searchQuery: string
  marketplaceFilter: MarketplaceFilterKey
  categoryFilter: AppCategoryKey | null
  seriesFilter: AppSeriesKey | null
  getLocalizedDescription?: (app: InstallListAppInfo) => string
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
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
  })
}

export function filterInstallListApps({
  installListApps,
  searchQuery,
  marketplaceFilter,
  categoryFilter,
  seriesFilter,
  getLocalizedDescription,
}: FilterInstallListAppsOptions): InstallListAppInfo[] {
  let result = installListApps
  const query = normalizeSearch(searchQuery.trim())

  if (query) {
    result = result.filter((app) =>
      normalizeSearch(
        `${app.name} ${app.description} ${getLocalizedDescription?.(app) ?? ""}`,
      ).includes(query),
    )
  }

  if (categoryFilter) {
    result = result.filter((app) => app.category === categoryFilter)
  }

  switch (marketplaceFilter) {
    case "pending":
      result = result.filter((app) => !app.installed)
      break
    case "installed":
      result = result.filter((app) => app.installed)
      break
  }

  if (seriesFilter) {
    result = result.filter((app) => app.series === seriesFilter)
  }

  return result
}

export function getInstalledFilterCounts(apps: AppInfo[]): Record<AppFilterKey, number> {
  const counts: Record<AppFilterKey, number> = {
    all: apps.length,
    user: 0,
    system: 0,
    launchable: 0,
    managed: 0,
  }

  for (const app of apps) {
    if (app.isSystemApp) {
      counts.system += 1
    } else {
      counts.user += 1
    }

    if (app.allowedActions.launch) {
      counts.launchable += 1
    }

    if (app.canUpgrade || app.canUninstall) {
      counts.managed += 1
    }
  }

  return counts
}

function filterInstalledApps({
  apps,
  searchQuery,
  activeFilter,
  categoryFilter,
  seriesFilter,
}: Omit<FilterAppManagerItemsOptions, "installListApps">): AppInfo[] {
  const query = normalizeSearch(searchQuery.trim())

  return apps.filter((app) => {
    if (
      query &&
      !normalizeSearch(app.name).includes(query) &&
      !normalizeSearch(app.installPath).includes(query) &&
      !normalizeSearch(app.bundleId).includes(query)
    ) {
      return false
    }

    switch (activeFilter) {
      case "user":
        if (app.isSystemApp) return false
        break
      case "system":
        if (!app.isSystemApp) return false
        break
      case "launchable":
        if (!app.allowedActions.launch) return false
        break
      case "managed":
        if (!app.canUpgrade && !app.canUninstall) return false
        break
    }

    if (categoryFilter && classifyApp(app) !== categoryFilter) return false
    if (seriesFilter && classifySeries(app) !== seriesFilter) return false

    return true
  })
}
