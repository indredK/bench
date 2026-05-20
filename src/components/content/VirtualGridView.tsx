import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

interface VirtualGridViewProps<T> {
  data: T[];
  getItemId: (item: T) => string;
  renderGridCard: (item: T) => React.ReactNode;
  onItemClick: (item: T) => void;
  estimatedCardHeight?: number;
  gridColumns?: number;
  selectedId?: string | null;
}

export function VirtualGridView<T>({
  data,
  getItemId,
  renderGridCard,
  onItemClick,
  estimatedCardHeight = 180,
  gridColumns: gridColumnsProp,
  selectedId,
}: VirtualGridViewProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayColumns = gridColumnsProp ?? 3;
  const rowCount = Math.ceil(data.length / displayColumns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => estimatedCardHeight,
    overscan: 2,
  });

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground border rounded-xl bg-card/50">
        <p className="text-sm">No items to display</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto rounded-xl border bg-card/50">
      <div
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
        className="p-4"
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowIndex = virtualRow.index;
          const startIdx = rowIndex * displayColumns;
          const rowItems = data.slice(startIdx, startIdx + displayColumns);

          return (
            <div
              key={rowIndex}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${displayColumns}, 1fr)`,
                gap: "0.75rem",
                padding: "0 0 0.75rem 0",
              }}
            >
              {rowItems.map((item) => {
                const id = getItemId(item);
                const isSelected = selectedId != null && id === selectedId;
                return (
                  <div
                    key={id}
                    onClick={() => onItemClick(item)}
                    className={cn(
                      "cursor-pointer transition-all",
                      isSelected && "ring-2 ring-primary rounded-lg"
                    )}
                  >
                    {renderGridCard(item)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
