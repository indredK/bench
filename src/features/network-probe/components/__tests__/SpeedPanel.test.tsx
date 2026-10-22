import { act, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SpeedPanel } from "@/features/network-probe/components/SpeedPanel"

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
})
