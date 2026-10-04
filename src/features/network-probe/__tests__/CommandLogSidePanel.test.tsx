import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CommandLogSidePanel } from "../components/CommandLogSidePanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "networkProbe.sideLog.title": "命令日志",
        "networkProbe.sideLog.clear": "清空",
        "networkProbe.sideLog.collapse": "收起命令日志",
        "networkProbe.sideLog.empty": "暂无日志",
      }
      return translations[key] ?? key
    },
  }),
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/components/common/ScrollableArea", () => ({
  ScrollableArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe("CommandLogSidePanel", () => {
  it("keeps command syntax intact and separates the timestamp", () => {
    const timestamp = "2026-09-27T11:01:37.973Z"
    render(<CommandLogSidePanel lines={[`${timestamp} probeNtp(local)`]} onClear={vi.fn()} />)

    const time = screen.getByText(timestamp)
    const command = screen.getByText("probeNtp(local)")

    expect(time.tagName).toBe("TIME")
    expect(command.tagName).toBe("CODE")
    expect(command.className).toContain("whitespace-nowrap")
    expect(time.closest("li")).toBe(command.closest("li"))
  })
})
