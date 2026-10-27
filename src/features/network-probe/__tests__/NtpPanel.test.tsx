import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { NtpProbeResult } from "@/lib/tauri/types/network-probe"
import { NtpPanel } from "../components/NtpPanel"

const translations: Record<string, string> = {
  "networkProbe.ntp.hint": "查询多个内置 NTP 服务器",
  "networkProbe.ntp.run": "探测 NTP",
  "networkProbe.ntp.offset": "偏移 {{seconds}} 秒（{{severity}}）",
  "networkProbe.ntp.rtt": "平均往返延迟 {{seconds}} 秒",
  "networkProbe.ntp.details": "服务器响应详情",
  "networkProbe.ntp.severities.ok": "正常",
  "networkProbe.ntp.severities.info": "需关注",
  "networkProbe.ntp.severities.warn": "偏差较大",
  "networkProbe.ntp.severities.fail": "不可用",
  "networkProbe.ntp.severities.unknown": "未知",
  "networkProbe.ntp.fail": "NTP 探测失败",
  "networkProbe.cmd.ntp": "probeNtp(local)",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const template = translations[key] ?? options?.defaultValue ?? key
      return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => options?.[name] ?? "")
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function result(overrides: Partial<NtpProbeResult> = {}): NtpProbeResult {
  return {
    server: "time.cloudflare.com:123, time.google.com:123",
    ok: true,
    offsetSeconds: -0.75,
    rttSeconds: 0.032,
    severity: "info",
    detail: "median_offset=-0.750s from 2 source(s).",
    elapsedMs: 900,
    commandHint: "probeNtp(local)",
    ...overrides,
  }
}

describe("NtpPanel", () => {
  it("localizes severity, shows average RTT, and keeps raw server details collapsed", () => {
    render(<NtpPanel loading={false} result={result()} toolEnabled onRun={vi.fn()} />)

    expect(screen.getByText("偏移 -0.750 秒（需关注）")).toBeInTheDocument()
    expect(screen.getByText("平均往返延迟 0.032 秒")).toBeInTheDocument()
    const details = screen.getByText("服务器响应详情").closest("details")
    expect(details).not.toHaveAttribute("open")
    expect(screen.queryByText("info")).not.toBeInTheDocument()
  })
})
