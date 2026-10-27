import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BasicView, focusBasicViewSection } from "@/features/network-probe/components/BasicView"

vi.mock("@/components/common/ScrollableArea", async () => {
  const React = await import("react")
  return {
    ScrollableArea: React.forwardRef<
      HTMLDivElement,
      React.ComponentPropsWithoutRef<"div"> & { children: ReactNode }
    >(({ children, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    )),
  }
})

afterEach(() => cleanup())

describe("integrated BasicView", () => {
  it("renders all six sections as named regions in one scroll surface", () => {
    const sections = ["overview", "tree", "opinion", "offline", "fix", "report"].map((id) => ({
      id,
      title: id,
      content: <p>{`${id} content`}</p>,
    }))

    render(<BasicView sections={sections} />)

    for (const section of sections) {
      expect(screen.getByRole("region", { name: section.title })).toHaveAttribute(
        "id",
        `network-probe-basic-${section.id}`,
      )
      expect(screen.getByRole("heading", { name: section.title, level: 3 })).toBeInTheDocument()
      expect(screen.getByText(`${section.id} content`)).toBeInTheDocument()
    }
  })

  it("allows navigation to move focus into the selected section without scrolling twice", () => {
    const sections = [{ id: "fix", title: "Fix", content: <p>Fix content</p> }]
    render(<BasicView sections={sections} />)

    const section = screen.getByRole("region", { name: "Fix" })
    const focus = vi.spyOn(section, "focus")

    expect(section).toHaveAttribute("tabindex", "-1")
    focusBasicViewSection("fix")

    expect(section).toHaveFocus()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it("does not reapply the initial scroll when the active-section callback changes", async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })

    try {
      const sections = [{ id: "overview", title: "Overview", content: <p>Overview</p> }]
      const nextCallback = vi.fn()
      const { rerender } = render(
        <BasicView
          sections={sections}
          initialSectionId="overview"
          onActiveSectionChange={vi.fn()}
        />,
      )

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      rerender(
        <BasicView
          sections={sections}
          initialSectionId="overview"
          onActiveSectionChange={nextCallback}
        />,
      )

      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      fireEvent.scroll(screen.getByTestId("network-probe-basic-scroller"))
      await waitFor(() => expect(nextCallback).toHaveBeenCalledWith("overview"))
    } finally {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
      }
    }
  })

  it("reports the section crossing the reading line while scrolling", async () => {
    const onActiveSectionChange = vi.fn()
    const sections = ["overview", "tree", "opinion", "offline", "fix", "report"].map((id) => ({
      id,
      title: id,
      content: <p>{`${id} content`}</p>,
    }))

    render(<BasicView sections={sections} onActiveSectionChange={onActiveSectionChange} />)

    const scroller = screen.getByTestId("network-probe-basic-scroller")
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
    })
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 400,
      height: 400,
    } as DOMRect)

    const positions: Record<string, [number, number]> = {
      overview: [-300, -200],
      tree: [-200, -100],
      opinion: [-100, 0],
      offline: [0, 200],
      fix: [200, 300],
      report: [300, 400],
    }
    for (const section of sections) {
      const element = document.getElementById(`network-probe-basic-${section.id}`)!
      const [top, bottom] = positions[section.id]!
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
        top,
        bottom,
        height: bottom - top,
      } as DOMRect)
    }

    Object.defineProperty(scroller, "scrollTop", { configurable: true, writable: true, value: 300 })
    fireEvent.scroll(scroller)

    await waitFor(() => expect(onActiveSectionChange).toHaveBeenLastCalledWith("offline"))
  })
})
