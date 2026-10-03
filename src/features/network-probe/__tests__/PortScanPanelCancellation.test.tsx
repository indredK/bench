import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PortSampleEvent, PortScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"

describe("PortScanPanel cancelled results", () => {
  it("hides open ports and streaming samples from a cancelled scan", () => {
    const staleSample: PortSampleEvent = { port: 80, state: "open" }
    const result: PortScanResult = {
      target: "127.0.0.1",
      mode: "nmap-syn-or-connect",
      openPorts: [22],
      samples: [{ port: 22, state: "open" }],
      cancelled: true,
      sessionId: "cancelled-session",
      message: "Port scan cancelled.",
      commandHint: "scanPorts cancelled",
    }

    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={result}
        streaming={[staleSample]}
        toolEnabled
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.ports.cancelledPartial")).toBeInTheDocument()
    expect(screen.queryByText("networkProbe.ports.openList")).not.toBeInTheDocument()
    expect(screen.queryByText("22: open")).not.toBeInTheDocument()
    expect(screen.queryByText("80: open")).not.toBeInTheDocument()
  })
})
