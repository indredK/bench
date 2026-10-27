import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

const VIRTUALIZE_AFTER = 64
const ESTIMATED_ROW_HEIGHT = 24
const MAX_LIST_HEIGHT = 256

interface VirtualizedResultListProps<T> {
  items: T[]
  ariaLabel: string
  getItemKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
  className?: string
}

/** Bounded, accessible result list for scans that can return hundreds of rows. */
export function VirtualizedResultList<T>({
  items,
  ariaLabel,
  getItemKey,
  renderItem,
  className,
}: VirtualizedResultListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => {
      const item = items[index]
      return item === undefined ? index : getItemKey(item, index)
    },
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
    initialRect: { width: 640, height: MAX_LIST_HEIGHT },
  })
  const virtualized = items.length > VIRTUALIZE_AFTER

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      className="focus-visible:ring-ring max-h-64 overflow-auto focus-visible:ring-2 focus-visible:outline-none"
      data-virtualized-list={virtualized}
      data-total-count={items.length}
    >
      <ul
        className={className}
        style={
          virtualized
            ? { height: `${virtualizer.getTotalSize()}px`, position: "relative" }
            : undefined
        }
      >
        {virtualized
          ? virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index]
              if (item === undefined) return null
              return (
                <li
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  aria-posinset={virtualRow.index + 1}
                  aria-setsize={items.length}
                  className="absolute top-0 left-0 w-full pb-0.5"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {renderItem(item, virtualRow.index)}
                </li>
              )
            })
          : items.map((item, index) => (
              <li key={getItemKey(item, index)} className="pb-0.5">
                {renderItem(item, index)}
              </li>
            ))}
      </ul>
    </div>
  )
}
