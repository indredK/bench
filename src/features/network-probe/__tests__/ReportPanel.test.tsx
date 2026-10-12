import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReportPanel } from "@/features/network-probe/components/ReportPanel"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

const historyItem: HealthScanResult = {
  items: [],
  opinions: [],
  elapsedMs: 1,
  sessionId: "session-1",
  cancelled: false,
  commandHint: "startHealthScan(local)",
}

function renderReport(onClearHistory: () => void) {
  return render(
    <ReportPanel
      health={null}
      history={[historyItem]}
      commandLog={[]}
      onClearLog={vi.fn()}
      onClearHistory={onClearHistory}
      onGoTree={vi.fn()}
    />,
  )
}

describe("network-probe report history clearing", () => {
  it("keeps history when the user cancels the confirmation", async () => {
    const onClearHistory = vi.fn()
    renderReport(onClearHistory)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearHistory" }))
    const dialog = screen.getByRole("alertdialog")

    expect(
      within(dialog).getByText("networkProbe.report.clearHistoryConfirm.consequence"),
    ).toBeInTheDocument()
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "networkProbe.report.clearHistoryConfirm.cancel",
      }),
    )

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByText("networkProbe.report.historyItem")).toBeInTheDocument()
    expect(onClearHistory).not.toHaveBeenCalled()
  })

  it("clears history only after the destructive confirmation", () => {
    const onClearHistory = vi.fn()
    renderReport(onClearHistory)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearHistory" }))
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "networkProbe.report.clearHistoryConfirm.confirm",
      }),
    )

    expect(onClearHistory).toHaveBeenCalledOnce()
  })
})
