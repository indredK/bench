import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PortScanResult } from "@/lib/tauri/types/network-probe"
import { PortScanPanel } from "../components/PortScanPanel"

const i18nState = vi.hoisted(() => ({
  language: "zh" as "zh" | "en",
  translations: {
    zh: {
      "networkProbe.ports.resultCancelled": "端口扫描已取消。",
      "networkProbe.ports.resultTcpConnect": "本次使用 TCP connect 扫描。",
      "networkProbe.ports.resultNmap":
        "本次使用 nmap 进行 SYN 或 TCP connect 探测；未启用 NSE 脚本。",
    },
    en: {
      "networkProbe.ports.resultCancelled": "Port scan was cancelled.",
      "networkProbe.ports.resultTcpConnect": "This run used a TCP connect scan.",
      "networkProbe.ports.resultNmap":
        "This run used nmap SYN or TCP connect scanning; NSE scripts were not enabled.",
    },
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations = i18nState.translations[i18nState.language] as Record<string, string>
      return translations[key] ?? key
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/common/DestructiveConfirmDialog", () => ({
  DestructiveConfirmDialog: () => null,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

function portScanResult(overrides: Partial<PortScanResult> = {}): PortScanResult {
  return {
    target: "127.0.0.1",
    mode: "cancelled",
    openPorts: [],
    samples: [],
    cancelled: true,
    sessionId: "session-1",
    message: "Port scan cancelled.",
    commandHint: "scanPorts(local, '127.0.0.1', 2 ports) // cancelled",
    ...overrides,
  }
}

function renderPanel(result: PortScanResult) {
  return render(
    <PortScanPanel
      loading={false}
      canCancel={false}
      result={result}
      streaming={[]}
      toolEnabled
      onRun={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe("PortScanPanel result messages", () => {
  afterEach(() => {
    cleanup()
    i18nState.language = "zh"
  })

  it("localizes cancellation in Chinese instead of rendering the backend message", () => {
    i18nState.language = "zh"

    renderPanel(portScanResult())

    expect(screen.getByText("端口扫描已取消。")).toBeInTheDocument()
    expect(screen.queryByText("Port scan cancelled.")).not.toBeInTheDocument()
  })

  it("localizes cancellation in English", () => {
    i18nState.language = "en"

    renderPanel(portScanResult())

    expect(screen.getByText("Port scan was cancelled.")).toBeInTheDocument()
    expect(screen.queryByText("Port scan cancelled.")).not.toBeInTheDocument()
  })

  it("localizes the TCP connect completion state", () => {
    i18nState.language = "zh"

    renderPanel(
      portScanResult({
        mode: "tcp-connect",
        cancelled: false,
        message: "Degraded mode: TCP connect only.",
      }),
    )

    expect(screen.getByText("本次使用 TCP connect 扫描。")).toBeInTheDocument()
    expect(screen.queryByText("Degraded mode: TCP connect only.")).not.toBeInTheDocument()
  })

  it("localizes the nmap completion state", () => {
    i18nState.language = "en"

    renderPanel(
      portScanResult({
        mode: "nmap-syn-or-connect",
        cancelled: false,
        message: "nmap present: used -sS when permitted, otherwise -sT.",
      }),
    )

    expect(
      screen.getByText(
        "This run used nmap SYN or TCP connect scanning; NSE scripts were not enabled.",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("nmap present: used -sS when permitted, otherwise -sT."),
    ).not.toBeInTheDocument()
  })
})
