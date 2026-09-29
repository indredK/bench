import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { HealthReportSnapshot } from "@/features/network-probe/report-history"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"
import { ReportPanel } from "../ReportPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { resolvedLanguage: "en" },
  }),
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean
    title: string
    description: string
    confirmLabel: string
    cancelLabel: string
    onConfirm: () => void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div role="alertdialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button onClick={() => onOpenChange(false)}>{cancelLabel}</button>
        <button
          onClick={() => {
            void onConfirm()
            onOpenChange(false)
          }}
        >
          {confirmLabel}
        </button>
      </div>
    ) : null,
}))

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
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

function createResult(sessionId: string, status: string): HealthScanResult {
  return {
    items: [{ key: "reach.public_ip", layer: "L3", status }],
    opinions: [],
    elapsedMs: 10,
    sessionId,
    cancelled: false,
    commandHint: "startHealthScan(local)",
  }
}

function createSnapshot(
  sessionId: string,
  status: string,
  capturedAt: number,
): HealthReportSnapshot {
  return { capturedAt, result: createResult(sessionId, status) }
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof ReportPanel>> = {}) {
  const props: React.ComponentProps<typeof ReportPanel> = {
    health: null,
    history: [],
    historyEnabled: true,
    commandLog: [],
    onClearLog: vi.fn(),
    onClearHistory: vi.fn(),
    onSetHistoryEnabled: vi.fn(),
    onGoTree: vi.fn(),
    ...overrides,
  }
  return { ...render(<ReportPanel {...props} />), props }
}

describe("ReportPanel history", () => {
  it("defaults to the latest two snapshots and compares from baseline to selected scan", () => {
    renderPanel({
      history: [
        createSnapshot("latest", "pass", 1_790_000_000_000),
        createSnapshot("baseline", "fail", 1_789_000_000_000),
      ],
    })

    expect(
      screen.getByRole("combobox", { name: "networkProbe.report.compareBaseline" }),
    ).toHaveValue("baseline")
    expect(
      screen.getByRole("combobox", { name: "networkProbe.report.compareAgainst" }),
    ).toHaveValue("latest")
    expect(screen.getByText("networkProbe.report.change.improved")).toBeInTheDocument()
    expect(screen.getByText("networkProbe.report.change.improved:")).toBeInTheDocument()
  })

  it("requires confirmation before clearing snapshots or disabling local history", () => {
    const onClearHistory = vi.fn()
    const onSetHistoryEnabled = vi.fn()
    renderPanel({
      history: [createSnapshot("snapshot", "pass", 1_790_000_000_000)],
      onClearHistory,
      onSetHistoryEnabled,
    })

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.report.clearHistory" }))
    expect(onClearHistory).not.toHaveBeenCalled()
    const clearHistoryDialog = screen.getByRole("alertdialog")
    fireEvent.click(
      within(clearHistoryDialog).getByRole("button", {
        name: "networkProbe.report.clearHistory",
      }),
    )
    expect(onClearHistory).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("checkbox", { name: "networkProbe.report.saveHistory" }))
    expect(onSetHistoryEnabled).not.toHaveBeenCalled()
    const disableHistoryDialog = screen.getByRole("alertdialog")
    fireEvent.click(
      within(disableHistoryDialog).getByRole("button", {
        name: "networkProbe.report.disableHistory",
      }),
    )
    expect(onSetHistoryEnabled).toHaveBeenCalledWith(false)
  })

  it("does not ask for destructive confirmation when there is no saved history", () => {
    const onSetHistoryEnabled = vi.fn()
    renderPanel({ onSetHistoryEnabled })

    fireEvent.click(screen.getByRole("checkbox", { name: "networkProbe.report.saveHistory" }))

    expect(onSetHistoryEnabled).toHaveBeenCalledWith(false)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })
})
