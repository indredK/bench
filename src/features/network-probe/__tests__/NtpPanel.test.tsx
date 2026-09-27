import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { NtpProbeResult } from "@/lib/tauri/types/network-probe"
import { NtpPanel } from "../components/NtpPanel"

const translations: Record<string, string> = {
  "networkProbe.ntp.hint": "NTP 多源探测",
  "networkProbe.ntp.run": "探测 NTP",
  "networkProbe.ntp.running": "探测中",
  "networkProbe.ntp.offset": "多源中位偏移 {{milliseconds}} ms",
  "networkProbe.ntp.rtt": "多源 RTT 中位数 {{milliseconds}} ms",
  "networkProbe.ntp.sources": "NTP 服务器结果",
  "networkProbe.ntp.sourceMetrics": "偏移 {{offset}} ms · RTT {{rtt}} ms · 层级 {{stratum}}",
  "networkProbe.ntp.sourceErrors.timeout": "请求超时",
  "networkProbe.ntp.sourceErrors.unknown": "探测失败",
  "networkProbe.ntp.severity.ok": "正常",
  "networkProbe.ntp.severity.warn": "警告",
  "networkProbe.ntp.severity.high": "严重",
  "networkProbe.ntp.technicalDetails": "技术详情",
  "networkProbe.ntp.fail": "没有收到有效的 NTP 响应",
  "networkProbe.cmd.ntp": "probeNtp(local)",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { [name: string]: unknown }) => {
      const template = translations[key] ?? key
      return template.replace(/{{(\w+)}}/g, (_match, name: string) => String(options?.[name] ?? ""))
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function result(overrides: Partial<NtpProbeResult> = {}): NtpProbeResult {
  return {
    server: "time.google.com, ntp.aliyun.com",
    ok: true,
    offsetSeconds: 2.1,
    rttSeconds: 0.018,
    sources: [
      {
        server: "time.google.com",
        ok: true,
        offsetSeconds: 2.1,
        rttSeconds: 0.018,
        stratum: 2,
      },
      {
        server: "ntp.aliyun.com",
        ok: false,
        errorCode: "NTP_TIMEOUT",
        detail: "request exceeded 4 seconds",
      },
    ],
    severity: "high",
    detail: "Some NTP sources failed.",
    elapsedMs: 4000,
    commandHint: "probeNtp(local)",
    ...overrides,
  }
}

describe("NtpPanel", () => {
  it("localizes severity and shows per-server offset, RTT, stratum and errors", () => {
    render(<NtpPanel loading={false} result={result()} toolEnabled onRun={vi.fn()} />)

    expect(screen.getByText("多源中位偏移 +2100.0 ms")).toBeInTheDocument()
    expect(screen.getByText("严重")).toBeInTheDocument()
    expect(screen.getByText("多源 RTT 中位数 18.0 ms")).toBeInTheDocument()
    expect(screen.getByText("偏移 +2100.0 ms · RTT 18.0 ms · 层级 2")).toBeInTheDocument()
    expect(screen.getByText("请求超时")).toBeInTheDocument()
    expect(screen.queryByText("high")).not.toBeInTheDocument()
  })

  it("uses localized severity labels for warning and normal offsets", () => {
    const { rerender } = render(
      <NtpPanel
        loading={false}
        result={result({ severity: "warn" })}
        toolEnabled
        onRun={vi.fn()}
      />,
    )
    expect(screen.getByText("警告")).toBeInTheDocument()

    rerender(
      <NtpPanel loading={false} result={result({ severity: "ok" })} toolEnabled onRun={vi.fn()} />,
    )
    expect(screen.getByText("正常")).toBeInTheDocument()
  })
})
