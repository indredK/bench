import { act, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SpeedPanel } from "@/features/network-probe/components/SpeedPanel"
import type { SpeedTestResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ children, toolbar }: { children: ReactNode; toolbar: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

describe("SpeedPanel cooldown timer", () => {
  afterEach(() => vi.useRealTimers())

  it("stops its interval after the cooldown expires", () => {
    vi.useFakeTimers()
    const cooldownUntil = Date.now() + 1_000

    render(
      <SpeedPanel
        loading={false}
        canCancel={false}
        sources={[]}
        result={null}
        sample={null}
        cooldownUntil={cooldownUntil}
        toolEnabled
        onLoadSources={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(1_000))

    expect(vi.getTimerCount()).toBe(0)
  })

  it("shows an unavailable result when ping works but bandwidth phases fail", () => {
    const message = "Speed source returned no usable bandwidth samples."
    render(
      <SpeedPanel
        loading={false}
        canCancel={false}
        sources={[]}
        result={
          {
            sourceId: "self-hosted",
            sourceName: "Self-hosted",
            pingMs: 12,
            ok: false,
            cancelled: false,
            sessionId: "speed-ping-only",
            message,
            commandHint: "startSpeedTest('self-hosted')",
          } satisfies SpeedTestResult
        }
        sample={null}
        cooldownUntil={null}
        toolEnabled
        onLoadSources={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.speed.sourceUnavailable")).toBeTruthy()
    expect(screen.queryByText(message)).toBeNull()
  })

  it("labels a bandwidth result with one missing direction as partial", () => {
    render(
      <SpeedPanel
        loading={false}
        canCancel={false}
        sources={[]}
        result={{
          sourceId: "self-hosted",
          sourceName: "Self-hosted",
          pingMs: 12,
          downloadMbps: 42,
          ok: true,
          cancelled: false,
          sessionId: "speed-partial",
          commandHint: "startSpeedTest('self-hosted')",
        }}
        sample={null}
        cooldownUntil={null}
        toolEnabled
        onLoadSources={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.speed.partialResult")).toBeTruthy()
    expect(screen.queryByText("networkProbe.speed.sourceUnavailable")).toBeNull()
  })

  it("localizes built-in speed-source names", () => {
    render(
      <SpeedPanel
        loading={false}
        canCancel={false}
        sources={[]}
        result={{
          sourceId: "librespeed-selfhost-template",
          sourceName: "Self-hosted template (often offline)",
          downloadMbps: 42,
          uploadMbps: 8,
          ok: true,
          cancelled: false,
          sessionId: "speed-localized-source",
          commandHint: "startSpeedTest('librespeed-selfhost-template')",
        }}
        sample={null}
        cooldownUntil={null}
        toolEnabled
        onLoadSources={vi.fn()}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.speed.sources.selfHostedTemplate")).toBeTruthy()
    expect(screen.queryByText("Self-hosted template (often offline)")).toBeNull()
  })
})
