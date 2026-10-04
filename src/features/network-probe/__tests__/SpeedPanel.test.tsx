import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SpeedPanel } from "@/features/network-probe/components/SpeedPanel"
import type {
  SpeedSampleEvent,
  SpeedSource,
  SpeedTestResult,
} from "@/lib/tauri/types/network-probe"

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
  SelectTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
}))

const source: SpeedSource = {
  id: "test-source",
  name: "Test source",
  baseUrl: "https://example.com/",
  dlPath: "download",
  ulPath: "upload",
  pingPath: "ping",
}

const completeResult: SpeedTestResult = {
  sourceId: source.id,
  sourceName: source.name,
  pingMs: 10,
  jitterMs: 1,
  downloadMbps: 100,
  uploadMbps: 20,
  ok: true,
  cancelled: false,
  sessionId: "session-1",
  commandHint: "startSpeedTest('test-source')",
}

const noop = () => undefined

function renderPanel(options: {
  result?: SpeedTestResult | null
  sample?: SpeedSampleEvent | null
  loading?: boolean
}) {
  return render(
    <SpeedPanel
      loading={options.loading ?? false}
      canCancel={options.loading ?? false}
      sources={[source]}
      result={options.result ?? null}
      sample={options.sample ?? null}
      cooldownUntil={null}
      toolEnabled
      onLoadSources={noop}
      onRun={noop}
      onCancel={noop}
    />,
  )
}

afterEach(() => cleanup())

describe("SpeedPanel result feedback", () => {
  it("marks partial measurements as incomplete", () => {
    renderPanel({
      result: { ...completeResult, uploadMbps: undefined },
    })

    expect(screen.getByText("networkProbe.speed.partialResult")).toBeTruthy()
  })

  it("keeps raw backend failure details collapsed by default", () => {
    renderPanel({
      result: {
        ...completeResult,
        pingMs: undefined,
        jitterMs: undefined,
        downloadMbps: undefined,
        uploadMbps: undefined,
        ok: false,
        message: "Speed source unreachable or returned no usable samples.",
      },
    })

    const details = screen.getByText("networkProbe.speed.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("networkProbe.speed.sourceUnavailable")).toBeTruthy()
  })

  it("localizes streaming phase failures instead of displaying raw network errors", () => {
    renderPanel({
      loading: true,
      sample: { phase: "download", value: 0, detail: "error:connection reset" },
    })

    expect(screen.getByText(/networkProbe\.speed\.phaseFailed/)).toBeTruthy()
    expect(screen.queryByText("error:connection reset")).toBeNull()
  })
})
