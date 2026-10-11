import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"

interface VirtualizedResultListProps<T> {
  ariaLabel: string
  items: T[]
  getItemKey: (item: T, index: number) => string | number
  estimateSize?: number
  listClassName?: string
  renderItem: (item: T, index: number) => ReactNode
}

const VIRTUALIZATION_THRESHOLD = 50

export function VirtualizedResultList<T>({
  ariaLabel,
  items,
  getItemKey,
  estimateSize = 32,
  listClassName = "space-y-1 font-mono text-xs",
  renderItem,
}: VirtualizedResultListProps<T>) {
  const isVirtualized = items.length > VIRTUALIZATION_THRESHOLD
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: isVirtualized ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => {
      const item = items[index]
      return item === undefined ? index : getItemKey(item, index)
    },
    estimateSize: () => estimateSize,
    overscan: 6,
    initialRect: { width: 640, height: 288 },
  })
  const totalSize = virtualizer.getTotalSize()

  if (!isVirtualized) {
    return (
      <ul aria-label={ariaLabel} className={listClassName}>
        {items.map((item, index) => (
          <li key={getItemKey(item, index)} aria-posinset={index + 1} aria-setsize={items.length}>
            {renderItem(item, index)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      className="max-h-72 overflow-x-hidden overflow-y-auto rounded-md border"
      style={{ height: `${Math.min(totalSize, 288)}px` }}
      data-virtualized-result-list
    >
      <ul className={cn("relative", listClassName)} style={{ height: `${totalSize}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (item === undefined) return null

          return (
            <li
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              role="listitem"
              aria-posinset={virtualItem.index + 1}
              aria-setsize={items.length}
              className="absolute top-0 left-0 w-full px-2 py-1.5 break-words"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {renderItem(item, virtualItem.index)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
