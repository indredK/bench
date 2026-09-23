/**
 * VirtualRowList / 行虚拟化列表: 自包含滚动的垂直虚拟列表.
 *
 * 用于可能上千行的只读结果列表（如端口扫描）。自带 maxHeight 滚动容器，不依赖父级
 * 撑高度（避免 dev-toolbox 记录过的「双 h-full 塌陷」坑）；用 measureElement 动态测量
 * 行高，因此换行的长行也不会重叠。复用仓内既有 @tanstack/react-virtual（VirtualGridView
 * 已在用），只验证 windowing 接线正确。
 */
import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

interface VirtualRowListProps<T> {
  items: T[]
  getItemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => React.ReactNode
  /** 首帧行高估计；实际高度由 measureElement 校正。 */
  estimatedRowHeight?: number
  maxHeight?: number | string
  overscan?: number
  className?: string
}

export function VirtualRowList<T>({
  items,
  getItemKey,
  renderItem,
  estimatedRowHeight = 24,
  maxHeight = "60vh",
  overscan = 10,
  className,
}: VirtualRowListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  })

  const totalSize = virtualizer.getTotalSize()

  return (
    <div
      ref={parentRef}
      data-virtual-row-list
      data-total-count={items.length}
      className={className}
      style={{ maxHeight, overflowY: "auto" }}
    >
      <div style={{ height: totalSize, width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          return (
            <div
              key={getItemKey(item, virtualRow.index)}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
