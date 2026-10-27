import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { NatProbeResult, NatProbeStatus } from "@/lib/tauri/types/network-probe"

const i18nState = vi.hoisted(() => {
  const messages = {
    en: {
      "networkProbe.nat.hint":
        "Compare STUN mappings and, when available, RFC 5780 mapping and filtering behavior.",
      "networkProbe.nat.run": "Probe NAT",
      "networkProbe.nat.running": "Probing…",
      "networkProbe.nat.type": "Result",
      "networkProbe.nat.mappingBehavior": "Mapping behavior",
      "networkProbe.nat.filteringBehavior": "Filtering behavior",
      "networkProbe.nat.behaviorHint":
        "Results describe behavior for this server and local port on this network path at the time of the probe.",
      "networkProbe.nat.behavior.noNat": "No NAT detected",
      "networkProbe.nat.behavior.endpointIndependent": "Endpoint-independent",
      "networkProbe.nat.behavior.addressDependent": "Address-dependent",
      "networkProbe.nat.behavior.addressAndPortDependent": "Address and port-dependent",
      "networkProbe.nat.behavior.unsupported": "Not supported by the STUN server",
      "networkProbe.nat.behavior.inconclusive": "Inconclusive",
      "networkProbe.nat.mapped": "Mapped address",
      "networkProbe.nat.technicalDetails": "Technical details",
      "networkProbe.nat.status.blocked": "No valid response",
      "networkProbe.nat.status.insufficient": "Not enough responses",
      "networkProbe.nat.status.consistent": "Mapping is consistent",
      "networkProbe.nat.status.varies": "Mappings differ",
      "networkProbe.nat.status.unknown": "Unknown result",
      "networkProbe.nat.explanation.blocked": "No server returned a valid response.",
      "networkProbe.nat.explanation.insufficient": "Only one server responded.",
      "networkProbe.nat.explanation.consistent": "At least two servers returned the same mapping.",
      "networkProbe.nat.explanation.varies": "Different servers returned different mappings.",
      "networkProbe.nat.explanation.unknown": "The result could not be classified.",
      "networkProbe.cmd.nat": "probeNat(local)",
    },
    zh: {
      "networkProbe.nat.hint": "对比 STUN 映射；服务器支持时，同时探测 RFC 5780 映射与过滤行为。",
      "networkProbe.nat.run": "探测 NAT",
      "networkProbe.nat.running": "探测中…",
      "networkProbe.nat.type": "结果",
      "networkProbe.nat.mappingBehavior": "映射行为",
      "networkProbe.nat.filteringBehavior": "过滤行为",
      "networkProbe.nat.behaviorHint": "结果仅反映本次探测中该服务器、本地端口和网络路径的行为。",
      "networkProbe.nat.behavior.noNat": "未检测到 NAT",
      "networkProbe.nat.behavior.endpointIndependent": "端点无关",
      "networkProbe.nat.behavior.addressDependent": "地址相关",
      "networkProbe.nat.behavior.addressAndPortDependent": "地址和端口相关",
      "networkProbe.nat.behavior.unsupported": "STUN 服务器不支持",
      "networkProbe.nat.behavior.inconclusive": "无法判断",
      "networkProbe.nat.mapped": "映射地址",
      "networkProbe.nat.technicalDetails": "技术详情",
      "networkProbe.nat.status.blocked": "未收到有效响应",
      "networkProbe.nat.status.insufficient": "响应数量不足",
      "networkProbe.nat.status.consistent": "映射地址一致",
      "networkProbe.nat.status.varies": "映射地址不同",
      "networkProbe.nat.status.unknown": "结果未知",
      "networkProbe.nat.explanation.blocked": "没有服务器返回有效响应。",
      "networkProbe.nat.explanation.insufficient": "只有一个服务器响应。",
      "networkProbe.nat.explanation.consistent": "至少两个服务器返回了相同映射。",
      "networkProbe.nat.explanation.varies": "不同服务器返回了不同映射。",
      "networkProbe.nat.explanation.unknown": "无法判断结果类型。",
      "networkProbe.cmd.nat": "probeNat(local)",
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
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <section>
      {toolbar}
      {children}
    </section>
  ),
}))
vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}))

import { NatPanel } from "@/features/network-probe/components/NatPanel"

const baseResult: NatProbeResult = {
  natType: "mapping-varies",
  mappingBehavior: "endpoint-independent",
  filteringBehavior: "address-dependent",
  stunServer: "stun-one, stun-two",
  detail: "stun-one → 203.0.113.12:4567; stun-two → 203.0.113.15:4567",
  elapsedMs: 4,
  commandHint: "probeNat(local)",
}

function renderPanel(result: NatProbeResult) {
  return render(<NatPanel loading={false} result={result} toolEnabled onRun={vi.fn()} />)
}

describe("NatPanel result feedback", () => {
  afterEach(() => {
    cleanup()
    i18nState.setLanguage("en")
  })

  it("localizes a varying mapping and keeps server diagnostics collapsed", () => {
    renderPanel(baseResult)

    expect(screen.getByText("Mappings differ")).toBeInTheDocument()
    expect(screen.getByText("Different servers returned different mappings.")).toBeInTheDocument()
    expect(screen.queryByText(/203\.0\.113\./)).not.toBeVisible()
    expect(screen.queryByText(/Mapped address:/)).not.toBeInTheDocument()
    expect(screen.getByText("Technical details").closest("details")).not.toHaveAttribute("open")
    expect(screen.queryByText("mapping-varies")).not.toBeInTheDocument()
  })

  it("shows localized insufficient-evidence feedback in Chinese", () => {
    i18nState.setLanguage("zh")
    renderPanel({
      ...baseResult,
      natType: "insufficient-evidence",
      mappedAddress: "203.0.113.12:4567",
    })

    expect(screen.getByText("响应数量不足")).toBeInTheDocument()
    expect(screen.getByText("只有一个服务器响应。")).toBeInTheDocument()
    expect(screen.getByText("203.0.113.12:4567")).toBeInTheDocument()
  })

  it("does not expose an unknown backend status as a machine code", () => {
    renderPanel({
      ...baseResult,
      natType: "unexpected-backend-value" as NatProbeStatus,
    })

    expect(screen.getByText("Unknown result")).toBeInTheDocument()
    expect(screen.queryByText("unexpected-backend-value")).not.toBeInTheDocument()
  })

  it("shows RFC 5780 mapping and filtering as separate observations", () => {
    renderPanel(baseResult)

    expect(screen.getByText("Endpoint-independent")).toBeInTheDocument()
    expect(screen.getByText("Address-dependent")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Results describe behavior for this server and local port on this network path at the time of the probe.",
      ),
    ).toBeInTheDocument()
  })
})
