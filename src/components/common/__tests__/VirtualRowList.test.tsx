/**
 * Test / 测试: 校验 VirtualRowList 的 windowing 接线（复用既有 useVirtualizer，仅 mock 之，
 * 断言只渲染虚拟窗口内的行、总高占位与 data-total-count）。
 */
import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { VirtualRowList } from "../VirtualRowList"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 24000,
    getVirtualItems: () => [
      { index: 0, size: 24, start: 0 },
      { index: 1, size: 24, start: 24 },
    ],
    measureElement: () => {},
  }),
}))

interface Row {
  id: string
  label: string
}

const rows: Row[] = Array.from({ length: 1000 }, (_, i) => ({
  id: String(i),
  label: `row-${i}`,
}))

describe("VirtualRowList", () => {
  it("renders only the virtualizer's window and reports total count + spacer height", () => {
    const { container } = render(
      <VirtualRowList
        items={rows}
        getItemKey={(r) => r.id}
        renderItem={(r) => <div data-row>{r.label}</div>}
      />,
    )
    const scroller = container.querySelector("[data-virtual-row-list]")
    expect(scroller).not.toBeNull()
    expect(scroller).toHaveAttribute("data-total-count", "1000")
    // 1000 项里只渲染虚拟窗口返回的 2 行。
    const rendered = container.querySelectorAll("[data-row]")
    expect(rendered).toHaveLength(2)
    expect(rendered[0]).toHaveTextContent("row-0")
    expect(rendered[1]).toHaveTextContent("row-1")
    // 总高占位撑出滚动区间。
    const spacer = scroller?.firstElementChild as HTMLElement
    expect(spacer.style.height).toBe("24000px")
  })
})
