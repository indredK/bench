import type { ReactNode } from "react"
import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"

interface VirtualizedResultListProps<T> {
  items: T[]
  getKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
  ariaLabel: string
  ariaBusy?: boolean
  className?: string
  itemClassName?: string
  threshold?: number
  estimatedItemHeight?: number
}

/** Keep ordinary result lists simple and bound DOM work for large discoveries. */
export function VirtualizedResultList<T>({
  items,
  getKey,
  renderItem,
  ariaLabel,
  ariaBusy = false,
  className,
  itemClassName,
  threshold = 80,
  estimatedItemHeight = 32,
}: VirtualizedResultListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedItemHeight,
    getItemKey: (index) => getKey(items[index]!, index),
    overscan: 8,
    initialRect: { width: 960, height: 288 },
  })

  if (items.length < threshold) {
    return (
      <ul className={className} aria-label={ariaLabel} aria-busy={ariaBusy}>
        {items.map((item, index) => (
          <li key={getKey(item, index)} className={itemClassName}>
            {renderItem(item, index)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div
      ref={scrollRef}
      role="list"
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      tabIndex={0}
      data-virtual-result-list
      data-total-count={items.length}
      className={cn("max-h-72 overflow-auto rounded-md", className)}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (item == null) return null
          const key = getKey(item, virtualItem.index)
          return (
            <div
              key={key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              role="listitem"
              aria-posinset={virtualItem.index + 1}
              aria-setsize={items.length}
              className={cn("absolute top-0 left-0 w-full", itemClassName)}
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
