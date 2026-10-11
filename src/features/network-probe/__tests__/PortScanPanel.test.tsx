import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import { MAX_PORT_RANGE_INPUT_BYTES, validatePortRange } from "@/features/network-probe/port-range"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

function createProps() {
  return {
    loading: false,
    canCancel: false,
    result: null,
    streaming: [],
    toolEnabled: true,
    onRun: vi.fn(),
    onCancel: vi.fn(),
  }
}

afterEach(() => cleanup())

describe("network-probe port range validation", () => {
  it("counts unique ports so the confirmation matches the actual scan", () => {
    expect(validatePortRange("443,80,8000-8002,80")).toEqual({ valid: true, count: 5 })
  })

  it.each([
    ["", "empty"],
    ["abc", "invalidFormat"],
    ["0", "outOfRange"],
    ["65536", "outOfRange"],
    ["10-1", "reversedRange"],
    ["1-257", "tooMany"],
  ])("rejects %j with the %s validation", (input, error) => {
    expect(validatePortRange(input)).toEqual({ valid: false, error })
  })

  it("rejects oversized input before parsing", () => {
    expect(validatePortRange("1".repeat(MAX_PORT_RANGE_INPUT_BYTES + 1))).toEqual({
      valid: false,
      error: "tooLong",
    })
  })

  it("blocks invalid input with an inline accessible error and allows correction", () => {
    const props = createProps()
    render(<PortScanPanel {...props} />)

    const input = screen.getByLabelText("networkProbe.ports.range")
    const runButton = screen.getByRole("button", { name: "networkProbe.ports.run" })

    fireEvent.change(input, { target: { value: "abc" } })

    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", "np-ports-range-error")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "networkProbe.ports.validation.invalidFormat",
    )
    expect(runButton).toBeDisabled()
    expect(props.onRun).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "80,443" } })

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(runButton).toBeEnabled()
    fireEvent.click(runButton)
    expect(props.onRun).toHaveBeenCalledWith("127.0.0.1", "80,443")
  })
})
