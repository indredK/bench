/**
 * 2000-item virtualized catalog test / 2000 项规模虚拟化测试 (A2-6):
 *   2000 行数据渲染时 DOM 行数有界 (虚拟化), 搜索过滤输入触发重渲染仍保持有界,
 *   用于替代全量渲染导致的 DOM 爆炸。真机交互耗时归 R02 D 类验收。
 */
import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ColumnDef } from "@tanstack/react-table"
import { type BenchTableFeatures } from "@/components/ui/table-features"
import { VirtualDataTable } from "@/components/content/VirtualDataTable"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

interface Row {
  id: string
  name: string
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")

afterEach(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight)
  }
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth)
  }
})

function mockViewport(height = 600) {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => height,
  })
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 1280,
  })
}

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `app-${index}`,
    name: index % 100 === 0 ? `Target ${index}` : `App ${index}`,
  }))
}

const columns: ColumnDef<BenchTableFeatures, Row>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { width: "1fr" },
  },
]

function renderCatalog(data: Row[]) {
  return render(
    <div style={{ height: 600 }}>
      <VirtualDataTable<Row>
        data={data}
        columns={columns}
        getRowId={(item) => item.id}
        onItemClick={() => {}}
        getRowAttributes={(item) => ({ "data-row-id": item.id })}
      />
    </div>,
  )
}

describe("virtualized catalog scale (A2-6)", () => {
  it("keeps 2000 rows bounded to the viewport DOM", () => {
    mockViewport()
    const { container } = renderCatalog(makeRows(2000))

    expect(container.querySelector("[data-virtual-table]")).toHaveAttribute(
      "data-total-count",
      "2000",
    )
    const renderedRows = container.querySelectorAll("[data-row-id]")
    expect(renderedRows.length).toBeGreaterThan(0)
    // 2000 项不得全量渲染: 视口 600px / 48px 行高 + overscan, 远小于 2000。
    expect(renderedRows.length).toBeLessThan(80)
  })

  it("stays bounded and responsive when a search filter narrows the data set", () => {
    mockViewport()
    const all = makeRows(2000)
    const { container, rerender } = renderCatalog(all)
    expect(container.querySelectorAll("[data-row-id]").length).toBeLessThan(80)

    // 模拟搜索输入: 数据集被过滤为匹配项后重渲染。
    const filtered = all.filter((row) => row.name.startsWith("Target"))
    expect(filtered.length).toBe(20)
    rerender(
      <div style={{ height: 600 }}>
        <VirtualDataTable<Row>
          data={filtered}
          columns={columns}
          getRowId={(item) => item.id}
          onItemClick={() => {}}
          getRowAttributes={(item) => ({ "data-row-id": item.id })}
        />
      </div>,
    )
    expect(container.querySelectorAll("[data-row-id]").length).toBe(20)
  })

  it("renders a single row and empty hint at 1/0 scale", () => {
    mockViewport()
    const single = renderCatalog(makeRows(1))
    expect(single.container.querySelectorAll("[data-row-id]").length).toBe(1)
    single.unmount()

    const empty = renderCatalog([])
    expect(empty.container.textContent).toContain("common.empty.noData")
  })
})
