/**
 * Content UI / 内容 UI: own presentation patterns; 只负责内容展示模式.
 */
import { type ReactNode } from "react";
import { type ColumnDef, type SortingState, type OnChangeFn } from "@tanstack/react-table";
import { RefreshCw, Search } from "lucide-react";
import { VirtualDataTable } from "./VirtualDataTable";
import { VirtualGridView } from "./VirtualGridView";
import { ViewToggle } from "./ViewToggle";

interface ContentViewProps<T> {
  data: T[];
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  columns: ColumnDef<T>[];
  getRowId: (item: T) => string;
  renderGridCard: (item: T) => ReactNode;
  onItemClick: (item: T) => void;
  /** Empty-state content (icon + text), placed inside a standardised container */
  emptyIcon?: ReactNode;
  emptyText?: string;
  loading?: boolean;
  estimatedRowHeight?: number;
  estimatedCardHeight?: number;
  gridColumns?: number;
  minCardWidth?: number;
  /** Gap between grid items in pixels (default: 8) */
  gridGap?: number;
  /** Vertical padding per row in pixels: [top, bottom] (default: [4, 8]) */
  gridRowPadding?: [top: number, bottom: number];
  /** Padding on the outer scrollable wrapper (Tailwind class, default: "px-2 py-2") */
  gridWrapperPadding?: string;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  selectedId?: string | null;
  batchMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** When true, shows a ViewToggle at the top-right of the content area */
  showViewToggle?: boolean;
  /** Summary text rendered on the left side of the header row */
  summary?: ReactNode;
  /** Optional actions slot rendered to the left of the view toggle */
  actions?: ReactNode;
  /** Optional actions slot rendered to the right of summary/actions, before the view toggle */
  rightActions?: ReactNode;
  /** Returns data attributes to attach to each row/card for context menu delegation */
  getRowAttributes?: (item: T) => Record<string, string>;
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
  // Initial load with no data — show full-screen loader
  if (loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground rounded-xl border bg-card/50">
        <RefreshCw size={28} className="animate-spin text-primary" />
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  // No data and not loading — show empty state with standardised container
  if (!loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground rounded-xl border bg-card/50 gap-2">
        {emptyIcon ?? <Search size={32} className="opacity-30" />}
        <p>{emptyText ?? "No items to display"}</p>
      </div>
    );
  }

  const body = viewMode === "grid" ? (
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
  );

  const showHeader = showViewToggle || Boolean(summary) || Boolean(actions);
  const content = showHeader ? (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
            {actions}
          </div>
          <div className="flex items-center gap-2">
            {rightActions}
            {showViewToggle && <ViewToggle viewMode={viewMode} onChange={onViewModeChange} />}
          </div>
        </div>
      <div className="flex-1 min-h-0">{body}</div>
    </div>
  ) : body;

  if (!loading) return <div className="h-full">{content}</div>;

  return (
    <div className="h-full relative">
      {content}
      <div className="absolute inset-0 bg-background/40 flex items-center justify-center rounded-xl pointer-events-none">
        <RefreshCw size={28} className="animate-spin text-primary" />
      </div>
    </div>
  );
}
