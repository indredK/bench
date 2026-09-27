import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ProbeOpenSettingsButton } from "@/features/network-probe/components/ProbeOpenSettingsButton"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({ "networkProbe.common.openingSettings": "正在打开网络设置…" })[key] ?? key,
  }),
}))

describe("ProbeOpenSettingsButton", () => {
  it("shows progress and blocks duplicate opens while pending", () => {
    const onOpen = vi.fn()
    render(<ProbeOpenSettingsButton label="打开系统网络设置" opening onOpen={onOpen} size="sm" />)

    const button = screen.getByRole("button", { name: "正在打开网络设置…" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    fireEvent.click(button)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("opens settings when no request is pending", () => {
    const onOpen = vi.fn()
    render(<ProbeOpenSettingsButton label="打开系统网络设置" opening={false} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole("button", { name: "打开系统网络设置" }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
