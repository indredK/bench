import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import { MAX_PORT_RANGE_INPUT_BYTES, validatePortRange } from "@/features/network-probe/port-range"
import type { PortScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key === "networkProbe.ports.possibleService" && values?.service
        ? `${key}: ${values.service}`
        : key,
  }),
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
    cancelling: false,
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

  it("shows an open-port count while keeping per-port details available", () => {
    const result: PortScanResult = {
      target: "127.0.0.1",
      mode: "tcp-connect",
      openPorts: [80, 443],
      samples: [
        { port: 22, state: "closed" },
        { port: 80, state: "open", serviceHint: "http", rttMs: 3 },
        { port: 443, state: "open", serviceHint: "https", rttMs: 4 },
      ],
      cancelled: false,
      sessionId: "session-1",
      commandHint: "scanPorts",
    }
    render(<PortScanPanel {...createProps()} result={result} />)

    expect(screen.getByText("networkProbe.ports.openCount")).toBeInTheDocument()
    expect(screen.getByText("22: networkProbe.ports.state.closed")).toBeInTheDocument()
    expect(
      screen.getByText(
        "80: networkProbe.ports.state.open · networkProbe.ports.possibleService: http · 3 ms",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "443: networkProbe.ports.state.open · networkProbe.ports.possibleService: https · 4 ms",
      ),
    ).toBeInTheDocument()
  })

  it("politely announces zero open ports after a completed scan", () => {
    const result: PortScanResult = {
      target: "127.0.0.1",
      mode: "tcp-connect",
      openPorts: [],
      samples: [{ port: 22, state: "closed" }],
      cancelled: false,
      sessionId: "session-closed-only",
      commandHint: "scanPorts",
    }
    const props = createProps()
    const view = render(<PortScanPanel {...props} loading result={result} />)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    view.rerender(<PortScanPanel {...props} result={result} />)

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.ports.openCount")
  })

  it("shows a localized terminal state when a scan is cancelled", () => {
    const result: PortScanResult = {
      target: "127.0.0.1",
      mode: "nmap-syn-or-connect",
      openPorts: [80],
      samples: [{ port: 80, state: "open" }],
      cancelled: true,
      sessionId: "session-cancelled",
      message: "Port scan cancelled.",
      commandHint: "scanPorts",
    }
    render(<PortScanPanel {...createProps()} result={result} />)

    expect(screen.getByRole("status")).toHaveTextContent("networkProbe.ports.cancelled")
    expect(screen.queryByText("networkProbe.ports.openCount")).not.toBeInTheDocument()
    expect(screen.queryByText("Port scan cancelled.")).not.toBeInTheDocument()
  })
})
