import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ProbeCancelButton } from "@/features/network-probe/components/ProbeCancelButton"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "networkProbe.cmd.cancelScan": "取消网络探测",
        "networkProbe.common.cancelling": "正在取消…",
      })[key] ?? key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("ProbeCancelButton", () => {
  it("shows cancelling feedback and blocks repeated clicks", () => {
    const onCancel = vi.fn()
    render(<ProbeCancelButton canCancel cancelling cancelLabel="取消" onCancel={onCancel} />)

    const button = screen.getByRole("button", { name: "正在取消…" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    fireEvent.click(button)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("keeps the cancel action available before a request is pending", () => {
    const onCancel = vi.fn()
    render(
      <ProbeCancelButton canCancel cancelling={false} cancelLabel="取消" onCancel={onCancel} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "取消" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
