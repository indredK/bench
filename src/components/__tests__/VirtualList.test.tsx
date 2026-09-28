/**
 * Test / 测试: verify accessible list virtualization behavior.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { VirtualList } from "../content/VirtualList"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({
        index,
        size: estimateSize(),
        start: index * estimateSize(),
      })),
  }),
}))

vi.mock("@/components/common/ScrollableArea", () => ({
  ScrollableArea: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
}))

interface Row {
  id: string
  label: string
}

function createRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    label: `Result ${index}`,
  }))
}

describe("VirtualList", () => {
  it("keeps short lists in normal flow", () => {
    render(
      <VirtualList
        items={createRows(50)}
        getItemKey={(row) => row.id}
        renderItem={(row) => row.label}
      />,
    )

    expect(screen.getByRole("list")).toHaveAttribute("data-total-count", "50")
    expect(screen.getAllByRole("listitem")).toHaveLength(50)
    expect(screen.getByText("Result 49")).toBeInTheDocument()
    expect(screen.getByRole("list")).not.toHaveAttribute("data-virtualized", "true")
  })

  it("limits long lists to visible rows and preserves each row's position", () => {
    const { container } = render(
      <VirtualList
        items={createRows(200)}
        getItemKey={(row) => row.id}
        getItemLabel={(row) => row.label}
        renderItem={(row) => row.label}
      />,
    )

    const scrollArea = container.querySelector('[data-virtualized="true"]')
    expect(scrollArea).toHaveAttribute("data-total-count", "200")
    expect(screen.getAllByRole("listitem")).toHaveLength(8)
    expect(screen.getByText("Result 7").closest("li")).toHaveAttribute("aria-posinset", "8")
    expect(screen.queryByText("Result 199")).not.toBeInTheDocument()
  })
})
