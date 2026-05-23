/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { Badge } from "@/components/ui/badge";
import { FilterPanel } from "@/components/layout/FilterPanel";
import { APP_FILTER_OPTIONS } from "@/features/app-manager/store";
import { CategoryFilter, type CategorizableItem } from "@/features/app-manager/CategoryFilter";
import type { AppInfo, PlatformCapabilities } from "@/lib/tauri/types/app-manager";
import type { AppFilterKey } from "@/features/app-manager/model/store-types";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";

interface AppManagerFilterSidebarProps {
  t: TFunction;
  open: boolean;
  activeFilterCount: number;
  activeFilter: AppFilterKey;
  items: CategorizableItem[];
  mode?: "installed" | "marketplace";
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
  items,
  mode = "installed",
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
  const installedItems = items as AppInfo[];
  const showTypeFilters = mode === "installed";

  return (
    <FilterPanel
      open={open}
      onToggle={onToggle}
      activeFilterCount={activeFilterCount}
      title={t("appManager.filters")}
    >
      <div className="space-y-3">
        {showTypeFilters && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("appManager.filterBy")}
            </p>
            <div className="flex flex-col gap-1">
              {APP_FILTER_OPTIONS.map((option) => (
                <Badge
                  key={option.key}
                  variant={activeFilter === option.key ? "default" : "outline"}
                  className="cursor-pointer select-none text-xs justify-start"
                  onClick={() => onActiveFilterChange(option.key)}
                >
                  {t(option.labelKey)}
                  {option.key === "all" && ` (${installedItems.length})`}
                  {option.key === "managed" && ` (${managedCount ?? 0})`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className={showTypeFilters ? "pt-2 border-t" : undefined}>
          <CategoryFilter
            apps={items}
            categorySelected={categoryFilter}
            seriesSelected={seriesFilter}
            onCategoryChange={onCategoryChange}
            onSeriesChange={onSeriesChange}
          />
        </div>

        {showTypeFilters && capabilities && (
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

        {showTypeFilters && (
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
        )}
      </div>
    </FilterPanel>
  );
}
