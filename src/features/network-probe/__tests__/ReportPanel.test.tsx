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
  "networkProbe.report.historyRank": "最近第 {{rank}} 次",
  "networkProbe.report.historyOption":
    "{{date}} · 最近第 {{rank}} 次 · {{session}}… · {{count}} 项",
  "networkProbe.report.legacySnapshotDate": "旧快照（未记录时间）",
  "networkProbe.report.comparisonTitle": "体检快照对比",
  "networkProbe.report.comparisonHint": "选择两次体检进行比较。",
  "networkProbe.report.comparisonNeedTwo": "至少完成两次体检后即可对比。",
  "networkProbe.report.snapshotA": "快照 A",
  "networkProbe.report.snapshotB": "快照 B",
  "networkProbe.report.comparisonSummary":
    "新增 {{added}} · 移除 {{removed}} · 变化 {{changed}} · 未变 {{unchanged}}",
  "networkProbe.report.showUnchanged": "同时显示未变化的检查项",
  "networkProbe.report.checkComparisonTable": "体检检查项对比",
  "networkProbe.report.checkColumn": "检查项",
  "networkProbe.report.notInSnapshot": "此快照没有该项",
  "networkProbe.report.change.changed": "内容变化",
  "networkProbe.report.change.added": "新增",
  "networkProbe.report.change.removed": "已移除",
  "networkProbe.report.change.unchanged": "未变化",
  "networkProbe.report.noCheckChanges": "检查项没有差异。",
  "networkProbe.report.opinionChanges": "建议变化",
  "networkProbe.report.noOpinionChanges": "建议没有变化。",
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
    i18n: { language: "zh-CN", resolvedLanguage: "zh-CN" },
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

function renderReport(onClearHistory = vi.fn(), history: HealthScanResult[] = [historyEntry]) {
  render(
    <ReportPanel
      health={null}
      history={history}
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

  it("compares the latest two scans and lets the user choose another snapshot", () => {
    const oldest = {
      ...historyEntry,
      sessionId: "oldest-12345678",
      items: [{ key: "dns", layer: "L0", status: "pass", detail: "resolver A" }],
    } as HealthScanResult
    const middle = {
      ...historyEntry,
      sessionId: "middle-12345678",
      items: [{ key: "dns", layer: "L0", status: "warn", detail: "resolver B" }],
    } as HealthScanResult
    const latest = {
      ...historyEntry,
      sessionId: "latest-12345678",
      items: [{ key: "dns", layer: "L0", status: "pass", detail: "resolver C" }],
    } as HealthScanResult

    renderReport(vi.fn(), [latest, middle, oldest])

    const snapshotA = screen.getByRole("combobox", { name: "快照 A" })
    const snapshotB = screen.getByRole("combobox", { name: "快照 B" })
    expect(snapshotA).toHaveValue("middle-12345678")
    expect(snapshotB).toHaveValue("latest-12345678")
    expect(screen.getByText("resolver B")).toBeInTheDocument()
    expect(screen.getByText("resolver C")).toBeInTheDocument()

    fireEvent.change(snapshotA, { target: { value: "oldest-12345678" } })

    expect(screen.getByText("resolver A")).toBeInTheDocument()
    expect(screen.getByText("resolver C")).toBeInTheDocument()
  })
})
