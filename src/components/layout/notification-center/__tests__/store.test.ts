import { beforeEach, describe, expect, it, vi } from "vitest"
import { useNotificationCenterStore } from "../store"
import type { AppNotificationInput } from "../store"

function makeInput(overrides: Partial<AppNotificationInput> = {}): AppNotificationInput {
  return {
    id: "test-notification",
    level: "warning",
    titleKey: "notificationCenter.title",
    descriptionKey: "accountManager.capabilities.summary",
    descriptionParams: { partial: 7, blocked: 0 },
    ...overrides,
  }
}

describe("useNotificationCenterStore", () => {
  beforeEach(() => {
    useNotificationCenterStore.getState().clearAll()
  })

  it("push adds a notification as unread at the top", () => {
    const { pushNotification } = useNotificationCenterStore.getState()

    pushNotification(makeInput())

    const { notifications } = useNotificationCenterStore.getState()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].id).toBe("test-notification")
    expect(notifications[0].read).toBe(false)
    expect(notifications[0].createdAt).toBeGreaterThan(0)
  })

  it("re-push with identical content keeps read state and order", () => {
    const { pushNotification } = useNotificationCenterStore.getState()

    pushNotification(makeInput())
    useNotificationCenterStore.getState().markAllRead()
    pushNotification(makeInput())

    const { notifications } = useNotificationCenterStore.getState()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].read).toBe(true)
  })

  it("re-push with changed content marks unread and moves to top", () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000)
      const { pushNotification } = useNotificationCenterStore.getState()

      pushNotification(makeInput({ id: "older" }))
      pushNotification(makeInput({ id: "newer" }))
      useNotificationCenterStore.getState().markAllRead()

      vi.setSystemTime(2_000)
      pushNotification(makeInput({ id: "older", descriptionParams: { partial: 5, blocked: 1 } }))

      const { notifications } = useNotificationCenterStore.getState()
      expect(notifications.map((item) => item.id)).toEqual(["older", "newer"])
      expect(notifications[0].read).toBe(false)
      expect(notifications[0].createdAt).toBe(2_000)
      expect(notifications[1].read).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("dismiss removes the notification by id", () => {
    const { pushNotification } = useNotificationCenterStore.getState()

    pushNotification(makeInput())
    useNotificationCenterStore.getState().dismissNotification("test-notification")

    expect(useNotificationCenterStore.getState().notifications).toHaveLength(0)
  })

  it("markAllRead marks every notification read", () => {
    const { pushNotification } = useNotificationCenterStore.getState()

    pushNotification(makeInput({ id: "a" }))
    pushNotification(makeInput({ id: "b", level: "error" }))

    useNotificationCenterStore.getState().markAllRead()

    const { notifications } = useNotificationCenterStore.getState()
    expect(notifications.every((item) => item.read)).toBe(true)
  })

  it("clearAll empties the list", () => {
    const { pushNotification } = useNotificationCenterStore.getState()

    pushNotification(makeInput())
    useNotificationCenterStore.getState().clearAll()

    expect(useNotificationCenterStore.getState().notifications).toHaveLength(0)
  })
})
