/**
 * Feature View / 功能视图: shared app catalog shell; 复用应用浏览三栏界面.
 */
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { ColumnDef, OnChangeFn, SortingState } from "@tanstack/react-table"
import { X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DetailPanel } from "@/components/layout/DetailPanel"
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout"
import { ContentView } from "@/components/content/ContentView"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AppCategoryKey } from "@/features/app-manager/app-categories"
import type { AppSeriesKey } from "@/features/app-manager/app-series"
import { AppManagerActionBar } from "@/features/app-manager/components/AppManagerActionBar"
import { AppManagerBatchResults } from "@/features/app-manager/components/AppManagerBatchResults"
import {
  AppManagerFilterSidebar,
  type AppManagerTypeFilterOption,
} from "@/features/app-manager/components/AppManagerFilterSidebar"
import type { CategorizableItem } from "@/features/app-manager/components/CategoryFilter"
import type { BatchOperationResult } from "@/lib/tauri/types/app-manager"

interface AppManagerCatalogViewProps<TItem, TFilter extends string> {
  items: TItem[]
  allItems: CategorizableItem[]
  columns: ColumnDef<TItem>[]
  getRowId: (item: TItem) => string
  renderGridCard: (item: TItem) => ReactNode
  renderDetail: (item: TItem) => ReactNode
  selectedItem: TItem | null
  onItemClick: (item: TItem) => void
  onCloseDetail: () => void
  viewMode: "table" | "grid"
  onViewModeChange: (mode: "table" | "grid") => void
  searchQuery: string
  searchPlaceholder: string
  loading: boolean
  error: string
  loadingSubtitle?: string
  loadingProgress?: number
  loadingTotal?: number | null
  batchResults: BatchOperationResult | null
  onClearError?: () => void
  filterPanelOpen: boolean
  activeFilterCount: number
  typeFilter: TFilter
  typeFilterOptions: AppManagerTypeFilterOption<TFilter>[]
  categoryFilter: AppCategoryKey | null
  seriesFilter: AppSeriesKey | null
  detailTitle: string
  onSearchQueryChange: (query: string) => void
  onScanApps: () => void
  onClearBatchResults: () => void
  onToggleFilterPanel: () => void
  onTypeFilterChange: (filter: TFilter) => void
  onCategoryChange: (category: AppCategoryKey | null) => void
  onSeriesChange: (series: AppSeriesKey | null) => void
  emptyIcon?: ReactNode
  emptyText?: string
  filterFooter?: ReactNode
  estimatedRowHeight?: number
  estimatedCardHeight?: number
  gridColumns?: number
  minCardWidth?: number
  gridGap?: number
  gridRowPadding?: [top: number, bottom: number]
  gridWrapperPadding?: string
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  selectedId?: string | null
  batchMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  showViewToggle?: boolean
  summary?: ReactNode
  actions?: ReactNode
  rightActions?: ReactNode
  getRowAttributes?: (item: TItem) => Record<string, string>
}

export function AppManagerCatalogView<TItem, TFilter extends string>({
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
  loadingSubtitle,
  loadingProgress,
  loadingTotal,
  batchResults,
  onClearError,
  filterPanelOpen,
  activeFilterCount,
  typeFilter,
  typeFilterOptions,
  categoryFilter,
  seriesFilter,
  detailTitle,
  onSearchQueryChange,
  onScanApps,
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
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <AppManagerActionBar
        searchQuery={searchQuery}
        searchPlaceholder={searchPlaceholder}
        loading={loading}
        onSearchQueryChange={onSearchQueryChange}
        onScanApps={onScanApps}
      />

      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            {onClearError ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={onClearError}>
                    <X size={13} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("common.actions.close")}</TooltipContent>
              </Tooltip>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      <AppManagerBatchResults batchResults={batchResults} onClear={onClearBatchResults} />

      <ThreeColumnLayout
        filterOpen={filterPanelOpen}
        detailOpen={!!selectedItem}
        onCloseDetail={onCloseDetail}
        filter={
          <AppManagerFilterSidebar
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
          <div className="flex h-full flex-col gap-3">
            <div className="min-h-0 flex-1">
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
                loadingSubtitle={loadingSubtitle}
                loadingProgress={loadingProgress}
                loadingTotal={loadingTotal}
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
  )
}
