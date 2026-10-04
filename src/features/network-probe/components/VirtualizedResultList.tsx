/**
 * Feature UI / 功能界面: accessible long-result list using the shared TanStack virtualizer.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"

export const VIRTUALIZED_RESULT_THRESHOLD = 50

interface VirtualizedResultListProps<T> {
  items: T[]
  ariaLabel: string
  getItemKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  estimateRowHeight?: number
  followTail?: boolean
}

export function VirtualizedResultList<T>({
  items,
  ariaLabel,
  getItemKey,
  renderItem,
  className,
  estimateRowHeight = 28,
  followTail = false,
}: VirtualizedResultListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const followTailRef = useRef(true)
  const shouldVirtualize = items.length > VIRTUALIZED_RESULT_THRESHOLD
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    getItemKey: (index) => getItemKey(items[index]!, index),
    overscan: 8,
    initialRect: { width: 800, height: 320 },
  })

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current
    if (!shouldVirtualize || !followTail || !followTailRef.current || !scrollElement) return
    scrollElement.scrollTop = scrollElement.scrollHeight
  }, [followTail, items.length, shouldVirtualize])

  const rows = shouldVirtualize
    ? virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index]!
        return (
          <li
            key={getItemKey(item, virtualItem.index)}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            role="listitem"
            aria-posinset={virtualItem.index + 1}
            aria-setsize={items.length}
            className="absolute top-0 left-0 w-full py-0.5 leading-5"
            style={{
              minHeight: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(item, virtualItem.index)}
          </li>
        )
      })
    : items.map((item, index) => (
        <li
          key={getItemKey(item, index)}
          role="listitem"
          aria-posinset={index + 1}
          aria-setsize={items.length}
          className="py-0.5 leading-5"
        >
          {renderItem(item, index)}
        </li>
      ))

  return (
    <div
      ref={scrollRef}
      role={shouldVirtualize ? "region" : undefined}
      aria-label={shouldVirtualize ? ariaLabel : undefined}
      tabIndex={shouldVirtualize ? 0 : undefined}
      data-total-count={items.length}
      data-virtualized={shouldVirtualize ? "true" : "false"}
      onScroll={() => {
        const scrollElement = scrollRef.current
        if (!scrollElement) return
        const remaining =
          scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop
        followTailRef.current = remaining <= 24
      }}
      className={cn(
        "min-w-0",
        shouldVirtualize &&
          "focus-visible:ring-ring max-h-80 overflow-y-auto overscroll-contain rounded-md border p-2 focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      <ul
        role="list"
        className={cn("m-0 min-w-0 list-none p-0", className)}
        style={
          shouldVirtualize
            ? { height: `${virtualizer.getTotalSize()}px`, position: "relative" }
            : undefined
        }
      >
        {rows}
      </ul>
    </div>
  )
}
