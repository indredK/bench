import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SpeedPanel } from "@/features/network-probe/components/SpeedPanel"
import type { SpeedTestResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}))

afterEach(() => cleanup())

const source = {
  id: "local",
  name: "Local",
  baseUrl: "https://speed.example.test",
  dlPath: "/download",
  ulPath: "/upload",
  pingPath: "/ping",
}

function renderResult(result: SpeedTestResult) {
  return render(
    <SpeedPanel
      loading={false}
      canCancel={false}
      cancelling={false}
      sources={[source]}
      result={result}
      sample={null}
      cooldownUntil={null}
      toolEnabled
      onLoadSources={vi.fn()}
      onRun={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe("SpeedPanel terminal feedback", () => {
  it("shows localized source-unavailable feedback without the backend message", () => {
    renderResult({
      sourceId: source.id,
      sourceName: source.name,
      ok: false,
      cancelled: false,
      sessionId: "session-1",
      message:
        "Speed source unreachable or returned no usable samples. Wait before retrying (cooldown).",
      commandHint: "startSpeedTest('local')",
    })

    expect(screen.getByText("networkProbe.speed.sourceUnavailable")).toBeInTheDocument()
    expect(screen.queryByText(/Speed source unreachable/)).not.toBeInTheDocument()
  })

  it("shows localized cancellation feedback without the backend message", () => {
    renderResult({
      sourceId: source.id,
      sourceName: source.name,
      ok: false,
      cancelled: true,
      sessionId: "session-2",
      message: "Speed test cancelled.",
      commandHint: "startSpeedTest('local')",
    })

    expect(screen.getByText(/networkProbe\.speed\.cancelled/)).toBeInTheDocument()
    expect(screen.queryByText("Speed test cancelled.")).not.toBeInTheDocument()
    expect(screen.queryByText("networkProbe.speed.sourceUnavailable")).not.toBeInTheDocument()
  })
})
