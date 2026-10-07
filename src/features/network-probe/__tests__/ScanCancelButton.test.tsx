import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScanCancelButton } from "@/features/network-probe/components/ScanCancelButton"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

afterEach(() => cleanup())

describe("ScanCancelButton", () => {
  it("sends one cancel request and disables itself while cancellation is pending", () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <ScanCancelButton label="Cancel scan" cancelRequested={false} onCancel={onCancel} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }))
    expect(onCancel).toHaveBeenCalledOnce()

    rerender(<ScanCancelButton label="Cancel scan" cancelRequested onCancel={onCancel} />)

    const button = screen.getByRole("button", { name: "networkProbe.scan.cancelling" })
    expect(button.hasAttribute("disabled")).toBe(true)
    expect(button.getAttribute("aria-busy")).toBe("true")
    fireEvent.click(button)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("keeps the action disabled until a scan session can be cancelled", () => {
    render(
      <ScanCancelButton label="Cancel scan" cancelRequested={false} disabled onCancel={vi.fn()} />,
    )

    expect(screen.getByRole("button", { name: "Cancel scan" }).hasAttribute("disabled")).toBe(true)
  })
})
