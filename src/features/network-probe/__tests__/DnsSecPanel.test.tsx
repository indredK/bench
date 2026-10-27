import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DnsSecCheckResult, DnsSecStatus } from "@/lib/tauri/types/network-probe"

const i18nState = vi.hoisted(() => {
  const messages = {
    en: {
      "networkProbe.dnssec.hint": "DNSSEC is validated on this device.",
      "networkProbe.dnssec.domain": "Domain",
      "networkProbe.dnssec.run": "Check DNSSEC",
      "networkProbe.dnssec.running": "Checking…",
      "networkProbe.dnssec.status": "DNSSEC status",
      "networkProbe.dnssec.statusSecure": "Secure",
      "networkProbe.dnssec.statusInsecure": "Not authenticated (possibly unsigned)",
      "networkProbe.dnssec.statusBogus": "Validation failed",
      "networkProbe.dnssec.statusUnknown": "Unknown",
      "networkProbe.dnssec.doh": "DoH",
      "networkProbe.dnssec.dot": "DoT",
      "networkProbe.dnssec.okMs": "ok · {{ms}} ms",
      "networkProbe.dnssec.fail": "unreachable / failed",
      "networkProbe.dnssec.technicalDetails": "Technical details",
    },
    zh: {
      "networkProbe.dnssec.hint": "DNSSEC 在本机验证。",
      "networkProbe.dnssec.domain": "域名",
      "networkProbe.dnssec.run": "检查 DNSSEC",
      "networkProbe.dnssec.running": "检查中…",
      "networkProbe.dnssec.status": "DNSSEC 状态",
      "networkProbe.dnssec.statusSecure": "已验证",
      "networkProbe.dnssec.statusInsecure": "未验证（可能未签名）",
      "networkProbe.dnssec.statusBogus": "验证失败",
      "networkProbe.dnssec.statusUnknown": "未知",
      "networkProbe.dnssec.doh": "DoH",
      "networkProbe.dnssec.dot": "DoT",
      "networkProbe.dnssec.okMs": "可达 · {{ms}} ms",
      "networkProbe.dnssec.fail": "不可达 / 失败",
      "networkProbe.dnssec.technicalDetails": "技术详情",
    },
  }
  let language: keyof typeof messages = "en"
  return {
    setLanguage(next: keyof typeof messages) {
      language = next
    },
    t(key: string) {
      return messages[language][key as keyof (typeof messages)[typeof language]] ?? key
    },
  }
})

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: i18nState.t }) }))
vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))
vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => children,
}))
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

import { DnsSecPanel } from "@/features/network-probe/components/DnsSecPanel"

const baseResult: DnsSecCheckResult = {
  domain: "example.com",
  dnssecStatus: "secure",
  dnssecDetail: "Hickory locally validated the DNSSEC chain.",
  dohOk: true,
  dohRttMs: 21,
  dohDetail: "DoH over HTTPS via Cloudflare completed.",
  dotOk: false,
  dotDetail: "DoT query failed: connection timed out.",
  commandHint: "checkDnsSec('example.com')",
}

function renderPanel(result: DnsSecCheckResult) {
  return render(<DnsSecPanel loading={false} result={result} toolEnabled onRun={vi.fn()} />)
}

describe("DnsSecPanel result feedback", () => {
  afterEach(() => {
    cleanup()
    i18nState.setLanguage("en")
  })

  it("localizes secure status and keeps resolver diagnostics collapsed in Chinese", () => {
    i18nState.setLanguage("zh")
    renderPanel(baseResult)

    expect(screen.getByText("已验证")).toBeInTheDocument()
    expect(screen.getByText("DNSSEC 在本机验证。")).toBeInTheDocument()
    expect(screen.getByText("技术详情").closest("details")).not.toHaveAttribute("open")
    expect(screen.queryByText("Hickory locally validated the DNSSEC chain.")).not.toBeVisible()
    expect(screen.queryByText("checkDnsSec('example.com')")).not.toBeVisible()
  })

  it("maps insecure status in English", () => {
    renderPanel({ ...baseResult, dnssecStatus: "insecure" })

    expect(screen.getByText("Not authenticated (possibly unsigned)")).toBeInTheDocument()
  })

  it("falls back to the localized unknown label for an unrecognized status", () => {
    i18nState.setLanguage("zh")
    renderPanel({ ...baseResult, dnssecStatus: "new-backend-state" as DnsSecStatus })

    expect(screen.getByText("未知")).toBeInTheDocument()
    expect(screen.queryByText("new-backend-state")).not.toBeInTheDocument()
  })
})
