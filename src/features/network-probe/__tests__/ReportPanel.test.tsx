import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { HealthReportSnapshot } from "@/features/network-probe/report-history"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

const { t } = vi.hoisted(() => {
  const messages: Record<string, string> = {
    "networkProbe.report.hint": "Export a health report.",
    "networkProbe.report.empty": "No scan yet.",
    "networkProbe.report.goTree": "Go to health scan",
    "networkProbe.report.historyTitle": "Recent health snapshots",
    "networkProbe.report.clearHistory": "Clear history",
    "networkProbe.report.clearHistoryTitle": "Clear health history?",
    "networkProbe.report.clearHistoryDescription": "Remove saved health snapshots?",
    "networkProbe.report.clearHistoryConfirm": "Clear history",
    "networkProbe.report.cancel": "Cancel",
    "networkProbe.report.historyEmpty": "No saved scans.",
    "networkProbe.report.historyPrivacyHint": "Snapshots stay on this device.",
    "networkProbe.report.timeUnknown": "Time unavailable",
    "networkProbe.report.compareWith": "Compare latest scan with",
    "networkProbe.report.comparingSnapshots":
      "Comparing {{previous}} with {{current}} · {{count}} changes",
    "networkProbe.report.compareStatusOnly": "Only check statuses are compared.",
    "networkProbe.report.changesLabel": "Health check status changes",
    "networkProbe.report.noStatusChanges": "No status changes.",
    "networkProbe.report.needTwoSnapshots": "Run another scan to compare.",
    "networkProbe.report.notPresent": "Not present",
    "networkProbe.report.historyItem": "{{session}} · {{count}} checks",
    "networkProbe.report.logTitle": "Command log",
    "networkProbe.report.clearLog": "Clear log",
    "networkProbe.report.logEmpty": "No commands.",
    "networkProbe.report.logSideHint": "Live IPC log.",
    "networkProbe.health.status.pass": "pass",
    "networkProbe.health.status.warn": "warn",
    "networkProbe.health.status.fail": "fail",
  }
  return {
    t: (key: string, options?: Record<string, unknown>) => {
      let value = messages[key] ?? String(options?.defaultValue ?? key)
      for (const [name, replacement] of Object.entries(options ?? {})) {
        if (name === "defaultValue") continue
        value = value.replaceAll(`{{${name}}}`, String(replacement))
      }
      return value
    },
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "en", resolvedLanguage: "en" } }),
}))
vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))
vi.mock("@/components/ui/button", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
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
        <button type="button" onClick={() => onOpenChange(false)}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}))

import { ReportPanel } from "@/features/network-probe/components/ReportPanel"

afterEach(cleanup)

function createSnapshot(
  sessionId: string,
  items: HealthScanResult["items"],
  capturedAt: string | null = "2026-10-03T10:00:00.000Z",
): HealthReportSnapshot {
  return {
    capturedAt,
    result: {
      items,
      opinions: [],
      elapsedMs: 30,
      sessionId,
      cancelled: false,
      commandHint: "startHealthScan(local)",
    },
  }
}

function renderReport(history: HealthReportSnapshot[], onClearHistory = vi.fn()) {
  return render(
    <ReportPanel
      health={null}
      history={history}
      commandLog={[]}
      onClearLog={vi.fn()}
      onClearHistory={onClearHistory}
      onGoTree={vi.fn()}
    />,
  )
}

describe("ReportPanel history comparison", () => {
  it("compares the latest scan with a selectable older snapshot by status", () => {
    const older = createSnapshot("scan-old", [
      { key: "dns", layer: "L1", status: "fail" },
      { key: "removed", layer: "L2", status: "pass" },
    ])
    const middle = createSnapshot("scan-mid", [
      { key: "dns", layer: "L1", status: "pass" },
      { key: "added", layer: "L2", status: "warn" },
    ])
    const latest = createSnapshot("scan-new", [
      { key: "dns", layer: "L1", status: "pass" },
      { key: "added", layer: "L2", status: "warn" },
    ])
    renderReport([latest, middle, older])

    const baseline = screen.getByRole("combobox", { name: "Compare latest scan with" })
    expect(screen.getByRole("status")).toHaveTextContent("No status changes.")
    fireEvent.change(baseline, { target: { value: "scan-old" } })

    const comparison = screen.getByRole("list", { name: "Health check status changes" })
    expect(within(comparison).getAllByRole("listitem")).toHaveLength(3)
    expect(within(comparison).getByText("dns")).toBeInTheDocument()
    expect(within(comparison).getByText("fail")).toBeInTheDocument()
    expect(within(comparison).getAllByText("pass")).toHaveLength(2)
    expect(within(comparison).getAllByText("Not present")).toHaveLength(2)
    expect(screen.getByText("Only check statuses are compared.")).toBeInTheDocument()
  })

  it("asks before clearing local history and preserves it when cancelled", () => {
    const onClearHistory = vi.fn()
    renderReport(
      [createSnapshot("scan-only", [{ key: "dns", layer: "L1", status: "pass" }])],
      onClearHistory,
    )

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }))
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }))
    expect(onClearHistory).not.toHaveBeenCalled()
    expect(screen.getByText("scan-onl · 1 checks")).toBeInTheDocument()
  })
})
