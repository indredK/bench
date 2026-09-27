/**
 * Test / 测试: accessible bounded rendering for long network-probe results.
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { TracerouteHop } from "@/lib/tauri/types/network-probe"
import { VirtualizedResultList } from "../components/VirtualizedResultList"
import { VirtualizedTracerouteTable } from "../components/VirtualizedTracerouteTable"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 6) }, (_, index) => ({
        index,
        size: estimateSize(),
        start: index * estimateSize(),
      })),
    measureElement: vi.fn(),
  }),
}))

function createHops(count: number): TracerouteHop[] {
  return Array.from({ length: count }, (_, index) => ({
    ttl: index + 1,
    addrs: [`192.0.2.${index + 1}`],
    asn: undefined,
    asName: undefined,
    lossPercent: 0,
    sent: 3,
    recv: 3,
    avgRttMs: 1,
    bestRttMs: 0.5,
    worstRttMs: 1.5,
  }))
}

describe("VirtualizedResultList", () => {
  it("keeps lists of 50 rows natural-height", () => {
    const items = Array.from({ length: 50 }, (_, index) => `row-${index}`)
    const { container } = render(
      <VirtualizedResultList
        items={items}
        ariaLabel="Results"
        getItemKey={(item) => item}
        renderItem={(item) => item}
      />,
    )
    const listRegion = container.querySelector("[data-total-count]")

    expect(listRegion).toHaveAttribute("data-total-count", "50")
    expect(listRegion).toHaveAttribute("data-virtualized", "false")
    expect(screen.getAllByRole("listitem")).toHaveLength(50)
    expect(screen.getByText("row-49")).toBeInTheDocument()
  })

  it("follows streamed rows at the bottom but preserves a reader's earlier scroll position", () => {
    let items = Array.from({ length: 51 }, (_, index) => `row-${index}`)
    const renderList = () => (
      <VirtualizedResultList
        items={items}
        ariaLabel="Port scan results"
        followTail
        getItemKey={(item) => item}
        renderItem={(item) => item}
      />
    )
    const { container, rerender } = render(renderList())
    const scroller = container.querySelector("[data-total-count]") as HTMLDivElement
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 280 })
    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      get: () => items.length * 28,
    })

    scroller.scrollTop = 400
    fireEvent.scroll(scroller)
    items = Array.from({ length: 52 }, (_, index) => `row-${index}`)
    rerender(renderList())
    expect(scroller.scrollTop).toBe(400)

    scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight
    fireEvent.scroll(scroller)
    items = Array.from({ length: 53 }, (_, index) => `row-${index}`)
    rerender(renderList())
    expect(scroller.scrollTop).toBe(scroller.scrollHeight)
  })

  it("bounds rows above the threshold and exposes their full-list position to assistive tech", () => {
    const items = Array.from({ length: 200 }, (_, index) => `row-${index}`)
    render(
      <VirtualizedResultList
        items={items}
        ariaLabel="Port scan results"
        getItemKey={(item) => item}
        renderItem={(item) => item}
      />,
    )

    const region = screen.getByRole("region", { name: "Port scan results" })
    expect(region).toHaveAttribute("data-total-count", "200")
    expect(region).toHaveAttribute("data-virtualized", "true")
    expect(region).toHaveAttribute("tabindex", "0")
    expect(screen.getAllByRole("listitem")).toHaveLength(6)
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-posinset", "1")
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-setsize", "200")
    expect(screen.queryByText("row-199")).not.toBeInTheDocument()
  })
})

describe("VirtualizedTracerouteTable", () => {
  it("bounds long paths while preserving table row counts and indexes", () => {
    const hops = createHops(100)
    render(
      <VirtualizedTracerouteTable
        hops={hops}
        ariaLabel="Traceroute hop results"
        columnLabels={["TTL", "Address", "AS", "Loss", "Avg", "Best", "Worst"]}
        renderCells={(hop) => [
          hop.ttl,
          hop.addrs.join(", "),
          hop.asn ?? "—",
          `${hop.lossPercent}%`,
          String(hop.avgRttMs),
          String(hop.bestRttMs),
          String(hop.worstRttMs),
        ]}
      />,
    )

    const region = screen.getByRole("region", { name: "Traceroute hop results" })
    const table = screen.getByRole("table")
    expect(region).toHaveAttribute("data-total-count", "100")
    expect(table).toHaveAttribute("aria-rowcount", "101")
    expect(screen.getAllByRole("row")).toHaveLength(7)
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("aria-rowindex", "2")
    expect(screen.queryByText("192.0.2.100")).not.toBeInTheDocument()
  })
})
