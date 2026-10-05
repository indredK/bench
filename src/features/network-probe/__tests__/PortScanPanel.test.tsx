import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import type { PortScanResult } from "@/lib/tauri/types/network-probe"

const { setLanguage, translate } = vi.hoisted(() => {
  let language: "zh" | "en" = "zh"
  const messages = {
    zh: {
      "networkProbe.ports.hint": "对授权主机扫描端口",
      "networkProbe.ports.scanModeHint": "SYN 需要权限；否则使用 TCP connect。",
      "networkProbe.ports.target": "目标",
      "networkProbe.ports.range": "端口",
      "networkProbe.ports.run": "扫描端口",
      "networkProbe.ports.openList": "开放：{{ports}}",
      "networkProbe.ports.state.open": "开放",
      "networkProbe.ports.state.closed": "关闭",
      "networkProbe.ports.state.filtered": "已过滤 / 无响应",
      "networkProbe.ports.state.error": "错误",
      "networkProbe.ports.state.unknown": "未知",
      "networkProbe.ports.mode.nmap": "使用 Nmap；按权限使用 SYN 或 TCP connect。",
      "networkProbe.ports.mode.tcpConnect": "使用 TCP connect 扫描。",
      "networkProbe.ports.mode.unknown": "扫描方式未知。",
      "networkProbe.ports.cancelled": "扫描已取消，以下为取消前收到的结果。",
      "networkProbe.ports.degradedHint": "降级扫描",
    },
    en: {
      "networkProbe.ports.hint": "Port scan an authorized host",
      "networkProbe.ports.scanModeHint": "SYN needs privileges; otherwise TCP connect is used.",
      "networkProbe.ports.target": "Target",
      "networkProbe.ports.range": "Ports",
      "networkProbe.ports.run": "Scan ports",
      "networkProbe.ports.openList": "Open: {{ports}}",
      "networkProbe.ports.state.open": "Open",
      "networkProbe.ports.state.closed": "Closed",
      "networkProbe.ports.state.filtered": "Filtered / no response",
      "networkProbe.ports.state.error": "Error",
      "networkProbe.ports.state.unknown": "Unknown",
      "networkProbe.ports.mode.nmap":
        "Scanned with Nmap; SYN or TCP connect is selected by available privileges.",
      "networkProbe.ports.mode.tcpConnect": "Scanned with TCP connect.",
      "networkProbe.ports.mode.unknown": "Unknown scan method.",
      "networkProbe.ports.cancelled":
        "Scan cancelled; the results below were received before cancellation.",
      "networkProbe.ports.degradedHint": "Degraded scan",
    },
  }

  return {
    setLanguage: (value: "zh" | "en") => {
      language = value
    },
    translate: (key: string, values?: Record<string, unknown>) =>
      (messages[language][key as keyof (typeof messages)["zh"]] ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(values?.[name] ?? ""),
      ),
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

const result: PortScanResult = {
  target: "127.0.0.1",
  mode: "nmap-syn-or-connect",
  openPorts: [7000],
  samples: [
    { port: 7000, state: "open" },
    { port: 65534, state: "closed" },
    { port: 65533, state: "filtered" },
    { port: 65532, state: "error" },
    { port: 65531, state: "future-state" },
  ],
  cancelled: false,
  sessionId: "session-1",
  message: "nmap present: used -sS when permitted, otherwise -sT.",
  commandHint: "scanPorts(local, '127.0.0.1', 5 ports)",
}

function renderPanel(scanResult: PortScanResult = result) {
  return render(
    <PortScanPanel
      loading={false}
      canCancel={false}
      result={scanResult}
      streaming={[]}
      toolEnabled
      toolStatus="supported"
      onRun={() => undefined}
      onCancel={() => undefined}
    />,
  )
}

afterEach(() => {
  cleanup()
  setLanguage("zh")
})

describe("PortScanPanel localized results", () => {
  it("localizes result states and scan mode in Chinese without showing backend prose", () => {
    setLanguage("zh")
    renderPanel()

    expect(screen.getByText("7000: 开放")).toBeTruthy()
    expect(screen.getByText("65534: 关闭")).toBeTruthy()
    expect(screen.getByText("65533: 已过滤 / 无响应")).toBeTruthy()
    expect(screen.getByText("65532: 错误")).toBeTruthy()
    expect(screen.getByText("65531: 未知")).toBeTruthy()
    expect(screen.getByText("使用 Nmap；按权限使用 SYN 或 TCP connect。")).toBeTruthy()
    expect(screen.queryByText(result.message!)).toBeNull()
    expect(screen.queryByText("networkProbe.ports.degradedHint")).toBeNull()
  })

  it("uses English equivalents when the UI language is English", () => {
    setLanguage("en")
    renderPanel()

    expect(screen.getByText("7000: Open")).toBeTruthy()
    expect(screen.getByText("65534: Closed")).toBeTruthy()
    expect(screen.getByText("65533: Filtered / no response")).toBeTruthy()
    expect(
      screen.getByText(
        "Scanned with Nmap; SYN or TCP connect is selected by available privileges.",
      ),
    ).toBeTruthy()
  })

  it("localizes TCP-connect mode and cancellation feedback", () => {
    setLanguage("zh")
    renderPanel({ ...result, mode: "tcp-connect", cancelled: true })

    expect(screen.getByText("使用 TCP connect 扫描。")).toBeTruthy()
    expect(screen.getByText("扫描已取消，以下为取消前收到的结果。")).toBeTruthy()
  })
})
