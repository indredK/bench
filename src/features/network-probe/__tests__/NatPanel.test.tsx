import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NatProbeResult } from "@/lib/tauri/types/network-probe"
import { NatPanel } from "../components/NatPanel"

const translations: Record<string, string> = {
  "networkProbe.nat.hint": "STUN 探测",
  "networkProbe.nat.run": "探测 NAT",
  "networkProbe.nat.running": "探测中",
  "networkProbe.nat.type": "结果",
  "networkProbe.nat.mapped": "映射地址",
  "networkProbe.nat.types.blocked-or-timeout": "没有收到 STUN 响应",
  "networkProbe.nat.types.varying-mapping": "多个服务器的映射地址不同",
  "networkProbe.nat.types.unknown": "未知结果",
  "networkProbe.nat.explanations.blocked-or-timeout":
    "请查看逐源状态；网络过滤、DNS 解析或服务器超时都可能导致无响应，单凭超时无法确认原因。",
  "networkProbe.nat.explanations.varying-mapping": "差异不证明对称型 NAT。",
  "networkProbe.nat.explanations.unknown": "无法判断。",
  "networkProbe.nat.serverResults": "STUN 服务器结果",
  "networkProbe.nat.behaviorServersLabel": "RFC 5780 服务器（可选）",
  "networkProbe.nat.behaviorServersPlaceholder": "每行一个服务域名或 host:port",
  "networkProbe.nat.behaviorServersHint": "最多 {{max}} 个服务器。",
  "networkProbe.nat.behaviorResults": "RFC 5780 行为发现",
  "networkProbe.nat.behaviorEndpoint": "实际端点：{{endpoint}}",
  "networkProbe.nat.mappingBehaviorLabel": "映射行为",
  "networkProbe.nat.filteringBehaviorLabel": "过滤行为",
  "networkProbe.nat.elapsedMs": "{{milliseconds}} ms",
  "networkProbe.nat.behaviors.endpoint-independent": "端点无关",
  "networkProbe.nat.behaviors.address-dependent": "地址相关",
  "networkProbe.nat.behaviors.address-and-port-dependent": "地址与端口相关",
  "networkProbe.nat.behaviors.unknown": "未知",
  "networkProbe.nat.behaviorStatuses.complete": "已完成",
  "networkProbe.nat.behaviorStatuses.partial": "部分可判定",
  "networkProbe.nat.behaviorStatuses.unsupported": "服务器不支持或拒绝请求",
  "networkProbe.nat.behaviorStatuses.incompatible": "服务器响应不符合要求",
  "networkProbe.nat.behaviorStatuses.timeout": "主服务器无响应",
  "networkProbe.nat.behaviorStatuses.dns-timeout": "DNS 查询超时",
  "networkProbe.nat.behaviorStatuses.dns-error": "DNS 查询失败",
  "networkProbe.nat.behaviorStatuses.srv-unavailable": "没有可用的 RFC 5780 SRV 服务",
  "networkProbe.nat.behaviorStatuses.invalid-server": "服务器地址格式无效",
  "networkProbe.nat.behaviorStatuses.server-limit": "最多支持 3 个服务器",
  "networkProbe.nat.behaviorStatuses.unknown": "未知状态",
  "networkProbe.nat.behaviorStageStatuses.classified": "已判定",
  "networkProbe.nat.behaviorStageStatuses.inconclusive": "信息不足，无法判定",
  "networkProbe.nat.behaviorStageStatuses.alternate-unreachable": "备用地址不可达，无法判定",
  "networkProbe.nat.behaviorStageStatuses.error": "探测失败",
  "networkProbe.nat.behaviorStageStatuses.unknown": "未知",
  "networkProbe.nat.serverStatuses.timeout": "请求超时",
  "networkProbe.nat.serverStatuses.unknown": "未知状态",
  "networkProbe.nat.elapsed": "耗时 9.0 秒",
  "networkProbe.cmd.nat": "probeNat(local)",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; [name: string]: unknown }) => {
      const template = translations[key] ?? options?.defaultValue ?? key
      return template.replace(/{{(\w+)}}/g, (_match, name: string) => String(options?.[name] ?? ""))
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function result(overrides: Partial<NatProbeResult> = {}): NatProbeResult {
  return {
    natType: "blocked-or-timeout",
    stunServer: "stun.example:3478",
    serverResults: [
      {
        server: "stun.example:3478",
        status: "timeout",
        elapsedMs: 3000,
        errorCode: "NAT_TIMEOUT",
      },
    ],
    elapsedMs: 9000,
    commandHint: "probeNat(local)",
    ...overrides,
  }
}

describe("NatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it("localizes timeout states and server rows without exposing internal error codes", () => {
    render(<NatPanel loading={false} result={result()} toolEnabled onRun={vi.fn()} />)

    expect(screen.getByText("没有收到 STUN 响应")).toBeInTheDocument()
    expect(
      screen.getByText(
        "请查看逐源状态；网络过滤、DNS 解析或服务器超时都可能导致无响应，单凭超时无法确认原因。",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("请求超时 · 3000 ms")).toBeInTheDocument()
    expect(screen.getByText("耗时 9.0 秒")).toBeInTheDocument()
    expect(screen.queryByText("blocked-or-timeout")).not.toBeInTheDocument()
    expect(screen.queryByText("NAT_TIMEOUT")).not.toBeInTheDocument()
  })

  it("maps legacy overconfident labels to qualified mapping observations", () => {
    render(
      <NatPanel
        loading={false}
        result={result({ natType: "symmetric-or-varied" })}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("多个服务器的映射地址不同")).toBeInTheDocument()
    expect(screen.queryByText("symmetric-or-varied")).not.toBeInTheDocument()
  })

  it("shows per-server addresses without choosing a summary address when they differ", () => {
    const { container } = render(
      <NatPanel
        loading={false}
        result={result({
          natType: "varying-mapping",
          serverResults: [
            {
              server: "stun-a.example:3478",
              status: "mapped",
              mappedAddress: "203.0.113.9:54321",
              elapsedMs: 124,
            },
            {
              server: "stun-b.example:3478",
              status: "mapped",
              mappedAddress: "198.51.100.3:31234",
              elapsedMs: 250,
            },
          ],
        })}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(screen.queryByText("映射地址:")).not.toBeInTheDocument()
    expect(container.textContent).toContain("203.0.113.9:54321")
    expect(container.textContent).toContain("198.51.100.3:31234")
  })

  it("saves configured RFC 5780 servers and submits unique entries", () => {
    const onRun = vi.fn()
    render(<NatPanel loading={false} result={null} toolEnabled onRun={onRun} />)

    fireEvent.change(screen.getByLabelText("RFC 5780 服务器（可选）"), {
      target: { value: "example.org\nEXAMPLE.ORG\nstun.example.org:3478" },
    })
    fireEvent.click(screen.getByRole("button", { name: "探测 NAT" }))

    expect(onRun).toHaveBeenCalledWith(["example.org", "stun.example.org:3478"])
    expect(window.localStorage.getItem("bench.networkProbe.rfc5780Servers")).toBe(
      "example.org\nEXAMPLE.ORG\nstun.example.org:3478",
    )
  })

  it("shows mapping, filtering, endpoint and elapsed time per behavior server", () => {
    const { container } = render(
      <NatPanel
        loading={false}
        result={result({
          behaviorResults: [
            {
              server: "example.org",
              endpoint: "198.51.100.2:3478",
              status: "complete",
              mappingBehavior: "endpoint-independent",
              filteringBehavior: "address-dependent",
              mappedAddress: "203.0.113.9:54321",
              mappingStatus: "classified",
              filteringStatus: "classified",
              elapsedMs: 345,
            },
          ],
        })}
        toolEnabled
        onRun={vi.fn()}
      />,
    )

    expect(container.textContent).toContain("RFC 5780 行为发现")
    expect(container.textContent).toContain("端点无关")
    expect(container.textContent).toContain("地址相关")
    expect(container.textContent).toContain("198.51.100.2:3478")
    expect(container.textContent).toContain("203.0.113.9:54321")
    expect(container.textContent).toContain("345")
    expect(container.textContent).not.toContain("NAT_BEHAVIOR")
  })
})
