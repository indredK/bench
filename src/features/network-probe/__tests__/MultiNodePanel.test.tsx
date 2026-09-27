import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { MultiNodeDnsResult } from "@/lib/tauri/types/network-probe"
import { MultiNodePanel } from "../components/MultiNodePanel"

const translations: Record<string, string> = {
  "networkProbe.nodes.hint": "多节点 DNS 对比",
  "networkProbe.nodes.statusOk": "正常",
  "networkProbe.nodes.statusFail": "失败",
  "networkProbe.nodes.technicalDetails": "技术详情",
  "networkProbe.nodes.listTitle": "探测节点",
  "networkProbe.nodes.addTitle": "添加 agent",
  "networkProbe.nodes.addHint": "仅允许 HTTPS/WSS",
  "networkProbe.nodes.labelPlaceholder": "名称",
  "networkProbe.nodes.endpointPlaceholder": "https://agent.example",
  "networkProbe.nodes.addAgent": "添加 agent",
  "networkProbe.nodes.removeAgent": "移除",
  "networkProbe.nodes.meta": "{{domain}} · {{count}} 条答案 · {{ms}} ms",
  "networkProbe.nodes.run": "对比 DNS",
  "networkProbe.nodes.refresh": "刷新节点",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { [name: string]: unknown }) =>
      (translations[key] ?? key).replace(/{{(\w+)}}/g, (_match, name: string) =>
        String(options?.[name] ?? ""),
      ),
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../components/ProbePanelShell", () => ({
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

function result(): MultiNodeDnsResult {
  return {
    domain: "example.com",
    elapsedMs: 5000,
    commandHint: "dnsLookup(multi, 'example.com')",
    answers: [
      {
        nodeId: "gp-0",
        nodeLabel: "Globalping · Tokyo/JP",
        ok: true,
        answers: ["A 192.0.2.1"],
        detail: `;; DiG verbose output\n${"technical output ".repeat(40)}`,
      },
      {
        nodeId: "globalping-status",
        nodeLabel: "Globalping",
        ok: false,
        answers: [],
        detail: "Globalping rate limit reached (HTTP 429). Try again later.",
      },
    ],
  }
}

describe("MultiNodePanel", () => {
  it("localizes result status and keeps verbose probe output collapsed", () => {
    render(
      <MultiNodePanel
        loading={false}
        loadingNodes={false}
        agentMutation={null}
        result={result()}
        nodes={[]}
        toolEnabled
        onCompare={vi.fn()}
        onRefreshNodes={vi.fn()}
        onAddAgent={vi.fn()}
        onRemoveAgent={vi.fn()}
      />,
    )

    expect(screen.getByText("正常")).toBeInTheDocument()
    expect(screen.getByText("失败")).toBeInTheDocument()
    const details = screen.getByText("技术详情").closest("details")
    expect(details).not.toHaveAttribute("open")
    expect(screen.getByText(/Globalping rate limit reached/)).toBeVisible()
  })
})
