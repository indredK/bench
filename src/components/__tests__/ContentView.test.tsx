import { render, screen } from "@testing-library/react"
import type { ColumnDef } from "@tanstack/react-table"
import { describe, expect, it, vi } from "vitest"
import { ContentView } from "@/components/content/ContentView"

interface Item {
  id: string
}

const columns: ColumnDef<Item>[] = [{ accessorKey: "id" }]
const noop = vi.fn()

function renderLoading(loadingProgress?: number, loadingTotal?: number | null) {
  return render(
    <ContentView
      data={[]}
      viewMode="table"
      onViewModeChange={noop}
      columns={columns}
      getRowId={(item) => item.id}
      renderGridCard={() => null}
      onItemClick={noop}
      loading
      loadingProgress={loadingProgress}
      loadingTotal={loadingTotal}
    />,
  )
}

describe("ContentView loading progress", () => {
  it("does not expose a fake percentage when total work is unknown", () => {
    const { container } = renderLoading(4, null)

    expect(container.querySelector('[data-progress="indeterminate"]')).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("exposes bounded determinate progress when total work is known", () => {
    renderLoading(3, 4)

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75")
  })
})
