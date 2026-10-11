import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PcapDiagPanel } from "@/features/network-probe/components/PcapDiagPanel"
import type { PcapDiagResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === "networkProbe.pcap.stats"
        ? `Packets=${options?.packets} · RST=${options?.rst} · retransmit hints≈${options?.retrans} · out-of-order hints≈${options?.ooo}`
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

vi.mock("@/features/network-probe/components/ScanCancelButton", () => ({
  ScanCancelButton: () => null,
}))

const completeResult: PcapDiagResult = {
  mode: "tcpdump-counters",
  packets: 12,
  tcpRst: 1,
  retransHint: 2,
  outOfOrderHint: 0,
  cancelled: false,
  sessionId: "session-123",
  message: "Counter-only sample via tcpdump; no full pcap written. Payload not retained.",
  elapsedMs: 100,
  commandHint: "startPacketCapture(local, {secs:5}) // sessionId=session-123",
}

function renderPanel(result: PcapDiagResult) {
  return render(
    <PcapDiagPanel
      loading={false}
      result={result}
      toolEnabled
      canCancel={false}
      cancelRequested={false}
      onRun={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

afterEach(() => cleanup())

describe("PcapDiagPanel", () => {
  it("localizes the counter result and keeps raw diagnostics and command folded", () => {
    renderPanel(completeResult)

    expect(screen.getByText("networkProbe.pcap.statusValue.complete")).toBeTruthy()
    expect(screen.getByText("networkProbe.pcap.modeValue.counters")).toBeTruthy()
    expect(
      screen.getByText("Packets=12 · RST=1 · retransmit hints≈2 · out-of-order hints≈0"),
    ).toBeTruthy()

    const title = screen.getByText("networkProbe.pcap.technicalDetails")
    const details = title.closest("details")
    expect(details?.open).toBe(false)
    for (const value of [completeResult.message!, completeResult.commandHint]) {
      expect(screen.getByText(value).closest("details")).toBe(details)
    }
  })

  it("does not present failed or unknown modes as a zero-packet sample", () => {
    const failureMessage = "tcpdump failed: Operation not permitted"
    const failureCommand = "startPacketCapture(local, {secs:5}) // sessionId=session-456"
    renderPanel({
      ...completeResult,
      mode: "unavailable",
      packets: 0,
      tcpRst: 0,
      retransHint: 0,
      outOfOrderHint: 0,
      message: failureMessage,
      commandHint: failureCommand,
    })

    expect(screen.getByText("networkProbe.pcap.statusValue.unavailable")).toBeTruthy()
    expect(screen.queryByText("networkProbe.pcap.mode")).toBeNull()
    expect(screen.getByText("networkProbe.pcap.noSample")).toBeTruthy()
    expect(
      screen.queryByText("Packets=0 · RST=0 · retransmit hints≈0 · out-of-order hints≈0"),
    ).toBeNull()

    const details = screen.getByText("networkProbe.pcap.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText(failureMessage).closest("details")).toBe(details)
    expect(screen.getByText(failureCommand).closest("details")).toBe(details)
  })

  it("localizes cancellation and unknown mode fallbacks", () => {
    const { rerender } = renderPanel({ ...completeResult, cancelled: true })
    expect(screen.getByText("networkProbe.pcap.statusValue.cancelled")).toBeTruthy()

    rerender(
      <PcapDiagPanel
        loading={false}
        result={{ ...completeResult, mode: "future-mode", cancelled: false }}
        toolEnabled
        canCancel={false}
        cancelRequested={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText("networkProbe.pcap.statusValue.unknown")).toBeTruthy()
    expect(screen.queryByText("networkProbe.pcap.mode")).toBeNull()
    expect(screen.queryByText("future-mode")).toBeNull()
  })

  it("keeps packet sampling disabled when the tool is unavailable", () => {
    render(
      <PcapDiagPanel
        loading={false}
        result={null}
        toolEnabled={false}
        canCancel={false}
        cancelRequested={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "networkProbe.pcap.run" })).toBeDisabled()
  })
})
