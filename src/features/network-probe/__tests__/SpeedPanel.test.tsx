import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SpeedSampleEvent, SpeedTestResult } from "@/lib/tauri/types/network-probe"
import { SpeedPanel } from "../components/SpeedPanel"

const i18nState = vi.hoisted(() => ({
  language: "zh" as "zh" | "en",
  translations: {
    zh: {
      "networkProbe.speed.cancelled": "已取消",
      "networkProbe.speed.running": "测速中…",
      "networkProbe.speed.sourceUnavailable": "测速源不可达。",
      "networkProbe.speed.phase.ping": "测量延迟",
      "networkProbe.speed.phase.download": "下载中",
      "networkProbe.speed.phase.upload": "上传中",
      "networkProbe.speed.emptyResponse": "测速源返回了空响应。",
      "networkProbe.speed.requestFailed": "测速请求失败。",
    },
    en: {
      "networkProbe.speed.cancelled": "cancelled",
      "networkProbe.speed.running": "Testing…",
      "networkProbe.speed.sourceUnavailable": "Speed source unavailable.",
      "networkProbe.speed.phase.ping": "Measuring ping",
      "networkProbe.speed.phase.download": "Downloading",
      "networkProbe.speed.phase.upload": "Uploading",
      "networkProbe.speed.emptyResponse": "The speed source returned an empty response.",
      "networkProbe.speed.requestFailed": "The request failed.",
    },
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations = i18nState.translations[i18nState.language] as Record<string, string>
      return translations[key] ?? key
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({
    toolbar,
    children,
  }: {
    toolbar: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

function result(overrides: Partial<SpeedTestResult> = {}): SpeedTestResult {
  return {
    sourceId: "librespeed-org",
    sourceName: "LibreSpeed.org",
    ok: false,
    cancelled: false,
    sessionId: "session-1",
    message: "Speed source unreachable or returned no usable samples. Wait before retrying.",
    commandHint: "startSpeedTest('librespeed-org')",
    ...overrides,
  }
}

function renderPanel(options: {
  loading?: boolean
  result?: SpeedTestResult | null
  sample?: SpeedSampleEvent | null
}) {
  return render(
    <SpeedPanel
      loading={options.loading ?? false}
      canCancel={false}
      sources={[]}
      result={options.result ?? null}
      sample={options.sample ?? null}
      cooldownUntil={null}
      toolEnabled
      onLoadSources={vi.fn()}
      onRun={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe("SpeedPanel feedback", () => {
  afterEach(() => {
    cleanup()
    i18nState.language = "zh"
  })

  it("shows the localized unavailable state without the backend English message", () => {
    i18nState.language = "zh"
    renderPanel({ result: result() })

    expect(screen.getByText("测速源不可达。")).toBeInTheDocument()
    expect(
      screen.queryByText(/Speed source unreachable or returned no usable samples/),
    ).not.toBeInTheDocument()
  })

  it("does not append the English running state to the translated phase", () => {
    renderPanel({
      loading: true,
      sample: { phase: "ping", value: 0, detail: "running" },
    })

    expect(screen.getByText("测量延迟")).toBeInTheDocument()
    expect(screen.queryByText(/running/)).not.toBeInTheDocument()
  })

  it("does not expose unknown backend phase or detail strings", () => {
    renderPanel({
      loading: true,
      sample: { phase: "internal-phase", value: 0, detail: "internal-debug-state" },
    })

    expect(screen.queryByText(/internal-phase|internal-debug-state/)).not.toBeInTheDocument()
  })

  it("localizes cancellation instead of rendering the backend result message", () => {
    renderPanel({ result: result({ cancelled: true, message: "Speed test cancelled." }) })

    expect(screen.getByText("已取消", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText("Speed test cancelled.")).not.toBeInTheDocument()
  })

  it("adds the ping unit to streamed sample values", () => {
    renderPanel({
      loading: true,
      sample: { phase: "ping", value: 6.2, detail: "sample" },
    })

    expect(screen.getByText("测量延迟 · 6.2 ms")).toBeInTheDocument()
  })
})
