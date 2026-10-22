import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { ReportPanel } from "@/features/network-probe/components/ReportPanel"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const healthScan: HealthScanResult = {
  sessionId: "scan-1",
  elapsedMs: 100,
  cancelled: false,
  commandHint: "runHealthScan()",
  items: [],
  opinions: [],
}

function makeProps(overrides: Partial<ComponentProps<typeof ReportPanel>> = {}) {
  return {
    health: null,
    history: [healthScan],
    commandLog: ["runHealthScan()"],
    onClearLog: vi.fn(),
    onClearHistory: vi.fn(),
    onGoTree: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof ReportPanel>
}

describe("ReportPanel destructive actions", () => {
  it("requires confirmation before clearing report history and command log", () => {
    const props = makeProps()
    render(<ReportPanel {...props} />)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearHistory" }))
    expect(props.onClearHistory).not.toHaveBeenCalled()
    const historyDialog = screen.getByRole("alertdialog")
    fireEvent.click(within(historyDialog).getByRole("button", { name: "common.cancel" }))
    expect(props.onClearHistory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearHistory" }))
    const confirmHistoryDialog = screen.getByRole("alertdialog")
    fireEvent.click(
      within(confirmHistoryDialog).getByRole("button", {
        name: "networkProbe.report.clearHistory",
      }),
    )
    expect(props.onClearHistory).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearLog" }))
    expect(props.onClearLog).not.toHaveBeenCalled()
    const logDialog = screen.getByRole("alertdialog")
    fireEvent.click(within(logDialog).getByRole("button", { name: "common.cancel" }))
    expect(props.onClearLog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearLog" }))
    const confirmLogDialog = screen.getByRole("alertdialog")
    fireEvent.click(
      within(confirmLogDialog).getByRole("button", { name: "networkProbe.report.clearLog" }),
    )
    expect(props.onClearLog).toHaveBeenCalledOnce()
  })

  it("disables clearing an empty command log", () => {
    const props = makeProps({ history: [], commandLog: [] })
    render(<ReportPanel {...props} />)

    expect(screen.getByRole("button", { name: "networkProbe.report.clearLog" })).toBeDisabled()
  })
})
