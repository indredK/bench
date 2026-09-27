import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { MultiNodeProbeResult } from "@/lib/tauri/types/network-probe"
import { MultiNodePanel } from "../components/MultiNodePanel"

const translations: Record<string, string> = {
  "networkProbe.nodes.hint": "多节点探测",
  "networkProbe.nodes.remotePrivacy": "远端会收到目标",
  "networkProbe.nodes.statusOk": "正常",
  "networkProbe.nodes.statusFail": "失败",
  "networkProbe.nodes.failedHint": "此节点未返回有效的探测数据。",
  "networkProbe.nodes.technicalDetails": "技术详情",
  "networkProbe.nodes.listTitle": "探测节点",
  "networkProbe.nodes.addTitle": "添加 agent",
  "networkProbe.nodes.addHint": "仅允许 HTTPS/WSS",
  "networkProbe.nodes.labelPlaceholder": "名称",
  "networkProbe.nodes.endpointPlaceholder": "https://agent.example",
  "networkProbe.nodes.addAgent": "添加 agent",
  "networkProbe.nodes.removeAgent": "移除",
  "networkProbe.nodes.meta": "{{type}} · {{target}} · {{count}} 个节点 · {{ms}} ms",
  "networkProbe.nodes.run": "运行多节点对比",
  "networkProbe.nodes.running": "探测中…",
  "networkProbe.nodes.measurementLabel": "探测类型",
  "networkProbe.nodes.targetLabel": "探测目标",
  "networkProbe.nodes.types.dns": "DNS",
  "networkProbe.nodes.types.ping": "Ping",
  "networkProbe.nodes.types.http": "HTTP HEAD",
  "networkProbe.nodes.domainPlaceholder": "example.com",
  "networkProbe.nodes.httpPlaceholder": "https://example.com",
  "networkProbe.nodes.locationsLabel": "Globalping 区域",
  "networkProbe.nodes.locationsHint": "最多 3 个区域",
  "networkProbe.nodes.locations.world": "全球",
  "networkProbe.nodes.locations.us": "美国",
  "networkProbe.nodes.locations.europe": "欧洲",
  "networkProbe.nodes.locations.asia": "亚洲",
  "networkProbe.nodes.tokenTitle": "Globalping API token",
  "networkProbe.nodes.tokenHint": "保存到系统钥匙串",
  "networkProbe.nodes.tokenPlaceholder": "粘贴 token",
  "networkProbe.nodes.tokenSave": "安全保存",
  "networkProbe.nodes.tokenClear": "移除 token",
  "networkProbe.nodes.tokenUnavailable": "钥匙串不可用",
  "networkProbe.nodes.metrics.dnsAnswer": "{{value}}",
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

function result(): MultiNodeProbeResult {
  return {
    target: "example.com",
    measurementType: "dns",
    elapsedMs: 5000,
    commandHint: "measureMulti(type:'dns', target:'example.com')",
    results: [
      {
        nodeId: "local",
        nodeLabel: "This Mac",
        ok: true,
        summary: [{ key: "dnsAnswer", value: "A 192.0.2.1" }],
      },
      {
        nodeId: "gp-0",
        nodeLabel: "Globalping · Tokyo/JP",
        ok: true,
        summary: [{ key: "dnsAnswer", value: "A 192.0.2.2" }],
        detail: `;; DiG verbose output\n${"technical output ".repeat(40)}`,
      },
      {
        nodeId: "globalping-status",
        nodeLabel: "Globalping",
        ok: false,
        summary: [],
        detail: "Globalping rate limit reached (HTTP 429). Try again later.",
      },
    ],
  }
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof MultiNodePanel>> = {}) {
  const onMeasure = vi.fn()
  render(
    <MultiNodePanel
      loading={false}
      loadingNodes={false}
      loadingToken={false}
      agentMutation={null}
      result={result()}
      tokenStatus={{ available: true, configured: false }}
      nodes={[]}
      toolEnabled
      onMeasure={onMeasure}
      onRefreshNodes={vi.fn()}
      onSaveToken={vi.fn().mockResolvedValue(true)}
      onClearToken={vi.fn()}
      onAddAgent={vi.fn()}
      onRemoveAgent={vi.fn()}
      {...overrides}
    />,
  )
  return { onMeasure }
}

describe("MultiNodePanel", () => {
  it("localizes local and remote status and keeps verbose results collapsed", () => {
    renderPanel()

    expect(screen.getAllByText("正常")).toHaveLength(2)
    expect(screen.getByText("失败")).toBeVisible()
    expect(screen.getByText("networkProbe.nodeSelect.local")).toBeVisible()
    const details = screen.getAllByText("技术详情")[0].closest("details")
    expect(details).not.toHaveAttribute("open")
    expect(screen.getByText("此节点未返回有效的探测数据。")).toBeVisible()
    expect(screen.getByText(/Globalping rate limit reached/)).not.toBeVisible()
    expect(screen.getByText("远端会收到目标")).toBeVisible()
  })

  it("runs an HTTP comparison with selected regions and requires a URL", () => {
    const { onMeasure } = renderPanel({ result: null })
    const typeSelect = screen.getByRole("combobox", { name: "探测类型" })
    fireEvent.change(typeSelect, { target: { value: "http" } })

    const target = screen.getByRole("textbox", { name: "探测目标" })
    expect(target).toHaveValue("https://example.com")
    fireEvent.change(target, { target: { value: "https://example.org/status?token=secret" } })
    fireEvent.click(screen.getByLabelText("美国"))
    fireEvent.click(screen.getByLabelText("亚洲"))
    fireEvent.click(screen.getByRole("button", { name: "运行多节点对比" }))

    expect(onMeasure).toHaveBeenCalledWith("https://example.org/status?token=secret", "http", [
      "world",
      "Europe",
      "Asia",
    ])
  })

  it("sends a token only through the save callback and clears the password field on success", async () => {
    const onSaveToken = vi.fn().mockResolvedValue(true)
    renderPanel({ result: null, onSaveToken })
    const tokenInput = screen.getByLabelText("Globalping API token")
    fireEvent.change(tokenInput, { target: { value: "temporary-test-token" } })
    fireEvent.click(screen.getByRole("button", { name: "安全保存" }))

    expect(onSaveToken).toHaveBeenCalledWith("temporary-test-token")
    await waitFor(() => expect(tokenInput).toHaveValue(""))
  })
})
