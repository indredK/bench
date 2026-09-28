/**
 * Test / 测试: preserve table semantics when traceroute rows are virtualized.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TraceroutePanel } from "../TraceroutePanel"
import type { TracerouteHop, TracerouteResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 6) }, (_, index) => ({
        index,
        size: estimateSize(),
        start: index * estimateSize(),
      })),
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("../ProbePanelShell", () => ({
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

function createHop(ttl: number): TracerouteHop {
  return {
    ttl,
    addrs: [`192.0.2.${ttl}`],
    lossPercent: 0,
    avgRttMs: 10,
    bestRttMs: 9,
    worstRttMs: 11,
    sent: 3,
    recv: 3,
  }
}

function createResult(hops: TracerouteHop[]): TracerouteResult {
  return {
    target: "example.com",
    resolvedIp: "192.0.2.1",
    privilegeMode: "unprivileged",
    hops,
    rounds: 3,
    elapsedMs: 120,
    sessionId: "session-1",
    cancelled: false,
    commandHint: "traceroute example.com",
  }
}

describe("TraceroutePanel", () => {
  it("keeps a long hop table bounded while exposing complete row count and positions", () => {
    const hops = Array.from({ length: 60 }, (_, index) => createHop(index + 1))
    const { container } = render(
      <TraceroutePanel
        loading={false}
        canCancel={false}
        result={createResult(hops)}
        streamingHops={[]}
        toolEnabled
        onRun={() => {}}
        onCancel={() => {}}
      />,
    )

    const table = screen.getByRole("table")
    expect(table).toHaveAttribute("aria-rowcount", "61")
    expect(screen.getAllByRole("row")).toHaveLength(7)
    expect(screen.getByText("192.0.2.6").closest("tr")).toHaveAttribute("aria-rowindex", "7")
    expect(screen.queryByText("192.0.2.60")).not.toBeInTheDocument()
    expect(container.querySelector(".max-h-80")).not.toBeNull()
  })
})
