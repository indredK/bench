import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import type { PortScanResult } from "@/lib/tauri/types/network-probe"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number
    estimateSize: () => number
    getItemKey: (index: number) => string | number
  }) => ({
    getTotalSize: () => options.count * options.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, 8) }, (_, index) => ({
        index,
        start: index * options.estimateSize(),
        size: options.estimateSize(),
        key: options.getItemKey(index),
      })),
    measureElement: () => undefined,
  }),
}))

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
      "networkProbe.ports.openListCount": "开放端口：{{count}} 个",
      "networkProbe.ports.openPortsList": "开放端口列表",
      "networkProbe.ports.samplesList": "端口扫描结果",
      "networkProbe.ports.state.open": "开放",
      "networkProbe.ports.state.closed": "关闭",
      "networkProbe.ports.state.filtered": "已过滤 / 无响应",
      "networkProbe.ports.state.error": "错误",
      "networkProbe.ports.state.unknown": "未知",
      "networkProbe.ports.mode.nmap": "使用 Nmap；按权限使用 SYN 或 TCP connect。",
      "networkProbe.ports.mode.tcpConnect": "使用 TCP connect 扫描。",
      "networkProbe.ports.mode.unknown": "扫描方式未知。",
      "networkProbe.ports.cancelled": "扫描已取消，以下为取消前收到的结果。",
      "networkProbe.ports.noSamples": "尚未收到端口扫描结果。",
      "networkProbe.ports.resultTarget": "本次扫描目标：{{target}}",
      "networkProbe.ports.technicalDetails": "技术详情",
      "networkProbe.ports.technicalReason": "扫描说明",
      "networkProbe.ports.command": "命令",
      "networkProbe.caps.toolDisabled": "此功能在当前环境暂不可用。",
      "networkProbe.ports.degradedHint": "降级扫描",
    },
    en: {
      "networkProbe.ports.hint": "Port scan an authorized host",
      "networkProbe.ports.scanModeHint": "SYN needs privileges; otherwise TCP connect is used.",
      "networkProbe.ports.target": "Target",
      "networkProbe.ports.range": "Ports",
      "networkProbe.ports.run": "Scan ports",
      "networkProbe.ports.openList": "Open: {{ports}}",
      "networkProbe.ports.openListCount": "Open ports: {{count}}",
      "networkProbe.ports.openPortsList": "Open ports list",
      "networkProbe.ports.samplesList": "Port scan results",
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
      "networkProbe.ports.noSamples": "No port scan results were received.",
      "networkProbe.ports.resultTarget": "Scan result for: {{target}}",
      "networkProbe.ports.technicalDetails": "Technical details",
      "networkProbe.ports.technicalReason": "Scan details",
      "networkProbe.ports.command": "Command",
      "networkProbe.caps.toolDisabled":
        "This feature is currently unavailable in this environment.",
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
      cancelRequested={false}
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
    expect(screen.getByText("开放：7000")).toBeTruthy()
    expect(screen.getByText("本次扫描目标：127.0.0.1")).toBeTruthy()
    expect(screen.getByText("65534: 关闭")).toBeTruthy()
    expect(screen.getByText("65533: 已过滤 / 无响应")).toBeTruthy()
    expect(screen.getByText("65532: 错误")).toBeTruthy()
    expect(screen.getByText("65531: 未知")).toBeTruthy()
    expect(screen.getByText("使用 Nmap；按权限使用 SYN 或 TCP connect。")).toBeTruthy()
    const details = screen.getByText("技术详情").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(result.message)
    expect(details?.textContent).toContain(result.commandHint)
    expect(screen.queryByText("networkProbe.ports.degradedHint")).toBeNull()
  })

  it("uses English equivalents when the UI language is English", () => {
    setLanguage("en")
    renderPanel()

    expect(screen.getByText("7000: Open")).toBeTruthy()
    expect(screen.getByText("Scan result for: 127.0.0.1")).toBeTruthy()
    expect(screen.getByText("65534: Closed")).toBeTruthy()
    expect(screen.getByText("65533: Filtered / no response")).toBeTruthy()
    expect(
      screen.getByText(
        "Scanned with Nmap; SYN or TCP connect is selected by available privileges.",
      ),
    ).toBeTruthy()
    const details = screen.getByText("Technical details").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(result.commandHint)
  })

  it("keeps short port results in natural list and summary content", () => {
    setLanguage("zh")
    const { container } = renderPanel()

    expect(container.querySelector("[data-virtualized-result-list]")).toBeNull()
    expect(screen.getByText("开放：7000")).toBeTruthy()
    expect(container.querySelectorAll("ul li")).toHaveLength(result.samples.length)
  })

  it("localizes TCP-connect mode and cancellation feedback", () => {
    setLanguage("zh")
    renderPanel({ ...result, mode: "tcp-connect", cancelled: true })

    expect(screen.getByText("使用 TCP connect 扫描。")).toBeTruthy()
    expect(screen.getByText("扫描已取消，以下为取消前收到的结果。")).toBeTruthy()
  })

  it("explains when cancellation completes before any samples arrive", () => {
    setLanguage("zh")
    renderPanel({ ...result, samples: [], openPorts: [], cancelled: true })

    expect(screen.getByText("扫描已取消，以下为取消前收到的结果。")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("尚未收到端口扫描结果。")
  })

  it("keeps the result target clear when the editable form target changes", () => {
    setLanguage("zh")
    renderPanel()

    fireEvent.change(screen.getByLabelText("目标"), { target: { value: "192.0.2.25" } })

    expect(screen.getByLabelText("目标").getAttribute("value")).toBe("192.0.2.25")
    expect(screen.getByText("本次扫描目标：127.0.0.1")).toBeTruthy()
  })

  it("virtualizes large sample and open-port lists with accessible positions", () => {
    setLanguage("zh")
    const samples = Array.from({ length: 256 }, (_, index) => ({
      port: index + 1,
      state: "closed",
    }))
    const { container } = renderPanel({
      ...result,
      samples,
      openPorts: samples.map((sample) => sample.port),
    })

    const lists = container.querySelectorAll("[data-virtualized-result-list]")
    expect(lists).toHaveLength(2)
    for (const list of lists) {
      const rows = list.querySelectorAll("[role='listitem']")
      expect(rows).toHaveLength(8)
      expect(rows[0]?.getAttribute("aria-posinset")).toBe("1")
      expect(rows[0]?.getAttribute("aria-setsize")).toBe("256")
    }
    expect(screen.getByRole("region", { name: "端口扫描结果" })).toBeTruthy()
    expect(screen.getByText("开放端口：256 个")).toBeTruthy()
    expect(container.querySelector("details")?.open).toBe(false)
    expect(container.querySelector("[aria-label='开放端口列表']")).toBeTruthy()
  })

  it("localizes capability-disabled feedback without exposing internal identifiers", () => {
    setLanguage("zh")
    render(
      <PortScanPanel
        loading={false}
        canCancel={false}
        cancelRequested={false}
        result={null}
        streaming={[]}
        toolEnabled={false}
        toolStatus="unsupported"
        onRun={() => undefined}
        onCancel={() => undefined}
      />,
    )

    expect(screen.getByText("此功能在当前环境暂不可用。")).toBeTruthy()
    expect(screen.queryByText(/portScan|unsupported/)).toBeNull()
  })
})
