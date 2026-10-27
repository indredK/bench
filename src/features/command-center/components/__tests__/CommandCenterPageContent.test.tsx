import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CommandCenterPageContent } from "@/features/command-center/components/CommandCenterPageContent"
import type { CommandCard } from "@/lib/tauri/types/command-center"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("motion/react", async () => {
  const React = await import("react")
  const MotionDiv = React.forwardRef<
    HTMLDivElement,
    React.ComponentPropsWithoutRef<"div"> & {
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
      layout?: unknown
    }
  >(
    (
      {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        layout: _layout,
        ...props
      },
      ref,
    ) => React.createElement("div", { ...props, ref }),
  )
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: { div: MotionDiv },
  }
})

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react")
  return {
    DndContext: ({ children }: { children: ReactNode }) =>
      React.createElement("div", null, children),
    DragOverlay: ({ children }: { children: ReactNode }) => children,
    KeyboardSensor: class KeyboardSensor {},
    PointerSensor: class PointerSensor {},
    closestCenter: vi.fn(),
    useSensor: vi.fn((sensor: unknown) => sensor),
    useSensors: vi.fn((...sensors: unknown[]) => sensors),
  }
})

vi.mock("@dnd-kit/sortable", async () => {
  const React = await import("react")
  return {
    SortableContext: ({ children }: { children: ReactNode }) =>
      React.createElement("div", null, children),
    rectSortingStrategy: vi.fn(),
    useSortable: ({ disabled }: { disabled?: boolean }) => ({
      attributes: { tabIndex: disabled ? -1 : 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

vi.mock("@dnd-kit/utilities", () => ({ CSS: { Translate: { toString: () => undefined } } }))
vi.mock("@/features/command-center/components/RunDetailDrawer", () => ({
  TerminateButton: () => <button type="button">Stop</button>,
}))

afterEach(() => cleanup())

function card(overrides: Partial<CommandCard> = {}): CommandCard {
  return {
    id: "card-1",
    title: "Restart API",
    description: "Restart local development service",
    kind: "shell",
    command: "pnpm dev:restart",
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    group: "Development",
    tags: ["api", "local"],
    ...overrides,
  }
}

function renderCards(cards: CommandCard[], onExpand = vi.fn()) {
  return render(
    <CommandCenterPageContent
      cards={cards}
      loading={false}
      error=""
      runningIds={new Set()}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onRun={vi.fn()}
      onDelete={vi.fn()}
      onExpand={onExpand}
      onTerminate={vi.fn()}
      onExport={vi.fn()}
      onImport={vi.fn()}
      onOpenMarket={vi.fn()}
      ioBusy={null}
      onReorder={vi.fn()}
      onDismissError={vi.fn()}
      hasResult={() => false}
    />,
  )
}

describe("command center card filters", () => {
  it("exposes card details as a separate native button beside card actions", () => {
    const onExpand = vi.fn()
    renderCards([card()], onExpand)

    const detailsButton = screen.getByRole("button", { name: "commandCenter.openDetails" })
    expect(detailsButton).toBeInTheDocument()
    fireEvent.click(detailsButton)
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ id: "card-1" }))
  })

  it("searches card text and disables reordering while a filtered subset is shown", () => {
    renderCards([
      card(),
      card({
        id: "card-2",
        title: "Deploy Worker",
        description: "Deploy the production worker",
        command: "deploy worker",
        group: "Operations",
        tags: ["worker"],
      }),
    ])

    fireEvent.change(screen.getByRole("textbox", { name: "commandCenter.filters.search" }), {
      target: { value: "restart local" },
    })

    expect(screen.getByRole("heading", { name: "Restart API" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Deploy Worker" })).not.toBeInTheDocument()
    const reorderButtons = screen.getAllByRole("button", { name: "commandCenter.reorder" })
    expect(reorderButtons).toHaveLength(1)
    for (const button of reorderButtons) {
      expect(button).toHaveAttribute("aria-disabled", "true")
    }
  })

  it("shows a clearable no-results state and restores the full card list", () => {
    renderCards([card()])

    fireEvent.change(screen.getByRole("textbox", { name: "commandCenter.filters.search" }), {
      target: { value: "does-not-exist" },
    })
    expect(screen.getByText("commandCenter.filters.noResults")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Restart API" })).not.toBeInTheDocument()

    const clearButtons = screen.getAllByRole("button", { name: "commandCenter.filters.clear" })
    fireEvent.click(clearButtons.at(-1)!)
    expect(screen.getByRole("heading", { name: "Restart API" })).toBeInTheDocument()
  })
})
