import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProbeTargetPanel } from "@/features/network-probe/components/ProbeTargetPanel"
import type { ProbeTargetResult } from "@/lib/tauri/types/network-probe"

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

afterEach(() => cleanup())

function renderResult(kind: string) {
  const result: ProbeTargetResult = {
    input: "example.com",
    kind,
    commandHint: "probeTarget(local, 'example.com')",
  }

  return render(<ProbeTargetPanel loading={false} result={result} onRun={vi.fn()} />)
}

describe("ProbeTargetPanel input kind", () => {
  it.each([
    ["host", "networkProbe.probe.kindValues.host"],
    ["url", "networkProbe.probe.kindValues.url"],
    ["future-kind", "networkProbe.probe.kindValues.unknown"],
  ])("localizes the %s input kind", (kind, labelKey) => {
    renderResult(kind)

    expect(screen.getByText(labelKey)).toBeInTheDocument()
    expect(screen.queryByText(kind)).not.toBeInTheDocument()
  })
})
