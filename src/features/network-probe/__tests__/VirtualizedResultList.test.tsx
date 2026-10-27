import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    getItemKey,
  }: {
    count: number
    getItemKey: (index: number) => string | number
  }) => ({
    getTotalSize: () => count * 24,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 10) }, (_, index) => ({
        index,
        key: getItemKey(index),
        start: index * 24,
      })),
    measureElement: () => {},
  }),
}))

afterEach(() => cleanup())

describe("VirtualizedResultList", () => {
  it("keeps small results as a normal list", () => {
    render(
      <VirtualizedResultList
        ariaLabel="results"
        items={["first", "second"]}
        getItemKey={(item) => item}
        renderItem={(item) => item}
      />,
    )

    const region = screen.getByRole("region", { name: "results" })
    expect(region).toHaveAttribute("data-virtualized-list", "false")
    expect(within(region).getAllByRole("listitem")).toHaveLength(2)
  })

  it("keeps exactly 64 rows in the full native list", () => {
    const items = Array.from({ length: 64 }, (_, index) => `row ${index + 1}`)
    render(
      <VirtualizedResultList
        ariaLabel="results"
        items={items}
        getItemKey={(item) => item}
        renderItem={(item) => item}
      />,
    )

    const region = screen.getByRole("region", { name: "results" })
    expect(region).toHaveAttribute("data-virtualized-list", "false")
    expect(within(region).getAllByRole("listitem")).toHaveLength(64)
  })

  it("windows long results and exposes their full list positions", () => {
    const items = Array.from({ length: 65 }, (_, index) => `row ${index + 1}`)
    render(
      <VirtualizedResultList
        ariaLabel="results"
        items={items}
        getItemKey={(item) => item}
        renderItem={(item) => item}
      />,
    )

    const region = screen.getByRole("region", { name: "results" })
    const rows = within(region).getAllByRole("listitem")
    expect(region).toHaveAttribute("data-virtualized-list", "true")
    expect(region).toHaveAttribute("data-total-count", "65")
    expect(rows.length).toBeLessThan(items.length)
    expect(rows[0]).toHaveAttribute("aria-posinset", "1")
    expect(rows[0]).toHaveAttribute("aria-setsize", "65")
  })
})
