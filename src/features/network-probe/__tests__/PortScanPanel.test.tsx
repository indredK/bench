import { cleanup, render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it } from "vitest"
import i18n from "@/i18n/config"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import type { PortSampleEvent, PortScanResult } from "@/lib/tauri/types/network-probe"

function scanResult(overrides: Partial<PortScanResult> = {}): PortScanResult {
  return {
    target: "127.0.0.1",
    mode: "tcp-connect",
    openPorts: [],
    samples: [],
    cancelled: false,
    sessionId: "session-1",
    commandHint: "",
    ...overrides,
  }
}

function renderSamples(samples: PortSampleEvent[], result: PortScanResult | null = null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={result}
        streaming={samples}
        toolEnabled
        onRun={() => undefined}
        onCancel={() => undefined}
      />
    </I18nextProvider>,
  )
}

afterEach(() => {
  cleanup()
})

describe("PortScanPanel status localization", () => {
  it("shows localized Chinese labels for known states and a safe unknown fallback", async () => {
    await i18n.changeLanguage("zh")
    renderSamples([
      { port: 22, state: "open" },
      { port: 80, state: "closed" },
      { port: 443, state: "filtered" },
      { port: 8080, state: "error" },
      { port: 8443, state: "future-state" },
    ])

    expect(screen.getByText("22: 开放")).toBeTruthy()
    expect(screen.getByText("80: 已关闭")).toBeTruthy()
    expect(screen.getByText("443: 无法确定（已过滤）")).toBeTruthy()
    expect(screen.getByText("8080: 探测失败")).toBeTruthy()
    expect(screen.getByText("8443: 未知")).toBeTruthy()
    expect(screen.queryByText("80: closed")).toBeNull()
  })

  it("shows the English labels when the application language is English", async () => {
    await i18n.changeLanguage("en")
    renderSamples([
      { port: 22, state: "open" },
      { port: 80, state: "closed" },
      { port: 443, state: "filtered" },
      { port: 8080, state: "error" },
      { port: 8443, state: "future-state" },
    ])

    expect(screen.getByText("22: Open")).toBeTruthy()
    expect(screen.getByText("80: Closed")).toBeTruthy()
    expect(screen.getByText("443: Undetermined (filtered)")).toBeTruthy()
    expect(screen.getByText("8080: Probe failed")).toBeTruthy()
    expect(screen.getByText("8443: Unknown")).toBeTruthy()
  })

  it("does not repeat the backend's English degraded-mode message", async () => {
    await i18n.changeLanguage("zh")
    renderSamples(
      [],
      scanResult({
        message: "Degraded mode: TCP connect only. Install adv-scanner / nmap for SYN.",
      }),
    )

    expect(
      screen.getAllByText("降级模式：仅 TCP connect。安装 adv-scanner / nmap 可启用 SYN。"),
    ).toHaveLength(1)
    expect(
      screen.queryByText("Degraded mode: TCP connect only. Install adv-scanner / nmap for SYN."),
    ).toBeNull()
  })

  it("localizes cancellation and Nmap result notices", async () => {
    await i18n.changeLanguage("zh")
    const { unmount } = renderSamples(
      [],
      scanResult({ cancelled: true, message: "Port scan cancelled." }),
    )
    expect(screen.getByText("端口扫描已取消。")).toBeTruthy()
    expect(screen.queryByText("Port scan cancelled.")).toBeNull()

    unmount()
    renderSamples(
      [],
      scanResult({
        mode: "nmap-syn-or-connect",
        message:
          "nmap present: used -sS when permitted, otherwise -sT. No exploit scripts (-sC/-sV off).",
      }),
    )
    expect(
      screen.getByText(
        "已使用 Nmap 执行 SYN 扫描（权限不足时回退 TCP connect）；未运行攻击脚本（-sC/-sV）。",
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/nmap present:/i)).toBeNull()
  })
})
