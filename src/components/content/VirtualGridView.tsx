/**
 * Content UI / 内容 UI: own presentation patterns; 只负责内容展示模式.
 */
import { useEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface VirtualGridViewProps<T> {
  data: T[]
  getRowId: (item: T) => string
  renderGridCard: (item: T) => React.ReactNode
  onItemClick: (item: T) => void
  estimatedCardHeight?: number
  gridColumns?: number
  minCardWidth?: number
  /** Gap between grid items in pixels (default: 8) */
  gap?: number
  /** Vertical padding per row in pixels: [top, bottom] (default: [4, 8]) */
  rowPadding?: [top: number, bottom: number]
  /** Padding on the outer scrollable wrapper (Tailwind class, default: "px-2 py-2") */
  wrapperPadding?: string
  selectedId?: string | null
  batchMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  /** Returns data attributes to attach to each grid card for context menu delegation */
  getRowAttributes?: (item: T) => Record<string, string>
}

export function VirtualGridView<T>({
  data,
  getRowId,
  renderGridCard,
  onItemClick,
  estimatedCardHeight = 130,
  gridColumns: gridColumnsProp,
  minCardWidth = 240,
  gap = 8,
  rowPadding = [4, 8],
  wrapperPadding = "px-2 py-2",
  selectedId,
  batchMode = false,
  selectedIds,
  onToggleSelect,
  getRowAttributes,
}: VirtualGridViewProps<T>) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const gridGap = gap
  const maxColumns = Math.max(1, gridColumnsProp ?? 3)
  const [containerWidth, setContainerWidth] = useState(0)
  const displayColumns =
    containerWidth > 0
      ? Math.min(
          maxColumns,
          Math.max(1, Math.floor((containerWidth + gridGap) / (minCardWidth + gridGap))),
        )
      : maxColumns
  const minGridWidth = displayColumns * minCardWidth + Math.max(displayColumns - 1, 0) * gridGap
  const rowCount = Math.ceil(data.length / displayColumns)

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.clientWidth
      setContainerWidth(width)
    })

    setContainerWidth(container.clientWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => estimatedCardHeight,
    overscan: 2,
  })

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground bg-card/50 flex h-full flex-col items-center justify-center rounded-xl border">
        <p className="text-sm">{t("common.empty.noData")}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto" data-table-scroll>
      <div
        className={cn("bg-card/50 min-h-full rounded-xl border", wrapperPadding)}
        style={{ minWidth: `${minGridWidth}px` }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            minWidth: `${minGridWidth}px`,
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowIndex = virtualRow.index
            const startIdx = rowIndex * displayColumns
            const rowItems = data.slice(startIdx, startIdx + displayColumns)

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
                  gridTemplateColumns: `repeat(${displayColumns}, minmax(${minCardWidth}px, 1fr))`,
                  gap: `${gridGap}px`,
                  padding: `${rowPadding[0] / 4}rem 0 ${rowPadding[1] / 4}rem 0`,
                }}
              >
                {rowItems.map((item) => {
                  const id = getRowId(item)
                  const isDetailSelected = !batchMode && selectedId != null && id === selectedId
                  const isBatchSelected = batchMode && selectedIds != null && selectedIds.has(id)

                  const handleClick = () => {
                    if (batchMode && onToggleSelect) {
                      onToggleSelect(id)
                    } else {
                      onItemClick(item)
                    }
                  }

                  const rowAttrs = getRowAttributes?.(item)

                  const cardContent = (
                    <div
                      {...rowAttrs}
                      onClick={handleClick}
                      className={cn(
                        "h-full min-w-0 cursor-pointer transition-all",
                        isDetailSelected && "ring-primary rounded-lg ring-2",
                        isBatchSelected && "ring-primary rounded-lg ring-2",
                      )}
                    >
                      <div className="relative h-full">{renderGridCard(item)}</div>
                    </div>
                  )

                  return (
                    <div key={id} className="h-full">
                      {cardContent}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
