import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { cn } from "@/lib/utils"

const VIRTUALIZE_AFTER = 50
const ESTIMATED_ROW_HEIGHT = 28
const VIEWPORT_HEIGHT = 320

interface VirtualizedResultListProps<T> {
  items: T[]
  ariaLabel: string
  dataList: string
  getItemKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  itemClassName?: string
}

/** Render short results normally and virtualize large, fixed-height result rows. */
export function VirtualizedResultList<T>({
  items,
  ariaLabel,
  dataList,
  getItemKey,
  renderItem,
  className,
  itemClassName,
}: VirtualizedResultListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualized = items.length >= VIRTUALIZE_AFTER
  const virtualizer = useVirtualizer({
    count: virtualized ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => {
      const item = items[index]
      return item == null ? index : getItemKey(item, index)
    },
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 800, height: VIEWPORT_HEIGHT },
  })

  if (!virtualized) {
    return (
      <ul
        aria-label={ariaLabel}
        className={cn("min-w-0", className)}
        data-network-probe-list={dataList}
        data-virtualized="false"
        data-total-count={items.length}
      >
        {items.map((item, index) => (
          <li key={getItemKey(item, index)} className={itemClassName}>
            {renderItem(item, index)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ScrollableArea
      ref={scrollRef}
      aria-label={ariaLabel}
      role="list"
      tabIndex={0}
      className={cn(
        "focus-visible:ring-ring max-h-80 rounded-md border px-2 focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      data-network-probe-list={dataList}
      data-virtualized="true"
      data-total-count={items.length}
    >
      <div
        role="presentation"
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          if (item == null) return null
          return (
            <div
              key={getItemKey(item, virtualRow.index)}
              role="listitem"
              aria-posinset={virtualRow.index + 1}
              aria-setsize={items.length}
              className={cn("absolute top-0 left-0 w-full", itemClassName)}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          )
        })}
      </div>
    </ScrollableArea>
  )
}
