import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PollutionPanel } from "@/features/network-probe/components/PollutionPanel"
import type { PollutionReport } from "@/lib/tauri/types/network-probe"

const { setLanguage, translate } = vi.hoisted(() => {
  let language: "zh" | "en" = "zh"
  const messages: Record<"zh" | "en", Record<string, string>> = {
    zh: {
      "networkProbe.pollution.hint": "检查 DNS、hosts 和 HTTPS",
      "networkProbe.pollution.domain": "域名",
      "networkProbe.pollution.run": "开始污染检测",
      "networkProbe.pollution.running": "检测中…",
      "networkProbe.pollution.meta": "{{domain}} · {{count}} 条发现 · {{ms}} ms",
      "networkProbe.pollution.kind.arp": "网关 ARP",
      "networkProbe.pollution.kind.dns": "DNS 答案",
      "networkProbe.pollution.kind.hosts": "Hosts 文件",
      "networkProbe.pollution.kind.route": "路由 / 代理",
      "networkProbe.pollution.kind.tls": "HTTPS / 证书",
      "networkProbe.pollution.kind.unknown": "其他检测",
      "networkProbe.pollution.severity.info": "提示",
      "networkProbe.pollution.severity.warn": "需要复核",
      "networkProbe.pollution.severity.high": "高风险",
      "networkProbe.pollution.severity.unknown": "状态未知",
      "networkProbe.pollution.summary.info": "此项检查没有报告高风险异常。",
      "networkProbe.pollution.summary.warn": "此结果需要复核；单凭当前信息无法确定具体原因。",
      "networkProbe.pollution.summary.high": "此项检查发现了高可信风险信号，请结合详情确认。",
      "networkProbe.pollution.summary.unknown": "结果状态未知，请展开技术详情查看原始信息。",
      "networkProbe.pollution.summary.tlsWarning":
        "HTTPS 检查未能完成。DNS 或网络连接失败本身不能证明存在拦截。",
      "networkProbe.pollution.technicalDetails": "技术详情",
      "networkProbe.pollution.evidence": "原始证据",
      "networkProbe.pollution.command": "检查命令",
    },
    en: {
      "networkProbe.pollution.hint": "Check DNS, hosts, and HTTPS",
      "networkProbe.pollution.domain": "Domain",
      "networkProbe.pollution.run": "Run pollution check",
      "networkProbe.pollution.running": "Checking…",
      "networkProbe.pollution.meta": "{{domain}} · {{count}} findings · {{ms}} ms",
      "networkProbe.pollution.kind.arp": "Gateway ARP",
      "networkProbe.pollution.kind.dns": "DNS answers",
      "networkProbe.pollution.kind.hosts": "Hosts file",
      "networkProbe.pollution.kind.route": "Route / proxy",
      "networkProbe.pollution.kind.tls": "HTTPS / certificate",
      "networkProbe.pollution.kind.unknown": "Other check",
      "networkProbe.pollution.severity.info": "Information",
      "networkProbe.pollution.severity.warn": "Review needed",
      "networkProbe.pollution.severity.high": "High risk",
      "networkProbe.pollution.severity.unknown": "Unknown status",
      "networkProbe.pollution.summary.info": "This check did not report a high-risk anomaly.",
      "networkProbe.pollution.summary.warn":
        "Review this result; the available information does not establish a specific cause.",
      "networkProbe.pollution.summary.high":
        "This check found a high-confidence risk signal. Review the details to confirm.",
      "networkProbe.pollution.summary.unknown":
        "The result status is unknown. Expand technical details to inspect the raw information.",
      "networkProbe.pollution.summary.tlsWarning":
        "The HTTPS check could not complete. DNS or network connection failures alone do not prove interception.",
      "networkProbe.pollution.technicalDetails": "Technical details",
      "networkProbe.pollution.evidence": "Raw evidence",
      "networkProbe.pollution.command": "Check command",
    },
  }

  return {
    setLanguage: (value: "zh" | "en") => {
      language = value
    },
    translate: (key: string, values?: Record<string, unknown>) =>
      (messages[language][key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(values?.[name] ?? ""),
      ),
  }
})

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

const result: PollutionReport = {
  domain: "bench-repro.invalid",
  elapsedMs: 125,
  commandHint: "detectPollution(local, 'bench-repro.invalid')",
  findings: [
    {
      kind: "tls",
      severity: "warn",
      evidence:
        "HTTPS check could not be completed for bench-repro.invalid: name resolution failed.",
      commandHint: "checkSsl('bench-repro.invalid')",
    },
  ],
}

function renderPanel(report: PollutionReport = result) {
  return render(
    <PollutionPanel
      loading={false}
      result={report}
      toolEnabled
      toolStatus="supported"
      onRun={() => undefined}
    />,
  )
}

afterEach(() => {
  cleanup()
  setLanguage("zh")
})

describe("PollutionPanel localized findings", () => {
  it("localizes a failed HTTPS check and keeps raw details collapsed in Chinese", () => {
    setLanguage("zh")
    renderPanel()

    expect(screen.getByText("HTTPS / 证书")).toBeTruthy()
    expect(screen.getByText("需要复核")).toBeTruthy()
    expect(
      screen.getByText("HTTPS 检查未能完成。DNS 或网络连接失败本身不能证明存在拦截。"),
    ).toBeTruthy()

    const evidence = screen.getByText(result.findings[0].evidence)
    const details = evidence.closest("details")
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(screen.getByText("技术详情")).toBeTruthy()
  })

  it("uses English labels and summaries when the UI language is English", () => {
    setLanguage("en")
    renderPanel()

    expect(screen.getByText("HTTPS / certificate")).toBeTruthy()
    expect(screen.getByText("Review needed")).toBeTruthy()
    expect(
      screen.getByText(
        "The HTTPS check could not complete. DNS or network connection failures alone do not prove interception.",
      ),
    ).toBeTruthy()
  })

  it("falls back safely for unknown finding kinds and severities", () => {
    setLanguage("en")
    renderPanel({
      ...result,
      findings: [
        {
          kind: "future-check",
          severity: "critical",
          evidence: "Future backend evidence",
          commandHint: "futureCheck()",
        },
      ],
    })

    expect(screen.getByText("Other check")).toBeTruthy()
    expect(screen.getByText("Unknown status")).toBeTruthy()
    expect(
      screen.getByText(
        "The result status is unknown. Expand technical details to inspect the raw information.",
      ),
    ).toBeTruthy()
    expect(screen.getByText("Future backend evidence").closest("details")?.open).toBe(false)
  })
})
