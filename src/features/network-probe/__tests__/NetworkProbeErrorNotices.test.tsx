import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NetworkProbeErrorNotices } from "@/features/network-probe/components/NetworkProbeErrorNotices"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => cleanup())

describe("NetworkProbeErrorNotices", () => {
  it("shows concurrent errors and dismisses only the selected notice", () => {
    const onDismiss = vi.fn()
    render(
      <NetworkProbeErrorNotices
        errors={[
          { key: "networkProbe.errors.pingFailed", fallback: "Ping failed" },
          { key: "networkProbe.errors.dnsFailed", fallback: "DNS failed" },
        ]}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getAllByRole("alert")).toHaveLength(2)
    expect(screen.getByText("networkProbe.errors.pingFailed")).toBeTruthy()
    expect(screen.getByText("networkProbe.errors.dnsFailed")).toBeTruthy()

    fireEvent.click(
      screen.getAllByRole("button", { name: "networkProbe.actions.dismissError" })[0]!,
    )

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith("networkProbe.errors.pingFailed")
  })
})
