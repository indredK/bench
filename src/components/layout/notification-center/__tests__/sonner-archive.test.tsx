import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SonnerNotificationArchive } from "../sonner-archive"
import { useNotificationCenterStore } from "../store"

const { dismiss, current } = vi.hoisted(() => ({
  dismiss: vi.fn(),
  current: { toasts: [] as Array<Record<string, unknown>> },
}))
vi.mock("sonner", () => ({ useSonner: () => current, toast: { dismiss } }))

describe("notification archive", () => {
  beforeEach(() => {
    dismiss.mockClear()
    current.toasts = []
    useNotificationCenterStore.getState().clearAll()
  })

  it("moves simple success messages to the bell but keeps actionable and error messages visible", () => {
    current.toasts = [
      { id: 1, type: "success", title: "Saved" },
      { id: 2, type: "info", title: "Undo", action: { label: "Undo" } },
      { id: 3, type: "error", title: "Failed" },
      { id: 4, type: "success", title: "Custom", description: {} },
    ]
    render(<SonnerNotificationArchive />)
    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(dismiss).toHaveBeenCalledWith(1)
    expect(
      useNotificationCenterStore.getState().notifications.map((item) => item.titleText),
    ).toEqual(["Custom", "Failed", "Undo", "Saved"])
  })

  it("updates an existing message when its content changes", () => {
    current.toasts = [{ id: 1, type: "loading", title: "Working" }]
    const view = render(<SonnerNotificationArchive />)
    current.toasts = [{ id: 1, type: "error", title: "Failed" }]
    view.rerender(<SonnerNotificationArchive />)
    expect(useNotificationCenterStore.getState().notifications).toHaveLength(1)
    expect(useNotificationCenterStore.getState().notifications[0].titleText).toBe("Failed")
    expect(dismiss).not.toHaveBeenCalled()
  })
})
