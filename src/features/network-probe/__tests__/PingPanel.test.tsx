import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import type { GlobalpingPingResult, PingProbeResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === "networkProbe.probe.resultFor" && typeof options?.target === "string"
        ? `${key}:${options.target}`
        : key,
  }),
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

const timeoutResult: PingProbeResult = {
  target: "192.0.2.1",
  resolvedIp: "192.0.2.1",
  packetsSent: 1,
  packetsReceived: 0,
  lossPercent: 100,
  samples: [{ seq: 0, ok: false, error: "Request timeout for icmp_seq 0" }],
  cancelled: false,
  commandHint: "pingHost(local, '192.0.2.1', {count:1})",
}

const successResult: PingProbeResult = {
  ...timeoutResult,
  target: "127.0.0.1",
  resolvedIp: "127.0.0.1",
  packetsReceived: 1,
  lossPercent: 0,
  samples: [{ seq: 0, ok: true, rttMs: 0.3 }],
  commandHint: "pingHost(local, '127.0.0.1', {count:1}) // sessionId=test-session-id",
}

const remoteSuccessResult: GlobalpingPingResult = {
  target: "example.com",
  location: "Helsinki",
  probeCity: "Helsinki",
  probeCountry: "FI",
  resolvedAddress: "203.0.113.10",
  packetsSent: 1,
  packetsReceived: 1,
  lossPercent: 0,
  minRttMs: 12.3,
  avgRttMs: 12.3,
  maxRttMs: 12.3,
  samples: [{ seq: 1, rttMs: 12.3 }],
  commandHint: "globalping.measure('ping', 'example.com')",
}

function renderPanel(
  options: {
    result?: PingProbeResult | null
    loading?: boolean
    streamingSamples?: PingProbeResult["samples"]
    onRun?: (target: string, count: number) => void
    onCancel?: () => void
    canCancel?: boolean
    cancelRequested?: boolean
    remoteMode?: boolean
    remoteResult?: GlobalpingPingResult | null
    platform?: string
  } = {},
) {
  return render(
    <PingPanel
      loading={options.loading ?? false}
      result={options.result ?? null}
      remoteResult={options.remoteResult}
      streamingSamples={options.streamingSamples}
      remoteMode={options.remoteMode}
      platform={options.platform ?? "macos"}
      toolEnabled={true}
      canCancel={options.canCancel}
      cancelRequested={options.cancelRequested}
      onRun={options.onRun ?? vi.fn()}
      onCancel={options.onCancel}
    />,
  )
}

afterEach(() => cleanup())

describe("PingPanel", () => {
  it("localizes missed replies and keeps raw diagnostics collapsed", () => {
    renderPanel({ result: timeoutResult })

    expect(screen.getByText("networkProbe.ping.noRepliesMacHint")).toBeTruthy()
    const failure = screen.getByText("networkProbe.ping.noResponse")
    expect(failure.textContent).not.toContain(timeoutResult.samples[0].error)
    const details = screen.getByText("networkProbe.ping.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(timeoutResult.samples[0].error)
  })

  it("keeps the successful local command collapsed in technical details", () => {
    renderPanel({ result: successResult })

    const command = screen.getByText(successResult.commandHint)
    const details = command.closest("details")

    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(successResult.commandHint)
    expect(screen.getByRole("table", { name: "networkProbe.ping.liveResults" })).toBeTruthy()
  })

  it("keeps the original local target associated with the result after editing the input", () => {
    renderPanel({ result: successResult })

    const targetLabel = "networkProbe.probe.resultFor:127.0.0.1"
    expect(screen.getByText(targetLabel)).toBeTruthy()

    fireEvent.change(screen.getByLabelText("networkProbe.ping.target"), {
      target: { value: "127.0.0.2" },
    })

    expect(screen.getByText(targetLabel)).toBeTruthy()
  })

  it("keeps the Globalping command collapsed in technical details", () => {
    renderPanel({ remoteMode: true, remoteResult: remoteSuccessResult })

    const command = screen.getByText(remoteSuccessResult.commandHint)
    const details = command.closest("details")

    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(remoteSuccessResult.commandHint)
  })

  it("shows the target used for the Globalping result", () => {
    renderPanel({ remoteMode: true, remoteResult: remoteSuccessResult })

    expect(screen.getByText("networkProbe.probe.resultFor:example.com")).toBeTruthy()
  })

  it("uses platform-neutral missed-reply guidance outside macOS", () => {
    renderPanel({ result: timeoutResult, platform: "windows" })

    expect(screen.getByText("networkProbe.ping.noRepliesHint")).toBeTruthy()
    expect(screen.queryByText("networkProbe.ping.noRepliesMacHint")).toBeNull()
  })

  it.each(["0", "21", "1.5", "-1"])("blocks an invalid packet count: %s", (value) => {
    renderPanel()
    const input = screen.getByLabelText("networkProbe.ping.count")
    fireEvent.change(input, { target: { value } })

    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("networkProbe.ping.countInvalid")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "networkProbe.ping.run" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it.each(["1", "20"])("accepts a local integer packet count at the boundary: %s", (value) => {
    const onRun = vi.fn()
    renderPanel({ onRun })
    const input = screen.getByLabelText("networkProbe.ping.count")
    fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.ping.run" }))

    expect(onRun).toHaveBeenCalledWith("1.1.1.1", Number(value))
  })

  it("enforces the Globalping packet limit", () => {
    renderPanel({ remoteMode: true })
    const input = screen.getByLabelText("networkProbe.ping.count")
    fireEvent.change(input, { target: { value: "17" } })

    expect(input.getAttribute("max")).toBe("16")
    expect(
      screen.getByRole("button", { name: "networkProbe.ping.run" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it("renders streamed local samples in a live table before the run completes", () => {
    renderPanel({
      loading: true,
      streamingSamples: [{ seq: 0, ok: true, rttMs: 12.3 }],
    })

    expect(screen.getByRole("table", { name: "networkProbe.ping.liveResults" })).toBeTruthy()
    expect(screen.getByText("networkProbe.ping.sequence")).toBeTruthy()
    expect(screen.getByText("networkProbe.ping.reply")).toBeTruthy()
    expect(screen.getByText("12.3 ms")).toBeTruthy()
    expect(screen.getByLabelText("networkProbe.ping.target").hasAttribute("disabled")).toBe(true)
  })

  it("lets the user cancel a local run and reports the cancelling state", () => {
    const onCancel = vi.fn()
    const { rerender } = renderPanel({ loading: true, canCancel: true, onCancel })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.ping.cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()

    rerender(
      <PingPanel
        loading
        result={null}
        toolEnabled
        canCancel
        cancelRequested
        onRun={vi.fn()}
        onCancel={onCancel}
      />,
    )
    expect(
      screen.getByRole("button", { name: "networkProbe.ping.cancelling" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it("shows the partial result state after cancellation", () => {
    renderPanel({ result: { ...timeoutResult, cancelled: true } })

    expect(screen.getByText("networkProbe.ping.cancelled")).toBeTruthy()
  })

  it("does not offer cancellation for Globalping requests", () => {
    renderPanel({ loading: true, remoteMode: true, canCancel: true })

    expect(screen.queryByRole("button", { name: "networkProbe.ping.cancel" })).toBeNull()
  })
})
