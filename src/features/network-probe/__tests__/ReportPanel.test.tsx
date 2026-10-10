import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReportPanel } from "@/features/network-probe/components/ReportPanel"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

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

describe("ReportPanel", () => {
  it("does not repeat the raw session-specific command already available in the command log", () => {
    const health: HealthScanResult = {
      items: [],
      opinions: [],
      elapsedMs: 42,
      sessionId: "session-123",
      cancelled: false,
      commandHint: "startHealthScan(local) // sessionId=session-123",
    }

    render(
      <ReportPanel
        health={health}
        history={[]}
        commandLog={["startHealthScan(local)", "healthScan done sessionId=session-123 items=21"]}
        onClearLog={vi.fn()}
        onClearHistory={vi.fn()}
        onGoTree={vi.fn()}
      />,
    )

    expect(screen.queryByText(health.commandHint)).not.toBeInTheDocument()
    expect(screen.getByText("healthScan done sessionId=session-123 items=21")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.report.privacyHint")).toBeInTheDocument()
  })
})
