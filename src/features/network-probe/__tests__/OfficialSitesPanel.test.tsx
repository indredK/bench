import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OfficialSitesPanel } from "@/features/network-probe/components/OfficialSitesPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "networkProbe.cmd.sitesProbeOne") {
        return `startSitesProbe(local, custom[1]) // target: '${String(options?.target ?? "")}'`
      }
      return String(options?.defaultValue ?? key)
    },
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ hint, children }: { hint: string; children: ReactNode }) => (
    <div data-testid="command-hint" data-hint={hint}>
      {children}
    </div>
  ),
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

describe("official site command hints", () => {
  it("shows the single-site IPC and target on the card focus tooltip", () => {
    render(
      <OfficialSitesPanel
        loading={false}
        canCancel={false}
        cancelling={false}
        presets={[{ id: "github", target: "https://github.com", channel: "global" }]}
        latestByTarget={{}}
        result={null}
        toolEnabled
        onTestAll={vi.fn()}
        onTestOne={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const singleSiteHint = screen
      .getAllByTestId("command-hint")
      .find((element) => element.textContent?.includes("github.com"))

    expect(singleSiteHint).toHaveAttribute(
      "data-hint",
      "startSitesProbe(local, custom[1]) // target: 'https://github.com'",
    )
  })
})
