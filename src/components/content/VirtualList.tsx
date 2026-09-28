/**
 * Content UI / 内容 UI: accessible fixed-row list virtualization for long results.
 */
import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { cn } from "@/lib/utils"

interface VirtualListProps<T> {
  items: readonly T[]
  getItemKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
  /** Optional complete text for the native tooltip when a fixed row is truncated. */
  getItemLabel?: (item: T, index: number) => string
  /** Lists at or below this size stay in normal document flow. */
  threshold?: number
  estimateItemHeight?: number
  maxHeight?: number
  className?: string
  itemClassName?: string
}

export function VirtualList<T>({
  items,
  getItemKey,
  renderItem,
  getItemLabel,
  threshold = 50,
  estimateItemHeight = 28,
  maxHeight = 320,
  className,
  itemClassName,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => estimateItemHeight,
    getItemKey: (index) => getItemKey(items[index]!, index),
    overscan: 6,
    initialRect: { width: 640, height: maxHeight },
  })

  if (items.length <= threshold) {
    return (
      <ul
        role="list"
        data-virtual-list
        data-total-count={items.length}
        className={cn("m-0 list-none p-0", className)}
      >
        {items.map((item, index) => (
          <li key={getItemKey(item, index)} role="listitem" className={itemClassName}>
            {renderItem(item, index)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ScrollableArea
      ref={containerRef}
      edgeGlow={false}
      showBottomDot={false}
      className="overflow-auto rounded-lg border"
      style={{ maxHeight }}
      data-virtual-list
      data-virtualized="true"
      data-total-count={items.length}
    >
      <ul
        role="list"
        className={cn("relative m-0 list-none p-0", className)}
        style={{ height: `${virtualizer.getTotalSize() + 8}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]!
          const label = getItemLabel?.(item, virtualItem.index)
          return (
            <li
              key={getItemKey(item, virtualItem.index)}
              role="listitem"
              aria-setsize={items.length}
              aria-posinset={virtualItem.index + 1}
              title={label}
              className={cn(
                "absolute top-0 left-0 flex h-7 w-full items-center overflow-hidden whitespace-nowrap",
                itemClassName,
              )}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <span className="block min-w-0 truncate">{renderItem(item, virtualItem.index)}</span>
            </li>
          )
        })}
      </ul>
    </ScrollableArea>
  )
}
