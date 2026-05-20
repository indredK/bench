import { type ReactNode } from "react";
import { type ColumnDef, type SortingState, type OnChangeFn } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { VirtualDataTable } from "./VirtualDataTable";
import { VirtualGridView } from "./VirtualGridView";

interface ContentViewProps<T> {
  data: T[];
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  columns: ColumnDef<T>[];
  getRowId: (item: T) => string;
  renderGridCard: (item: T) => ReactNode;
  onItemClick: (item: T) => void;
  renderEmpty?: () => ReactNode;
  loading?: boolean;
  estimatedRowHeight?: number;
  estimatedCardHeight?: number;
  gridColumns?: number;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  selectedId?: string | null;
}

export function ContentView<T>({
  data,
  viewMode,
  columns,
  getRowId,
  renderGridCard,
  onItemClick,
  renderEmpty,
  loading = false,
  estimatedRowHeight,
  estimatedCardHeight,
  gridColumns,
  sorting,
  onSortingChange,
  selectedId,
}: ContentViewProps<T>) {
  if (loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground rounded-xl border bg-card/50">
        <RefreshCw size={28} className="animate-spin text-primary" />
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (!loading && data.length === 0 && renderEmpty) {
    return (
      <div className="h-full">
        {renderEmpty()}
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <VirtualGridView
        data={data}
        getItemId={getRowId}
        renderGridCard={renderGridCard}
        onItemClick={onItemClick}
        estimatedCardHeight={estimatedCardHeight}
        gridColumns={gridColumns}
        selectedId={selectedId}
      />
    );
  }

  return (
    <VirtualDataTable
      data={data}
      columns={columns}
      getRowId={getRowId}
      onItemClick={onItemClick}
      estimatedRowHeight={estimatedRowHeight}
      sorting={sorting}
      onSortingChange={onSortingChange}
      selectedId={selectedId}
    />
  );
}
