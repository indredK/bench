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

function renderSamples(
  samples: PortSampleEvent[],
  result: PortScanResult | null = null,
  toolStatus?: string,
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PortScanPanel
        loading={false}
        canCancel={false}
        result={result}
        streaming={samples}
        toolEnabled
        toolStatus={toolStatus}
        onRun={() => undefined}
        onCancel={() => undefined}
      />
    </I18nextProvider>,
  )
}

function portSampleRows(): string[] {
  return Array.from(document.querySelectorAll('[data-network-probe-list="port-samples"] li')).map(
    (item) => item.textContent?.replace(/\s+/g, "") ?? "",
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

    expect(portSampleRows()).toEqual([
      "22:开放",
      "80:关闭",
      "443:已过滤",
      "8080:错误",
      "8443:未知状态",
    ])
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

    expect(portSampleRows()).toEqual([
      "22:Open",
      "80:Closed",
      "443:Filtered",
      "8080:Error",
      "8443:Unknown",
    ])
  })

  it.each([
    [
      "zh",
      "对你拥有或获准测试的单台主机扫描 TCP 端口（最多 256 个），可随时取消。",
      "已检测到 nmap：优先尝试 SYN，权限不足时回退为 TCP connect。可单独勾选服务 / OS 指纹。",
    ],
    [
      "en",
      "Scan TCP ports on one host you own or are authorized to test (up to 256). Cancel at any time.",
      "nmap detected: SYN is attempted first and falls back to TCP connect if permission is unavailable. Service / OS fingerprinting is opt-in.",
    ],
  ])(
    "describes the generic scan and Nmap mode separately in %s",
    async (locale, hint, nmapHint) => {
      await i18n.changeLanguage(locale)
      renderSamples([], null, "supported")

      expect(screen.getByText(hint)).toBeTruthy()
      expect(screen.getByText(nmapHint)).toBeTruthy()
      expect(screen.queryByText(/TCP connect scan/i)).toBeNull()
      expect(screen.queryByText(/TCP connect 端口扫描/)).toBeNull()
    },
  )

  it("does not repeat the backend's English degraded-mode message", async () => {
    await i18n.changeLanguage("zh")
    renderSamples(
      [],
      scanResult({
        mode: "tcp-connect",
        message: "Degraded mode: TCP connect only. nmap was not detected.",
      }),
    )

    expect(
      screen.getAllByText("降级模式：仅 TCP connect。未检测到 nmap；安装 nmap 后可尝试 SYN。"),
    ).toHaveLength(1)
    expect(screen.getByText("未取得 nmap 扫描结果，已使用 TCP connect。")).toBeTruthy()
    expect(screen.queryByText("Degraded mode: TCP connect only. nmap was not detected.")).toBeNull()
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
    expect(screen.getByText("nmap 扫描完成；未运行漏洞或服务探测脚本。")).toBeTruthy()
    expect(screen.queryByText(/nmap present:/i)).toBeNull()
  })
})
