import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DiagnosticsPanel } from "./DiagnosticsPanel"

const mocks = vi.hoisted(() => ({
  getExtensionDiagnostics: vi.fn(),
  locale: "en" as "en" | "zh",
}))

const translations = {
  en: {
    "extensionCenter.refresh": "Refresh",
    "extensionCenter.retry": "Retry",
    "extensionCenter.diagnostics.hint": "Extension diagnostics",
    "extensionCenter.diagnostics.audit": "Audit log",
    "extensionCenter.diagnostics.runtime": "Runtime diagnostics",
    "extensionCenter.diagnostics.empty": "No records",
    "extensionCenter.diagnostics.filteredEmpty": "No records match this type",
    "extensionCenter.diagnostics.filterLabel": "Runtime diagnostic type",
    "extensionCenter.diagnostics.filters.all": "All",
    "extensionCenter.diagnostics.filters.windowError": "Window errors",
    "extensionCenter.diagnostics.filters.unhandledRejection": "Unhandled rejections",
    "extensionCenter.diagnostics.filters.consoleError": "Console errors",
    "extensionCenter.diagnostics.filters.boot": "Startup",
    "extensionCenter.diagnostics.filters.other": "Other",
    "extensionCenter.diagnostics.loadFailed": "Failed to load diagnostics",
    "extensionCenter.diagnostics.refreshFailed": "Failed to refresh diagnostics",
    "extensionCenter.diagnostics.refreshing": "Refreshing diagnostics…",
    "extensionCenter.diagnostics.loading": "Loading diagnostics",
  },
  zh: {
    "extensionCenter.refresh": "刷新",
    "extensionCenter.retry": "重试",
    "extensionCenter.diagnostics.hint": "插件诊断",
    "extensionCenter.diagnostics.audit": "审计日志",
    "extensionCenter.diagnostics.runtime": "运行时诊断",
    "extensionCenter.diagnostics.empty": "暂无记录",
    "extensionCenter.diagnostics.filteredEmpty": "此类型暂无记录",
    "extensionCenter.diagnostics.filterLabel": "运行时诊断类型",
    "extensionCenter.diagnostics.filters.all": "全部",
    "extensionCenter.diagnostics.filters.windowError": "页面错误",
    "extensionCenter.diagnostics.filters.unhandledRejection": "未处理的 Promise 拒绝",
    "extensionCenter.diagnostics.filters.consoleError": "控制台错误",
    "extensionCenter.diagnostics.filters.boot": "启动记录",
    "extensionCenter.diagnostics.filters.other": "其他",
    "extensionCenter.diagnostics.loadFailed": "诊断信息加载失败",
    "extensionCenter.diagnostics.refreshFailed": "刷新诊断信息失败",
    "extensionCenter.diagnostics.refreshing": "正在刷新诊断…",
    "extensionCenter.diagnostics.loading": "正在加载诊断记录",
  },
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[mocks.locale][key as keyof (typeof translations)["en"]] ?? key,
  }),
}))

vi.mock("@/lib/tauri/commands/extension-center", () => ({
  getExtensionDiagnostics: mocks.getExtensionDiagnostics,
}))

describe("DiagnosticsPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.locale = "en"
    mocks.getExtensionDiagnostics.mockResolvedValue({ audit: [], runtime: [] })
  })

  it("filters runtime JSONL by kind and keeps unknown and legacy records under Other", async () => {
    const windowError = JSON.stringify({ kind: "window-error", message: "render failed" })
    const boot = JSON.stringify({ kind: "boot", message: "window loaded" })
    const unknown = JSON.stringify({ kind: "future-event", message: "new runtime event" })
    const legacy = "old diagnostic format"
    mocks.getExtensionDiagnostics.mockResolvedValue({
      audit: ["audit record"],
      runtime: [windowError, boot, unknown, legacy],
    })

    render(<DiagnosticsPanel />)

    expect(await screen.findByText("audit record")).toBeInTheDocument()
    const filters = screen.getByRole("group", { name: "Runtime diagnostic type" })
    expect(filters).toBeInTheDocument()
    expect(screen.getByText(windowError)).toBeInTheDocument()
    expect(screen.getByText(boot)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Other (2)" }))
    expect(screen.getByText(unknown)).toBeInTheDocument()
    expect(screen.getByText(legacy)).toBeInTheDocument()
    expect(screen.queryByText(windowError)).not.toBeInTheDocument()
    expect(screen.getByText("audit record")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Window errors (1)" }))
    expect(screen.getByText(windowError)).toBeInTheDocument()
    expect(screen.queryByText(unknown)).not.toBeInTheDocument()
  })

  it("keeps successful logs visible after a refresh fails and replaces them after retry", async () => {
    mocks.getExtensionDiagnostics
      .mockResolvedValueOnce({ audit: ["audit before refresh"], runtime: ["legacy runtime"] })
      .mockRejectedValueOnce({ code: "IO_ERROR", message: "offline" })
      .mockResolvedValueOnce({ audit: ["audit after retry"], runtime: [] })

    render(<DiagnosticsPanel />)

    expect(await screen.findByText("audit before refresh")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to refresh diagnostics")
    expect(screen.getByText("audit before refresh")).toBeInTheDocument()
    expect(screen.getByText("legacy runtime")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByText("audit after retry")).toBeInTheDocument()
    expect(screen.queryByText("audit before refresh")).not.toBeInTheDocument()
  })

  it("offers retry after the first load fails", async () => {
    mocks.getExtensionDiagnostics
      .mockRejectedValueOnce({ code: "IO_ERROR", message: "offline" })
      .mockResolvedValueOnce({ audit: ["recovered audit"], runtime: [] })

    render(<DiagnosticsPanel />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load diagnostics")
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByText("recovered audit")).toBeInTheDocument()
  })

  it("shows a matching skeleton during the first load", async () => {
    mocks.getExtensionDiagnostics.mockReturnValue(new Promise(() => {}))

    render(<DiagnosticsPanel />)

    expect(await screen.findByRole("status", { name: "Loading diagnostics" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled()
  })

  it("updates filter labels when the interface language changes", async () => {
    const { rerender } = render(<DiagnosticsPanel />)
    expect(
      await screen.findByRole("group", { name: "Runtime diagnostic type" }),
    ).toBeInTheDocument()

    mocks.locale = "zh"
    rerender(<DiagnosticsPanel />)

    expect(await screen.findByRole("group", { name: "运行时诊断类型" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "全部 (0)" })).toBeInTheDocument()
  })
})
