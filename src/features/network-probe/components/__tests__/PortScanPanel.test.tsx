/**
 * Test / 测试: show localized messages based on the actual scanner mode.
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { PortScanPanel } from "../PortScanPanel"
import type { NetworkFingerprintResult, PortScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: ({
    open,
    title,
    onConfirm,
  }: {
    open: boolean
    title: string
    onConfirm: () => void
  }) =>
    open ? (
      <div role="dialog">
        <p>{title}</p>
        <button type="button" onClick={onConfirm}>
          confirm
        </button>
      </div>
    ) : null,
}))

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))

function createResult(mode: string, cancelled = false): PortScanResult {
  return {
    target: "127.0.0.1",
    mode,
    openPorts: [],
    samples: [],
    cancelled,
    sessionId: "session-1",
    message: "English backend message that must not leak into the UI",
    commandHint: "scanPorts(local)",
  }
}

function renderPanel(
  result: PortScanResult | null,
  toolStatus = "supported",
  fingerprintResult: NetworkFingerprintResult | null = null,
  fingerprintAvailable = false,
  onFingerprint = vi.fn(),
) {
  return render(
    <PortScanPanel
      loading={false}
      canCancel={false}
      result={result}
      streaming={[]}
      fingerprintResult={fingerprintResult}
      fingerprintAvailable={fingerprintAvailable}
      nmapStatus={fingerprintAvailable ? "found" : "not_found"}
      toolEnabled
      toolStatus={toolStatus}
      onRun={() => {}}
      onFingerprint={onFingerprint}
      onCancel={() => {}}
    />,
  )
}

describe("PortScanPanel", () => {
  it("localizes the degraded TCP-connect result without repeating backend English", () => {
    renderPanel(createResult("tcp-connect"))

    expect(screen.getByText("networkProbe.ports.degradedHint")).toBeInTheDocument()
    expect(screen.queryByText(/English backend message/)).not.toBeInTheDocument()
  })

  it("describes nmap mode accurately instead of claiming TCP-connect-only", () => {
    renderPanel(createResult("nmap-syn-or-connect"))

    expect(screen.getByText("networkProbe.ports.nmapModeHint")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.ports.degradedHint")).not.toBeInTheDocument()
  })

  it("shows a localized cancellation result", () => {
    renderPanel(createResult("tcp-connect", true))

    expect(screen.getByText("networkProbe.ports.cancelledResult")).toBeInTheDocument()
    expect(screen.queryByText(/English backend message/)).not.toBeInTheDocument()
  })

  it("shows the degraded hint before a scan only when capabilities say degraded", () => {
    renderPanel(null, "degraded")
    expect(screen.getByText("networkProbe.ports.degradedHint")).toBeInTheDocument()
  })

  it("explains that Nmap is required and disables fingerprinting when it is missing", () => {
    renderPanel(null)

    expect(screen.getByText("networkProbe.ports.nmapRequired")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "networkProbe.ports.fingerprintRun" })).toBeDisabled()
  })

  it("confirms the active probe scope and forwards the optional OS choice", () => {
    const onFingerprint = vi.fn()
    renderPanel(null, "supported", null, true, onFingerprint)

    fireEvent.click(screen.getByRole("checkbox", { name: "networkProbe.ports.includeOs" }))
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.ports.fingerprintRun" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.fingerprintConfirmTitle")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "confirm" }))

    expect(onFingerprint).toHaveBeenCalledWith("127.0.0.1", "22,80,443,8080", true)
  })

  it("shows detected service risks as cautions and labels OS output as a guess", () => {
    renderPanel(
      null,
      "supported",
      {
        target: "127.0.0.1",
        services: [
          {
            port: 6379,
            protocol: "tcp",
            name: "redis",
            product: "Redis",
            version: "7.2.4",
            confidence: 100,
            cpe: [],
            riskTags: ["database-service"],
          },
        ],
        osStatus: "detected",
        osMatches: [{ name: "Linux 6.8", accuracy: 97, classes: ["Linux · 6.X"], cpe: [] }],
        cancelled: false,
        sessionId: "session-1",
        commandHint: "fingerprint(local)",
      },
      true,
    )

    expect(screen.getByText(/6379\/tcp · redis · Redis · 7.2.4/)).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.risks.database")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.osStatus.detected")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.ports.osGuessDisclaimer")).toBeInTheDocument()
  })
})
