/**
 * Content UI / 内容 UI: own presentation patterns; 只负责内容展示模式.
 */
import { type ReactNode } from "react"
import { type ColumnDef, type SortingState, type OnChangeFn } from "@tanstack/react-table"
import { AnimatePresence, motion } from "motion/react"
import { RefreshCw, Search } from "lucide-react"
import { useTranslation } from "react-i18next"
import { VirtualDataTable } from "./VirtualDataTable"
import { VirtualGridView } from "./VirtualGridView"
import { ViewToggle } from "./ViewToggle"

interface ContentViewProps<T> {
  data: T[]
  viewMode: "table" | "grid"
  onViewModeChange: (mode: "table" | "grid") => void
  columns: ColumnDef<T>[]
  getRowId: (item: T) => string
  renderGridCard: (item: T) => ReactNode
  onItemClick: (item: T) => void
  /** Empty-state content (icon + text), placed inside a standardised container */
  emptyIcon?: ReactNode
  emptyText?: string
  loading?: boolean
  /** Optional text shown below the loading spinner */
  loadingSubtitle?: string
  /** Optional numeric progress value (0-N) shown in the loading state */
  loadingProgress?: number
  estimatedRowHeight?: number
  estimatedCardHeight?: number
  gridColumns?: number
  minCardWidth?: number
  /** Gap between grid items in pixels (default: 8) */
  gridGap?: number
  /** Vertical padding per row in pixels: [top, bottom] (default: [4, 8]) */
  gridRowPadding?: [top: number, bottom: number]
  /** Padding on the outer scrollable wrapper (Tailwind class, default: "px-2 py-2") */
  gridWrapperPadding?: string
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  selectedId?: string | null
  batchMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  /** When true, shows a ViewToggle at the top-right of the content area */
  showViewToggle?: boolean
  /** Summary text rendered on the left side of the header row */
  summary?: ReactNode
  /** Optional actions slot rendered to the left of the view toggle */
  actions?: ReactNode
  /** Optional actions slot rendered to the right of summary/actions, before the view toggle */
  rightActions?: ReactNode
  /** Returns data attributes to attach to each row/card for context menu delegation */
  getRowAttributes?: (item: T) => Record<string, string>
}

export function ContentView<T>({
  data,
  viewMode,
  onViewModeChange,
  columns,
  getRowId,
  renderGridCard,
  onItemClick,
  emptyIcon,
  emptyText,
  loading = false,
  loadingSubtitle,
  loadingProgress,
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
}: ContentViewProps<T>) {
  const { t } = useTranslation()

  // Initial load with no data — show full-screen loader
  if (loading && data.length === 0) {
    return (
      <div className="text-muted-foreground bg-card/50 flex h-full flex-col items-center justify-center gap-3 rounded-xl border">
        <RefreshCw size={28} className="text-primary animate-spin" />
        <p className="text-foreground text-sm font-medium">{t("common.loading")}</p>
        {(loadingSubtitle || loadingProgress !== undefined) && (
          <div className="w-48">
            {loadingProgress !== undefined && loadingProgress > 0 && (
              <div className="bg-muted mb-2 h-1 w-full overflow-hidden rounded-full">
                <motion.div
                  className="bg-primary/60 h-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${Math.min(100, Math.max(5, loadingProgress / 3))}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
            )}
            {(loadingSubtitle || loadingProgress !== undefined) && (
              <p className="text-muted-foreground/80 text-center text-[11px]">
                {loadingSubtitle}
                {loadingProgress !== undefined && loadingProgress > 0 && (
                  <span className="tabular-nums"> · {loadingProgress}</span>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // No data and not loading — show empty state with standardised container
  if (!loading && data.length === 0) {
    return (
      <div className="text-muted-foreground bg-card/50 flex h-full flex-col items-center justify-center gap-2 rounded-xl border">
        {emptyIcon ?? <Search size={32} className="opacity-30" />}
        <p>{emptyText ?? t("common.empty.noData")}</p>
      </div>
    )
  }

  const body =
    viewMode === "grid" ? (
      <VirtualGridView
        data={data}
        getRowId={getRowId}
        renderGridCard={renderGridCard}
        onItemClick={onItemClick}
        estimatedCardHeight={estimatedCardHeight}
        gridColumns={gridColumns}
        minCardWidth={minCardWidth}
        gap={gridGap}
        rowPadding={gridRowPadding}
        wrapperPadding={gridWrapperPadding}
        selectedId={selectedId}
        batchMode={batchMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        getRowAttributes={getRowAttributes}
      />
    ) : (
      <VirtualDataTable
        data={data}
        columns={columns}
        getRowId={getRowId}
        onItemClick={onItemClick}
        estimatedRowHeight={estimatedRowHeight}
        sorting={sorting}
        onSortingChange={onSortingChange}
        selectedId={selectedId}
        batchMode={batchMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        getRowAttributes={getRowAttributes}
      />
    )

  const showHeader = showViewToggle || Boolean(summary) || Boolean(actions) || Boolean(rightActions)
  const content = showHeader ? (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          {actions}
          {summary && <span className="text-muted-foreground text-sm">{summary}</span>}
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {rightActions && (
              <motion.div
                key="right-actions"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                {rightActions}
              </motion.div>
            )}
          </AnimatePresence>
          {showViewToggle && <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />}
        </div>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  ) : (
    body
  )

  if (!loading) return <div className="h-full">{content}</div>

  return (
    <div className="relative h-full">
      {content}
      <div className="bg-background/40 pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl">
        <RefreshCw size={28} className="text-primary animate-spin" />
      </div>
    </div>
  )
}
