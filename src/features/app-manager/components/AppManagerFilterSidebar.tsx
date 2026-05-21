/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { Badge } from "@/components/ui/badge";
import { FilterPanel } from "@/components/layout/FilterPanel";
import { APP_FILTER_OPTIONS } from "@/features/app-manager/store";
import { CategoryFilter, type CategorizableItem } from "@/features/app-manager/CategoryFilter";
import type { AppInfo, InstallListAppInfo, PlatformCapabilities } from "@/lib/tauri/types/app-manager";
import type { AppFilterKey } from "@/features/app-manager/model/store-types";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";

interface AppManagerFilterSidebarProps {
  t: TFunction;
  open: boolean;
  activeFilterCount: number;
  activeFilter: AppFilterKey;
  apps: AppInfo[];
  installListApps: InstallListAppInfo[];
  categoryFilter: AppCategoryKey | null;
  seriesFilter: AppSeriesKey | null;
  capabilities: PlatformCapabilities | undefined;
  lastScanTime: number;
  lastUpdateCheck: number;
  totalCount: number | undefined;
  managedCount: number | undefined;
  onToggle: () => void;
  onActiveFilterChange: (filter: AppFilterKey) => void;
  onCategoryChange: (category: AppCategoryKey | null) => void;
  onSeriesChange: (series: AppSeriesKey | null) => void;
}

export function AppManagerFilterSidebar({
  t,
  open,
  activeFilterCount,
  activeFilter,
  apps,
  installListApps,
  categoryFilter,
  seriesFilter,
  capabilities,
  lastScanTime,
  lastUpdateCheck,
  totalCount,
  managedCount,
  onToggle,
  onActiveFilterChange,
  onCategoryChange,
  onSeriesChange,
}: AppManagerFilterSidebarProps) {
  return (
    <FilterPanel
      open={open}
      onToggle={onToggle}
      activeFilterCount={activeFilterCount}
      title={t("appManager.filters")}
    >
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <button
              onClick={() => onActiveFilterChange(activeFilter === "installList" ? "all" : activeFilter)}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                activeFilter !== "installList"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {t("appManager.filterBy")}
            </button>
            <span className="text-muted-foreground/50 text-xs select-none">|</span>
            <button
              onClick={() => onActiveFilterChange("installList")}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                activeFilter === "installList"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {t("appManager.installList")}
            </button>
          </div>
          {activeFilter !== "installList" && (
            <div className="flex flex-col gap-1">
              {APP_FILTER_OPTIONS.map((option) => (
                <Badge
                  key={option.key}
                  variant={activeFilter === option.key ? "default" : "outline"}
                  className="cursor-pointer select-none text-xs justify-start"
                  onClick={() => onActiveFilterChange(option.key)}
                >
                  {t(option.labelKey)}
                  {option.key === "all" && ` (${apps.length})`}
                  {option.key === "managed" && ` (${managedCount ?? 0})`}
                  {option.key === "upgradable" && ` (${apps.filter((app) => app.upgradeAvailable).length})`}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t">
          <CategoryFilter
            apps={activeFilter === "installList" ? (installListApps as CategorizableItem[]) : apps}
            categorySelected={categoryFilter}
            seriesSelected={seriesFilter}
            onCategoryChange={onCategoryChange}
            onSeriesChange={onSeriesChange}
          />
        </div>

        {capabilities && (
          <div className="pt-2 border-t">
            <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
              {t("appManager.platform")}
            </p>
            <div className="space-y-1.5 text-xs">
              {capabilities.brewAvailable && <p className="text-green-600">✓ Homebrew</p>}
              {capabilities.wingetAvailable && <p className="text-green-600">✓ winget</p>}
              {capabilities.flatpakAvailable && <p className="text-green-600">✓ Flatpak</p>}
              {capabilities.snapAvailable && <p className="text-green-600">✓ Snap</p>}
              {capabilities.aptAvailable && <p className="text-green-600">✓ APT</p>}
              {!capabilities.brewAvailable &&
                !capabilities.wingetAvailable &&
                !capabilities.flatpakAvailable &&
                !capabilities.snapAvailable &&
                !capabilities.aptAvailable && (
                  <p className="text-muted-foreground">{t("appManager.noPmAvailable")}</p>
                )}
            </div>
          </div>
        )}

        <div className="pt-2 border-t">
          <div className="text-[11px] text-muted-foreground space-y-1">
            {lastScanTime > 0 && (
              <p>{t("appManager.lastScan")}: {new Date(lastScanTime).toLocaleTimeString()}</p>
            )}
            {lastUpdateCheck > 0 && (
              <p>{t("appManager.lastUpdate")}: {new Date(lastUpdateCheck).toLocaleTimeString()}</p>
            )}
            {totalCount != null && managedCount != null && (
              <p>{t("appManager.summaryShort", { total: totalCount, managed: managedCount })}</p>
            )}
          </div>
        </div>
      </div>
    </FilterPanel>
  );
}
