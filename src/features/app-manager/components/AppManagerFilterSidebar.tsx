/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { Badge } from "@/components/ui/badge";
import { FilterPanel } from "@/components/layout/FilterPanel";
import { CategoryFilter, type CategorizableItem } from "@/features/app-manager/components/CategoryFilter";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import type { ReactNode } from "react";

export interface AppManagerTypeFilterOption<TKey extends string = string> {
  key: TKey;
  label: string;
  count?: number;
}

interface AppManagerFilterSidebarProps<TKey extends string> {
  t: TFunction;
  open: boolean;
  activeFilterCount: number;
  activeTypeFilter: TKey;
  typeFilterOptions: AppManagerTypeFilterOption<TKey>[];
  items: CategorizableItem[];
  categoryFilter: AppCategoryKey | null;
  seriesFilter: AppSeriesKey | null;
  footer?: ReactNode;
  onToggle: () => void;
  onTypeFilterChange: (filter: TKey) => void;
  onCategoryChange: (category: AppCategoryKey | null) => void;
  onSeriesChange: (series: AppSeriesKey | null) => void;
}

export function AppManagerFilterSidebar<TKey extends string>({
  t,
  open,
  activeFilterCount,
  activeTypeFilter,
  typeFilterOptions,
  items,
  categoryFilter,
  seriesFilter,
  footer,
  onToggle,
  onTypeFilterChange,
  onCategoryChange,
  onSeriesChange,
}: AppManagerFilterSidebarProps<TKey>) {
  return (
    <FilterPanel
      open={open}
      onToggle={onToggle}
      activeFilterCount={activeFilterCount}
      title={t("appManager.filters")}
    >
      <div className="space-y-3">
        {typeFilterOptions.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("appManager.filterBy")}
            </p>
            <div className="flex flex-col gap-1">
              {typeFilterOptions.map((option) => (
                <Badge
                  key={option.key}
                  variant={activeTypeFilter === option.key ? "default" : "outline"}
                  className="cursor-pointer select-none text-xs justify-start"
                  onClick={() => onTypeFilterChange(option.key)}
                >
                  {option.label}
                  {option.count != null && ` (${option.count})`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className={typeFilterOptions.length > 0 ? "pt-2 border-t" : undefined}>
          <CategoryFilter
            apps={items}
            categorySelected={categoryFilter}
            seriesSelected={seriesFilter}
            onCategoryChange={onCategoryChange}
            onSeriesChange={onSeriesChange}
          />
        </div>

        {footer && <div className="pt-2 border-t">{footer}</div>}
      </div>
    </FilterPanel>
  );
}
