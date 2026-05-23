/**
 * Feature View / 功能视图: shared app catalog shell; 复用应用浏览三栏界面.
 */
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import type { ColumnDef, OnChangeFn, SortingState } from "@tanstack/react-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DetailPanel } from "@/components/layout/DetailPanel";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { ContentView } from "@/components/content/ContentView";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import { AppManagerActionBar } from "@/features/app-manager/components/AppManagerActionBar";
import { AppManagerBatchResults } from "@/features/app-manager/components/AppManagerBatchResults";
import {
  AppManagerFilterSidebar,
  type AppManagerTypeFilterOption,
} from "@/features/app-manager/components/AppManagerFilterSidebar";
import type { CategorizableItem } from "@/features/app-manager/CategoryFilter";
import type { BatchOperationResult } from "@/lib/tauri/types/app-manager";

interface AppManagerCatalogViewProps<TItem, TFilter extends string> {
  t: TFunction;
  items: TItem[];
  allItems: CategorizableItem[];
  columns: ColumnDef<TItem>[];
  getRowId: (item: TItem) => string;
  renderGridCard: (item: TItem) => ReactNode;
  renderDetail: (item: TItem) => ReactNode;
  selectedItem: TItem | null;
  onItemClick: (item: TItem) => void;
  onCloseDetail: () => void;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  searchQuery: string;
  searchPlaceholder: string;
  loading: boolean;
  error: string;
  historyOpen: boolean;
  batchResults: BatchOperationResult | null;
  filterPanelOpen: boolean;
  activeFilterCount: number;
  typeFilter: TFilter;
  typeFilterOptions: AppManagerTypeFilterOption<TFilter>[];
  categoryFilter: AppCategoryKey | null;
  seriesFilter: AppSeriesKey | null;
  detailTitle: string;
  onSearchQueryChange: (query: string) => void;
  onScanApps: () => void;
  onToggleHistory: () => void;
  onClearBatchResults: () => void;
  onToggleFilterPanel: () => void;
  onTypeFilterChange: (filter: TFilter) => void;
  onCategoryChange: (category: AppCategoryKey | null) => void;
  onSeriesChange: (series: AppSeriesKey | null) => void;
  emptyIcon?: ReactNode;
  emptyText?: string;
  filterFooter?: ReactNode;
  estimatedRowHeight?: number;
  estimatedCardHeight?: number;
  gridColumns?: number;
  minCardWidth?: number;
  gridGap?: number;
  gridRowPadding?: [top: number, bottom: number];
  gridWrapperPadding?: string;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  selectedId?: string | null;
  batchMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  showViewToggle?: boolean;
  summary?: ReactNode;
  actions?: ReactNode;
  rightActions?: ReactNode;
  getRowAttributes?: (item: TItem) => Record<string, string>;
}

export function AppManagerCatalogView<TItem, TFilter extends string>({
  t,
  items,
  allItems,
  columns,
  getRowId,
  renderGridCard,
  renderDetail,
  selectedItem,
  onItemClick,
  onCloseDetail,
  viewMode,
  onViewModeChange,
  searchQuery,
  searchPlaceholder,
  loading,
  error,
  historyOpen,
  batchResults,
  filterPanelOpen,
  activeFilterCount,
  typeFilter,
  typeFilterOptions,
  categoryFilter,
  seriesFilter,
  detailTitle,
  onSearchQueryChange,
  onScanApps,
  onToggleHistory,
  onClearBatchResults,
  onToggleFilterPanel,
  onTypeFilterChange,
  onCategoryChange,
  onSeriesChange,
  emptyIcon,
  emptyText,
  filterFooter,
  estimatedRowHeight,
  estimatedCardHeight,
  gridColumns,
  minCardWidth,
  gridGap,
  gridRowPadding,
  gridWrapperPadding,
  sorting,
  onSortingChange,
  selectedId,
  batchMode = false,
  selectedIds,
  onToggleSelect,
  showViewToggle = true,
  summary,
  actions,
  rightActions,
  getRowAttributes,
}: AppManagerCatalogViewProps<TItem, TFilter>) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <AppManagerActionBar
        t={t}
        searchQuery={searchQuery}
        searchPlaceholder={searchPlaceholder}
        loading={loading}
        historyOpen={historyOpen}
        onSearchQueryChange={onSearchQueryChange}
        onScanApps={onScanApps}
        onToggleHistory={onToggleHistory}
      />

      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <AppManagerBatchResults
        t={t}
        batchResults={batchResults}
        onClear={onClearBatchResults}
      />

      <ThreeColumnLayout
        filterOpen={filterPanelOpen}
        detailOpen={!!selectedItem}
        onCloseDetail={onCloseDetail}
        filter={
          <AppManagerFilterSidebar
            t={t}
            open={filterPanelOpen}
            activeFilterCount={activeFilterCount}
            activeTypeFilter={typeFilter}
            typeFilterOptions={typeFilterOptions}
            items={allItems}
            categoryFilter={categoryFilter}
            seriesFilter={seriesFilter}
            footer={filterFooter}
            onToggle={onToggleFilterPanel}
            onTypeFilterChange={onTypeFilterChange}
            onCategoryChange={onCategoryChange}
            onSeriesChange={onSeriesChange}
          />
        }
        content={
          <div className="h-full flex flex-col gap-3">
            <div className="flex-1 min-h-0">
              <ContentView<TItem>
                data={items}
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                columns={columns}
                getRowId={getRowId}
                renderGridCard={renderGridCard}
                onItemClick={onItemClick}
                emptyIcon={emptyIcon}
                emptyText={emptyText}
                loading={loading}
                estimatedRowHeight={estimatedRowHeight}
                estimatedCardHeight={estimatedCardHeight}
                gridColumns={gridColumns}
                minCardWidth={minCardWidth}
                gridGap={gridGap}
                gridRowPadding={gridRowPadding}
                gridWrapperPadding={gridWrapperPadding}
                sorting={sorting}
                onSortingChange={onSortingChange}
                selectedId={selectedId}
                batchMode={batchMode}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                showViewToggle={showViewToggle}
                summary={summary}
                actions={actions}
                rightActions={rightActions}
                getRowAttributes={getRowAttributes}
              />
            </div>
          </div>
        }
        detail={
          <DetailPanel<TItem>
            item={selectedItem}
            open={!!selectedItem}
            onClose={onCloseDetail}
            title={detailTitle}
            renderDetail={renderDetail}
          />
        }
      />
    </div>
  );
}
