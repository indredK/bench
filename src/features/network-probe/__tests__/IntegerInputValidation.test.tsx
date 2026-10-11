import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import { TcpConnectPanel } from "@/features/network-probe/components/TcpConnectPanel"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"
import { parseBoundedIntegerInput } from "@/features/network-probe/integer-input"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

afterEach(() => cleanup())

describe("bounded integer input", () => {
  it.each([
    ["1", 1, 20, 1],
    ["20", 1, 20, 20],
    ["65535", 1, 65535, 65535],
    ["", 1, 20, null],
    ["1.5", 1, 20, null],
    ["-1", 1, 20, null],
    ["1e2", 1, 20, null],
    ["21", 1, 20, null],
    ["9007199254740992", 1, Number.MAX_SAFE_INTEGER, null],
  ])("parses %j within its range", (value, min, max, expected) => {
    expect(parseBoundedIntegerInput(value, min, max)).toBe(expected)
  })
})

describe("network probe integer fields", () => {
  it("shows a field error and blocks Ping until the count is valid", () => {
    const onRun = vi.fn()
    render(<PingPanel loading={false} result={null} toolEnabled onRun={onRun} />)

    const input = screen.getByLabelText("networkProbe.ping.count")
    const runButton = screen.getByRole("button", { name: "networkProbe.ping.run" })
    fireEvent.change(input, { target: { value: "1.5" } })

    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", "np-ping-count-error")
    expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.ping.countInvalid")
    expect(runButton).toBeDisabled()
    fireEvent.click(runButton)
    expect(onRun).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "5" } })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(runButton).toBeEnabled()
    fireEvent.click(runButton)
    expect(onRun).toHaveBeenCalledWith("1.1.1.1", 5)
  })

  it.each(["1.5", "0", "65536"])(
    "shows a field error and blocks TCP connect for port %s",
    (value) => {
      const onRun = vi.fn()
      render(<TcpConnectPanel loading={false} result={null} onRun={onRun} />)

      const input = screen.getByLabelText("networkProbe.tcp.port")
      const runButton = screen.getByRole("button", { name: "networkProbe.tcp.run" })
      fireEvent.change(input, { target: { value } })

      expect(input).toHaveAttribute("aria-invalid", "true")
      expect(screen.getByRole("alert")).toHaveTextContent("networkProbe.tcp.portInvalid")
      expect(runButton).toBeDisabled()
      fireEvent.click(runButton)
      expect(onRun).not.toHaveBeenCalled()

      fireEvent.change(input, { target: { value: "443" } })
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(runButton).toBeEnabled()
      fireEvent.click(runButton)
      expect(onRun).toHaveBeenCalledWith("1.1.1.1", 443)
      cleanup()
    },
  )

  it.each([
    ["networkProbe.traceroute.maxTtl", "33", "networkProbe.traceroute.maxTtlInvalid"],
    ["networkProbe.traceroute.maxTtl", "1.5", "networkProbe.traceroute.maxTtlInvalid"],
    ["networkProbe.traceroute.rounds", "11", "networkProbe.traceroute.roundsInvalid"],
    ["networkProbe.traceroute.rounds", "1.5", "networkProbe.traceroute.roundsInvalid"],
  ])("blocks traceroute for invalid %s value %s", (label, value, errorKey) => {
    const onRun = vi.fn()
    render(
      <TraceroutePanel
        loading={false}
        canCancel={false}
        result={null}
        streamingHops={[]}
        toolEnabled
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(label)
    const runButton = screen.getByRole("button", { name: "networkProbe.traceroute.run" })
    fireEvent.change(input, { target: { value } })

    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent(errorKey)
    expect(runButton).toBeDisabled()
    fireEvent.click(runButton)
    expect(onRun).not.toHaveBeenCalled()
    cleanup()
  })
})
