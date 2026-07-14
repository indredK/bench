/**
 * Test / 测试: verify behavior only; 只验证行为与契约.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { VirtualGridView } from "../content/VirtualGridView"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 120,
    getVirtualItems: () => [{ index: 0, size: 120, start: 0 }],
  }),
}))

const originalResizeObserver = globalThis.ResizeObserver

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
})

function getGridParts(container: HTMLElement) {
  const scroller = container.querySelector("[data-table-scroll]")
  const gridShell = scroller?.firstElementChild as HTMLElement | null
  const virtualCanvas = gridShell?.firstElementChild as HTMLElement | null
  const gridRow = virtualCanvas?.querySelector(
    "div[style*='grid-template-columns']",
  ) as HTMLElement | null

  return { scroller, gridShell, virtualCanvas, gridRow }
}

interface GridRow {
  id: string
  label: string
}

const rows: GridRow[] = [
  { id: "1", label: "Alpha" },
  { id: "2", label: "Beta" },
  { id: "3", label: "Gamma" },
]

describe("VirtualGridView", () => {
  it("keeps configured columns at a stable minimum width before measuring the viewport", () => {
    const { container } = render(
      <VirtualGridView
        data={rows}
        getRowId={(row) => row.id}
        renderGridCard={(row) => <div>{row.label}</div>}
        onItemClick={() => {}}
        estimatedCardHeight={120}
      />,
    )

    const { scroller, gridShell, virtualCanvas, gridRow } = getGridParts(container)

    expect(scroller).not.toBeNull()
    expect(gridShell).not.toBeNull()
    expect(virtualCanvas).not.toBeNull()
    expect(gridShell).toHaveStyle({ minWidth: "736px" })
    expect(virtualCanvas).toHaveStyle({ minWidth: "736px" })

    expect(gridRow).not.toBeNull()
    expect(gridRow?.style.gridTemplateColumns).toBe("repeat(3, minmax(240px, 1fr))")
  })

  it("keeps a 2000-item fixture bounded to the visible virtual row", () => {
    const fixture = Array.from({ length: 2_000 }, (_, index) => ({
      id: String(index),
      label: `App ${index}`,
    }))
    const { container } = render(
      <VirtualGridView
        data={fixture}
        getRowId={(row) => row.id}
        renderGridCard={(row) => <div data-grid-card>{row.label}</div>}
        onItemClick={() => {}}
        gridColumns={8}
        minCardWidth={84}
      />,
    )

    const scroller = container.querySelector("[data-table-scroll]")
    expect(scroller).toHaveAttribute("data-total-count", "2000")
    expect(container.querySelectorAll("[data-grid-card]")).toHaveLength(8)
    expect(container).toHaveTextContent("App 0")
    expect(container).not.toHaveTextContent("App 1999")
  })

  it("reduces columns when the available width is too narrow for the maximum", async () => {
    class MockResizeObserver {
      private callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe() {
        this.callback(
          [{ contentRect: { width: 500 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }

      unobserve() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

    const { container } = render(
      <VirtualGridView
        data={rows}
        getRowId={(row) => row.id}
        renderGridCard={(row) => <div>{row.label}</div>}
        onItemClick={() => {}}
        estimatedCardHeight={120}
      />,
    )

    await waitFor(() => {
      const { gridShell, virtualCanvas, gridRow } = getGridParts(container)

      expect(gridShell).toHaveStyle({ minWidth: "488px" })
      expect(virtualCanvas).toHaveStyle({ minWidth: "488px" })
      expect(gridRow?.style.gridTemplateColumns).toBe("repeat(2, minmax(240px, 1fr))")
    })
  })
})
