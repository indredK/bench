import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import type { PingProbeResult } from "@/lib/tauri/types/network-probe"

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

const timeoutResult: PingProbeResult = {
  target: "192.0.2.1",
  resolvedIp: "192.0.2.1",
  packetsSent: 1,
  packetsReceived: 0,
  lossPercent: 100,
  samples: [{ seq: 0, ok: false, error: "Request timeout for icmp_seq 0" }],
  commandHint: "pingHost(local, '192.0.2.1', {count:1})",
}

function renderPanel(
  options: {
    result?: PingProbeResult | null
    onRun?: (target: string, count: number) => void
    remoteMode?: boolean
    platform?: string
  } = {},
) {
  return render(
    <PingPanel
      loading={false}
      result={options.result ?? null}
      remoteMode={options.remoteMode}
      platform={options.platform ?? "macos"}
      toolEnabled={true}
      onRun={options.onRun ?? vi.fn()}
    />,
  )
}

afterEach(() => cleanup())

describe("PingPanel", () => {
  it("localizes missed replies and keeps raw diagnostics collapsed", () => {
    renderPanel({ result: timeoutResult })

    expect(screen.getByText("networkProbe.ping.noRepliesMacHint")).toBeTruthy()
    const failure = screen.getByText("networkProbe.ping.sampleFail")
    expect(failure.textContent).not.toContain(timeoutResult.samples[0].error)
    const details = screen.getByText("networkProbe.ping.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(timeoutResult.samples[0].error)
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
})
