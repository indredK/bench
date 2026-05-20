import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface VirtualGridViewProps<T> {
  data: T[];
  getRowId: (item: T) => string;
  renderGridCard: (item: T) => React.ReactNode;
  onItemClick: (item: T) => void;
  estimatedCardHeight?: number;
  gridColumns?: number;
  selectedId?: string | null;
  batchMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function VirtualGridView<T>({
  data,
  getRowId,
  renderGridCard,
  onItemClick,
  estimatedCardHeight = 180,
  gridColumns: gridColumnsProp,
  selectedId,
  batchMode = false,
  selectedIds,
  onToggleSelect,
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
    <div ref={containerRef} className="h-full overflow-auto">
      <div className="min-h-full rounded-xl border bg-card/50">
        <div
          style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
          className="px-3 py-4"
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
                  gap: "0.5rem",
                  padding: "0.5rem 0 1rem 0",
                }}
              >
                {rowItems.map((item) => {
                  const id = getRowId(item);
                  const isDetailSelected = !batchMode && selectedId != null && id === selectedId;
                  const isBatchSelected = batchMode && selectedIds != null && selectedIds.has(id);

                  const handleClick = () => {
                    if (batchMode && onToggleSelect) {
                      onToggleSelect(id);
                    } else {
                      onItemClick(item);
                    }
                  };

                  return (
                    <div
                      key={id}
                      onClick={handleClick}
                      className={cn(
                        "cursor-pointer transition-all min-w-0",
                        isDetailSelected && "ring-2 ring-primary rounded-lg",
                        isBatchSelected && "ring-2 ring-primary rounded-lg"
                      )}
                    >
                      <div className="relative">
                        {batchMode && (
                          <div className="absolute top-1 right-1 z-10">
                            <div className={cn(
                              "size-4 rounded border-2 flex items-center justify-center transition-colors",
                              isBatchSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/40 bg-background/80"
                            )}>
                              {isBatchSelected && <Check size={10} strokeWidth={3} />}
                            </div>
                          </div>
                        )}
                        {renderGridCard(item)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}