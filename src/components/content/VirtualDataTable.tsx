import { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table";
import type { SortingState, OnChangeFn } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface VirtualDataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (item: T) => string;
  onItemClick: (item: T) => void;
  estimatedRowHeight?: number;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  selectedId?: string | null;
  /** When true, row clicks toggle batch selection instead of opening details */
  batchMode?: boolean;
  /** Set of selected item IDs (for batch mode) */
  selectedIds?: Set<string>;
  /** Called in batch mode when a row is clicked to toggle selection */
  onToggleSelect?: (id: string) => void;
  /** Returns data attributes to attach to each row for context menu delegation */
  getRowAttributes?: (item: T) => Record<string, string>;
}

/**
 * Resolve a human-readable width from column meta into a CSS grid track value.
 * Supports: fixed pixel / rem widths, "auto", "1fr", minmax(…), or undefined.
 */
function resolveGridTrack(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "minmax(120px, 1fr)";
  const m = meta as Record<string, unknown>;

  const width = typeof m.width === "string" ? m.width : undefined;
  const minWidth = typeof m.minWidth === "string" ? m.minWidth : undefined;

  // Explicit width takes priority
  if (width && width !== "auto") return width;

  // If only minWidth is provided, use it as a min constraint with flex
  if (minWidth && minWidth !== "auto") return `minmax(${minWidth}, 1fr)`;

  // Neither specified → flexible column
  return "minmax(100px, 1fr)";
}

/** Width of the dedicated checkbox column in batch mode */
const BATCH_COL_WIDTH = "40px";

export function VirtualDataTable<T>({
  data,
  columns,
  getRowId,
  onItemClick,
  estimatedRowHeight = 48,
  sorting,
  onSortingChange,
  selectedId,
  batchMode = false,
  selectedIds,
  onToggleSelect,
  getRowAttributes,
}: VirtualDataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: sorting != null ? { sorting } : undefined,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const containerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 10,
  });

  // Build grid-template-columns. In batch mode, prepend a narrow checkbox column.
  const gridCols = useMemo(() => {
    const dataCols = columns.map((col) => resolveGridTrack(col.meta)).join(" ");
    return batchMode ? `${BATCH_COL_WIDTH} ${dataCols}` : dataCols;
  }, [columns, batchMode]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground border rounded-xl bg-card/50">
        <p className="text-sm">No items to display</p>
      </div>
    );
  }

  const headerGroup = table.getHeaderGroups()[0];
  if (!headerGroup) return null;

  return (
    <div ref={containerRef} className="h-full overflow-auto rounded-xl border bg-card">
      {/* ---- Sticky Header Row ---- */}
      <div
        className="sticky top-0 z-10 grid border-b bg-card"
        style={{ gridTemplateColumns: gridCols }}
      >
        {batchMode && (
          <div className="px-2 py-2.5 flex items-center justify-center sticky left-0 z-20 bg-card" />
        )}
        {headerGroup.headers.map((header, idx) => {
          const canSort = header.column.getCanSort();
          const isSorted = header.column.getIsSorted();
          const isFirstDataCol = idx === 0;
          const stickyClass = isFirstDataCol
            ? (batchMode ? "sticky left-[40px] z-20 bg-card" : "sticky left-0 z-20 bg-card")
            : "";
          return (
            <div
              key={header.id}
              className={cn(
                "px-3 py-2.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none",
                stickyClass,
                canSort && "cursor-pointer hover:text-foreground transition-colors"
              )}
              onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
            >
              <span className="truncate">
                {flexRender(header.column.columnDef.header, header.getContext())}
              </span>
              {isSorted && (
                <span className="text-[10px] shrink-0 ml-0.5">
                  {isSorted === "asc" ? "▲" : "▼"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Virtualised Body ---- */}
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index] as Row<T>;
          const rowId = getRowId(row.original);
          const isDetailSelected = !batchMode && selectedId != null && rowId === selectedId;
          const isBatchSelected = batchMode && selectedIds != null && selectedIds.has(rowId);

          const handleClick = () => {
            if (batchMode && onToggleSelect) {
              onToggleSelect(rowId);
              onItemClick(row.original);
            } else {
              onItemClick(row.original);
            }
          };

          const rowAttrs = getRowAttributes?.(row.original);

          const rowContent = (
            <div
              {...rowAttrs}
              className={cn(
                "grid absolute top-0 left-0 w-full border-b cursor-pointer hover:bg-muted/50 transition-colors group",
                isDetailSelected && "bg-primary/10 border-l-2 border-l-primary",
                isBatchSelected && "bg-primary/10"
              )}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: gridCols,
              }}
              onClick={handleClick}
            >
              {/* Dedicated checkbox column in batch mode */}
              {batchMode && (
                <div className={cn(
                  "flex items-center justify-center sticky left-0 z-10 bg-card",
                  "group-hover:bg-muted/50",
                  isBatchSelected && "bg-primary/10 group-hover:bg-primary/10"
                )}>
                  <div className={cn(
                    "size-4 rounded border-2 flex items-center justify-center transition-colors",
                    isBatchSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  )}>
                    {isBatchSelected && <Check size={10} strokeWidth={3} />}
                  </div>
                </div>
              )}
              {row.getVisibleCells().map((cell, idx) => {
                const isFirstDataCol = idx === 0;
                const stickyCellClass = isFirstDataCol
                  ? cn(
                      batchMode ? "sticky left-[40px] z-10 bg-card" : "sticky left-0 z-10 bg-card",
                      "group-hover:bg-muted/50",
                      isDetailSelected && "bg-primary/10 group-hover:bg-primary/10",
                      isBatchSelected && "bg-primary/10 group-hover:bg-primary/10"
                    )
                  : "";

                return (
                  <div
                    key={cell.id}
                    className={cn(
                      "px-3 py-2 text-sm flex items-center min-w-0 overflow-hidden",
                      stickyCellClass
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                );
              })}
            </div>
          );

          return <div key={row.id}>{rowContent}</div>;
        })}
      </div>
    </div>
  );
}
