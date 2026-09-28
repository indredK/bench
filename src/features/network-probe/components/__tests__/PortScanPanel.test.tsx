/**
 * Test / 测试: show localized messages based on the actual scanner mode.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { PortScanPanel } from "../PortScanPanel"
import type { PortScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
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

function renderPanel(result: PortScanResult | null, toolStatus = "supported") {
  return render(
    <PortScanPanel
      loading={false}
      canCancel={false}
      result={result}
      streaming={[]}
      toolEnabled
      toolStatus={toolStatus}
      onRun={() => {}}
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
})
