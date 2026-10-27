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

function renderReport(
  onClearHistory: () => void,
  onClearLog: () => void = vi.fn(),
  commandLog = ["2026-10-13T00:00:00.000Z startHealthScan(local)"],
  embedded = false,
) {
  return render(
    <ReportPanel
      health={null}
      history={[historyItem]}
      commandLog={commandLog}
      onClearLog={onClearLog}
      onClearHistory={onClearHistory}
      onGoTree={vi.fn()}
      embedded={embedded}
    />,
  )
}

describe("network-probe report clear confirmations", () => {
  it("uses nested headings for report subsections in the integrated basic view", () => {
    renderReport(vi.fn(), vi.fn(), undefined, true)

    expect(
      screen.getByRole("heading", { name: "networkProbe.report.historyTitle", level: 4 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "networkProbe.report.logTitle", level: 4 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "networkProbe.report.comparison.title", level: 4 }),
    ).toBeInTheDocument()
  })

  it("keeps standalone report subsection headings at level three", () => {
    renderReport(vi.fn())

    expect(
      screen.getByRole("heading", { name: "networkProbe.report.historyTitle", level: 3 }),
    ).toBeInTheDocument()
  })

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

  it("keeps command logs when the user cancels the confirmation", async () => {
    const onClearLog = vi.fn()
    renderReport(vi.fn(), onClearLog)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearLog" }))
    const dialog = screen.getByRole("alertdialog")

    expect(
      within(dialog).getByText("networkProbe.sideLog.clearConfirmDescription"),
    ).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "common.cancel" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByText("2026-10-13T00:00:00.000Z startHealthScan(local)")).toBeInTheDocument()
    expect(onClearLog).not.toHaveBeenCalled()
  })

  it("clears command logs only after confirmation and disables clearing when empty", async () => {
    const onClearLog = vi.fn()
    const { rerender } = renderReport(vi.fn(), onClearLog)

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearLog" }))
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "networkProbe.sideLog.clear",
      }),
    )

    expect(onClearLog).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())

    rerender(
      <ReportPanel
        health={null}
        history={[historyItem]}
        commandLog={[]}
        onClearLog={onClearLog}
        onClearHistory={vi.fn()}
        onGoTree={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: "networkProbe.report.clearLog" })).toBeDisabled()
  })
})
