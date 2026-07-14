import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SettingToggle } from "@/features/system-settings/components/SettingToggle"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("SettingToggle unknown state", () => {
  it("does not render an unknown value as a disabled switch", () => {
    const onCheckedChange = vi.fn()
    render(<SettingToggle label="Setting" checked={null} onCheckedChange={onCheckedChange} />)

    expect(screen.getByText("common.unknown")).toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "common.enable" }))
    fireEvent.click(screen.getByRole("button", { name: "common.disable" }))
    expect(onCheckedChange).toHaveBeenNthCalledWith(1, true)
    expect(onCheckedChange).toHaveBeenNthCalledWith(2, false)
  })
})
