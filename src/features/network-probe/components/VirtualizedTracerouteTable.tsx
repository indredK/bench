/**
 * Feature UI / 功能界面: accessible traceroute table with bounded rendering for long paths.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { TracerouteHop } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"
import { VIRTUALIZED_RESULT_THRESHOLD } from "./VirtualizedResultList"

interface VirtualizedTracerouteTableProps {
  hops: TracerouteHop[]
  ariaLabel: string
  columnLabels: string[]
  renderCells: (hop: TracerouteHop) => ReactNode[]
  followTail?: boolean
}

const GRID_COLUMNS = "4rem minmax(12rem,1.6fr) minmax(10rem,1.2fr) repeat(4,minmax(5rem,.7fr))"

export function VirtualizedTracerouteTable({
  hops,
  ariaLabel,
  columnLabels,
  renderCells,
  followTail = false,
}: VirtualizedTracerouteTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const followTailRef = useRef(true)
  const shouldVirtualize = hops.length > VIRTUALIZED_RESULT_THRESHOLD
  const virtualizer = useVirtualizer({
    count: hops.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    getItemKey: (index) => hops[index]!.ttl,
    overscan: 8,
    initialRect: { width: 800, height: 320 },
  })
  useLayoutEffect(() => {
    const scrollElement = scrollRef.current
    if (!shouldVirtualize || !followTail || !followTailRef.current || !scrollElement) return
    scrollElement.scrollTop = scrollElement.scrollHeight
  }, [followTail, hops.length, shouldVirtualize])

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : []
  const renderedHops = shouldVirtualize
    ? virtualItems.map((virtualItem) => ({ hop: hops[virtualItem.index]!, virtualItem }))
    : hops.map((hop) => ({ hop, virtualItem: undefined }))

  return (
    <div
      ref={scrollRef}
      role={shouldVirtualize ? "region" : undefined}
      aria-label={shouldVirtualize ? ariaLabel : undefined}
      tabIndex={shouldVirtualize ? 0 : undefined}
      data-total-count={hops.length}
      data-virtualized={shouldVirtualize ? "true" : "false"}
      onScroll={() => {
        const scrollElement = scrollRef.current
        if (!scrollElement) return
        const remaining =
          scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop
        followTailRef.current = remaining <= 24
      }}
      className={cn(
        "min-w-0 rounded-lg border",
        shouldVirtualize ? "max-h-80 overflow-auto overscroll-contain" : "overflow-x-auto",
        shouldVirtualize &&
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      <div
        role="table"
        aria-rowcount={hops.length + 1}
        aria-colcount={columnLabels.length}
        className="min-w-[46rem] text-left text-sm"
      >
        <div role="rowgroup">
          <div
            role="row"
            aria-rowindex={1}
            className="bg-muted/50 text-muted-foreground sticky top-0 z-10 grid border-b text-xs"
            style={{ gridTemplateColumns: GRID_COLUMNS }}
          >
            {columnLabels.map((label, index) => (
              <div
                key={`${index}-${label}`}
                role="columnheader"
                aria-colindex={index + 1}
                className="min-w-0 px-2 py-1.5 font-medium"
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        <div
          role="rowgroup"
          style={
            shouldVirtualize
              ? { height: `${virtualizer.getTotalSize()}px`, position: "relative" }
              : undefined
          }
        >
          {renderedHops.map(({ hop, virtualItem }, index) => {
            const rowIndex = virtualItem?.index ?? index
            const cells = renderCells(hop)
            return (
              <div
                key={hop.ttl}
                ref={virtualItem ? virtualizer.measureElement : undefined}
                data-index={virtualItem?.index}
                role="row"
                aria-rowindex={rowIndex + 2}
                className="grid min-h-9 items-center border-t"
                style={{
                  gridTemplateColumns: GRID_COLUMNS,
                  ...(virtualItem
                    ? {
                        height: `${virtualItem.size}px`,
                        position: "absolute" as const,
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }
                    : {}),
                }}
              >
                {cells.map((cell, cellIndex) => (
                  <div
                    key={cellIndex}
                    role="cell"
                    aria-colindex={cellIndex + 1}
                    className="min-w-0 overflow-hidden px-2 py-1.5"
                  >
                    {cell}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
