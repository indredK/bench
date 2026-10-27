import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const { mockUseVirtualizer } = vi.hoisted(() => ({
  mockUseVirtualizer: vi.fn(),
}))

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: mockUseVirtualizer,
}))

import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"

afterEach(() => {
  cleanup()
  mockUseVirtualizer.mockReset()
})

interface Item {
  id: string
  label: string
}

function setupVirtualizer(count: number) {
  mockUseVirtualizer.mockReturnValue({
    getTotalSize: () => count * 32,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 3) }, (_, index) => ({
        index,
        size: 32,
        start: index * 32,
      })),
    measureElement: vi.fn(),
  })
}

describe("VirtualizedResultList", () => {
  it("keeps short results as a normal semantic list", () => {
    const items = [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
    ]
    setupVirtualizer(items.length)

    render(
      <VirtualizedResultList<Item>
        items={items}
        getKey={(item) => item.id}
        ariaLabel="Devices"
        renderItem={(item) => item.label}
      />,
    )

    const list = screen.getByRole("list", { name: "Devices" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    expect(list).not.toHaveAttribute("data-virtual-result-list")
  })

  it("bounds mounted rows for long results while reporting the full set size", () => {
    const items = Array.from({ length: 200 }, (_, index) => ({
      id: `device-${index}`,
      label: `Device ${index}`,
    }))
    setupVirtualizer(items.length)

    render(
      <VirtualizedResultList<Item>
        items={items}
        getKey={(item) => item.id}
        ariaLabel="Devices"
        renderItem={(item) => item.label}
      />,
    )

    const list = screen.getByRole("list", { name: "Devices" })
    expect(list).toHaveAttribute("data-total-count", "200")
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
    expect(within(list).getAllByRole("listitem")[0]).toHaveAttribute("aria-setsize", "200")
    expect(within(list).getAllByRole("listitem")[0]).toHaveAttribute("aria-posinset", "1")
    expect(screen.queryByText("Device 199")).not.toBeInTheDocument()
  })
})
