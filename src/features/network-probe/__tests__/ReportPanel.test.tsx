import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"
import { ReportPanel } from "../components/ReportPanel"

const translations: Record<string, string> = {
  "networkProbe.report.hint": "导出最近一次体检，并浏览本会话命令日志。",
  "networkProbe.report.empty": "尚无体检结果。",
  "networkProbe.report.goTree": "前往体检",
  "networkProbe.report.historyTitle": "近期体检快照",
  "networkProbe.report.historyEmpty": "暂无历史",
  "networkProbe.report.historyItem":
    "{{session}}… · {{count}} 项检查 · {{ms}} ms · {{opinions}} 条建议",
  "networkProbe.report.clearHistory": "清空历史",
  "networkProbe.report.clearHistoryConfirmTitle": "清空体检历史？",
  "networkProbe.report.clearHistoryConfirmDescription":
    "这会从本机删除最近保存的体检快照，无法在 Bench 中恢复。",
  "networkProbe.report.clearHistoryConfirmAction": "清空历史",
  "networkProbe.report.clearHistoryConfirmCancel": "保留历史",
  "networkProbe.report.logTitle": "命令日志",
  "networkProbe.report.clearLog": "清空日志",
  "networkProbe.report.logSideHint": "宽屏下实时 IPC 日志也会显示在右侧栏。",
  "networkProbe.report.logEmpty": "本会话尚无命令记录。",
  "networkProbe.report.title": "网络体检报告",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = translations[key] ?? key
      return template.replace(/{{(\w+)}}/g, (_match, name: string) => String(options?.[name] ?? ""))
    },
  }),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      <div>{toolbar}</div>
      {children}
    </div>
  ),
}))

const historyEntry = {
  sessionId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
  elapsedMs: 12,
  cancelled: false,
  commandHint: "startHealthScan(local)",
  items: [],
  opinions: [],
} as HealthScanResult

function renderReport(onClearHistory = vi.fn()) {
  render(
    <ReportPanel
      health={null}
      history={[historyEntry]}
      commandLog={[]}
      onClearLog={vi.fn()}
      onClearHistory={onClearHistory}
      onGoTree={vi.fn()}
    />,
  )
  return onClearHistory
}

describe("ReportPanel history clearing", () => {
  it("requires confirmation and keeps history when the user cancels", () => {
    const onClearHistory = renderReport()

    fireEvent.click(screen.getByRole("button", { name: "清空历史" }))

    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(
      screen.getByText("这会从本机删除最近保存的体检快照，无法在 Bench 中恢复。"),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "保留历史" }))

    expect(onClearHistory).not.toHaveBeenCalled()
    expect(screen.getByText(/12345678/)).toBeInTheDocument()
  })

  it("clears history only after confirmation", async () => {
    const onClearHistory = renderReport()

    fireEvent.click(screen.getByRole("button", { name: "清空历史" }))
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "清空历史" }),
    )

    await waitFor(() => expect(onClearHistory).toHaveBeenCalledTimes(1))
  })
})
