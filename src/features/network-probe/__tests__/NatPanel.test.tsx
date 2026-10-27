import { render, screen } from "@testing-library/react"
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
  "networkProbe.nat.serverStatuses.timeout": "请求超时",
  "networkProbe.nat.serverStatuses.unknown": "未知状态",
  "networkProbe.nat.elapsed": "耗时 9.0 秒",
  "networkProbe.cmd.nat": "probeNat(local)",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      translations[key] ?? options?.defaultValue ?? key,
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
        errorCode: "NAT_TIMEOUT",
      },
    ],
    elapsedMs: 9000,
    commandHint: "probeNat(local)",
    ...overrides,
  }
}

describe("NatPanel", () => {
  beforeEach(() => vi.clearAllMocks())

  it("localizes timeout states and server rows without exposing internal error codes", () => {
    render(<NatPanel loading={false} result={result()} toolEnabled onRun={vi.fn()} />)

    expect(screen.getByText("没有收到 STUN 响应")).toBeInTheDocument()
    expect(
      screen.getByText(
        "请查看逐源状态；网络过滤、DNS 解析或服务器超时都可能导致无响应，单凭超时无法确认原因。",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("请求超时")).toBeInTheDocument()
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
            { server: "stun-a.example:3478", status: "mapped", mappedAddress: "203.0.113.9:54321" },
            {
              server: "stun-b.example:3478",
              status: "mapped",
              mappedAddress: "198.51.100.3:31234",
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
})
