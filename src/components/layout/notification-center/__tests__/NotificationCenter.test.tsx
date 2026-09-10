/**
 * NotificationCenter 行为测试：角标、消息列表、已读/清除与渲染期 i18n 解析。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { NotificationCenter } from "../NotificationCenter"
import { useNotificationCenterStore } from "../store"
import type { AppNotificationInput } from "../store"

const i18nState = vi.hoisted(() => ({ lang: "en" as "en" | "zh" }))
const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((next: boolean) => void) | undefined,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const dictionaries: Record<"en" | "zh", Record<string, string>> = {
        en: {
          "notificationCenter.title": "Notifications",
          "notificationCenter.empty": "You're all caught up",
          "notificationCenter.clearAll": "Clear all",
          "notificationCenter.dismiss": "Dismiss",
          "notificationCenter.unreadCount": "{{count}} unread messages",
          "startupIssues.title": "Some features did not finish loading",
          "startupIssues.description":
            "{{features}} are running in a failed startup state. Fix the local store or retry after restarting the app.",
          "startupIssues.features.account-manager": "Account Management",
          "sidebar.accountManager": "Account Management",
          "accountManager.capabilities.summary":
            "{{partial}} capabilities pending on-device validation, {{blocked}} unavailable on this platform.",
        },
        zh: {
          "notificationCenter.title": "消息通知",
          "notificationCenter.empty": "暂无新消息",
          "notificationCenter.clearAll": "全部清除",
          "notificationCenter.dismiss": "移除",
          "notificationCenter.unreadCount": "{{count}} 条未读消息",
          "startupIssues.title": "部分功能未能完成初始化",
          "startupIssues.description":
            "{{features}} 当前处于启动失败状态。请修复本地存储后重启应用再试。",
          "startupIssues.features.account-manager": "账号管理",
          "sidebar.accountManager": "账号管理",
          "accountManager.capabilities.summary":
            "当前有 {{partial}} 项能力待真机验收，{{blocked}} 项能力在本平台不可用。",
        },
      }
      let text = dictionaries[i18nState.lang][key] ?? key
      for (const [name, value] of Object.entries(params ?? {})) {
        text = text.replaceAll(`{{${name}}}`, String(value))
      }
      return text
    },
  }),
}))

// Popover 原语用轻量替身：root 捕获 onOpenChange 供测试触发开合，trigger/content 直渲染 children。
vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode
    onOpenChange?: (next: boolean) => void
  }) => {
    popoverState.onOpenChange = onOpenChange
    return <div data-testid="popover-root">{children}</div>
  },
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}))

function makeInput(overrides: Partial<AppNotificationInput> = {}): AppNotificationInput {
  return {
    id: "test-notification",
    level: "warning",
    titleKey: "sidebar.accountManager",
    descriptionKey: "accountManager.capabilities.summary",
    descriptionParams: { partial: 7, blocked: 0 },
    ...overrides,
  }
}

function renderCenter() {
  return render(<NotificationCenter />)
}

beforeEach(() => {
  i18nState.lang = "en"
  popoverState.onOpenChange = undefined
  useNotificationCenterStore.getState().clearAll()
})

describe("NotificationCenter", () => {
  it("shows the empty state and no badge when there is no message", () => {
    renderCenter()

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument()
  })

  it("shows an unread badge and renders messages from i18n keys", () => {
    const { pushNotification } = useNotificationCenterStore.getState()
    pushNotification(makeInput())
    pushNotification(
      makeInput({
        id: "startup-issues",
        level: "error",
        titleKey: "startupIssues.title",
        descriptionKey: "startupIssues.description",
        descriptionParams: {
          features: [
            {
              key: "startupIssues.features.account-manager",
              params: { defaultValue: "account-manager" },
            },
          ],
        },
      }),
    )

    renderCenter()

    expect(screen.getByRole("button", { name: "2 unread messages" })).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()

    // canonical 参数（descriptor 数组）在渲染期翻译并连接
    expect(screen.getByText("Some features did not finish loading")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Account Management are running in a failed startup state. Fix the local store or retry after restarting the app.",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "7 capabilities pending on-device validation, 0 unavailable on this platform.",
      ),
    ).toBeInTheDocument()
  })

  it("caps the badge label at 9+ for large unread counts", () => {
    const { pushNotification } = useNotificationCenterStore.getState()
    for (let index = 0; index < 10; index += 1) {
      pushNotification(makeInput({ id: `notification-${index}` }))
    }

    renderCenter()

    expect(screen.getByText("9+")).toBeInTheDocument()
  })

  it("marks all messages read when the panel opens", () => {
    const { pushNotification } = useNotificationCenterStore.getState()
    pushNotification(makeInput())

    renderCenter()

    expect(screen.getByRole("button", { name: "1 unread messages" })).toBeInTheDocument()

    act(() => {
      popoverState.onOpenChange?.(true)
    })

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    expect(useNotificationCenterStore.getState().notifications[0].read).toBe(true)
  })

  it("dismisses a single message via its dismiss button", async () => {
    const user = userEvent.setup()
    const { pushNotification } = useNotificationCenterStore.getState()
    pushNotification(makeInput())

    renderCenter()

    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(useNotificationCenterStore.getState().notifications).toHaveLength(0)
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
  })

  it("clears all messages via the clear-all button", async () => {
    const user = userEvent.setup()
    const { pushNotification } = useNotificationCenterStore.getState()
    pushNotification(makeInput({ id: "a" }))
    pushNotification(makeInput({ id: "b" }))

    renderCenter()

    await user.click(screen.getByRole("button", { name: "Clear all" }))

    expect(useNotificationCenterStore.getState().notifications).toHaveLength(0)
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
  })

  it("re-resolves message text for the current locale on re-render", () => {
    const { pushNotification } = useNotificationCenterStore.getState()
    pushNotification(makeInput())

    const { rerender } = renderCenter()
    expect(
      screen.getByText(
        "7 capabilities pending on-device validation, 0 unavailable on this platform.",
      ),
    ).toBeInTheDocument()

    i18nState.lang = "zh"
    rerender(<NotificationCenter />)

    // store 只存 canonical key，切语言后无需来源重新推送
    expect(
      screen.getByText("当前有 7 项能力待真机验收，0 项能力在本平台不可用。"),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1 条未读消息" })).toBeInTheDocument()
  })
})
