import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReportPanel } from "@/features/network-probe/components/ReportPanel"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    confirmLabel: string
    cancelLabel: string
    onConfirm: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        <button type="button" onClick={() => onOpenChange(false)}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
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
  it("requires confirmation before clearing saved health history", () => {
    const onClearHistory = vi.fn()
    const health: HealthScanResult = {
      items: [],
      opinions: [],
      elapsedMs: 42,
      sessionId: "session-123",
      cancelled: false,
      commandHint: "startHealthScan(local)",
    }

    render(
      <ReportPanel
        health={health}
        history={[health]}
        commandLog={[]}
        onClearLog={vi.fn()}
        onClearHistory={onClearHistory}
        onGoTree={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearHistory" }))

    expect(onClearHistory).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "networkProbe.report.clearHistoryConfirmTitle",
    )
    expect(
      screen.getByText("networkProbe.report.clearHistoryConfirmDescription"),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }))
    expect(onClearHistory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearHistory" }))
    fireEvent.click(screen.getAllByRole("button", { name: "networkProbe.report.clearHistory" })[1])
    expect(onClearHistory).toHaveBeenCalledOnce()
  })

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
