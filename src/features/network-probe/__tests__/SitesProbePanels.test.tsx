import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OfficialSitesPanel } from "@/features/network-probe/components/OfficialSitesPanel"
import { SitesProbePanel } from "@/features/network-probe/components/SitesProbePanel"
import type { SiteSampleResult, SitesProbeResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
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

const rawError = "error sending request for url (https://no-such-host.invalid/)"
const failedSample: SiteSampleResult = {
  id: "custom-0",
  target: "https://no-such-host.invalid",
  channel: "http",
  ok: false,
  error: rawError,
}
const successfulSample: SiteSampleResult = {
  id: "custom-0",
  target: "https://example.com",
  channel: "http",
  ok: true,
  httpStatus: 200,
  httpTtfbMs: 120,
}

function makeResult(results: SiteSampleResult[]): SitesProbeResult {
  return {
    packId: "custom",
    results,
    sessionId: "session-1",
    cancelled: false,
    commandHint: "sitesProbe(custom)",
  }
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe("site probe failure details", () => {
  it("shows a localized custom-site failure and keeps the raw request error collapsed", () => {
    render(
      <SitesProbePanel
        loading={false}
        canCancel={false}
        cancelRequested={false}
        result={makeResult([failedSample])}
        streaming={[]}
        sparklines={{}}
        packIds={["global", "cn-friendly"]}
        toolEnabled
        onRunPack={vi.fn()}
        onRunCustom={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.sites.failed")).toBeTruthy()
    const details = screen.getByText("networkProbe.sites.failureDetails").closest("details")
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
    expect(screen.getByText(rawError).closest("details")).toBe(details)

    fireEvent.click(screen.getByText("networkProbe.sites.failureDetails"))
    expect(details?.open).toBe(true)
  })

  it.each([
    { status: "successful", results: [successfulSample] },
    { status: "failed", results: [failedSample] },
  ])("does not duplicate the raw command in $status custom-site results", ({ results }) => {
    const result = makeResult(results)

    render(
      <SitesProbePanel
        loading={false}
        canCancel={false}
        cancelRequested={false}
        result={result}
        streaming={[]}
        sparklines={{}}
        packIds={["global"]}
        toolEnabled
        onRunPack={vi.fn()}
        onRunCustom={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByText(result.commandHint)).toBeNull()
  })

  it("keeps official-site diagnostics outside the test button", async () => {
    render(
      <OfficialSitesPanel
        loading={false}
        canCancel={false}
        cancelRequested={false}
        presets={[{ id: "baidu", target: "https://no-such-host.invalid", channel: "http" }]}
        result={makeResult([{ ...failedSample, id: "baidu" }])}
        streaming={[]}
        toolEnabled
        onTestAll={vi.fn()}
        onTestOne={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByText("networkProbe.sites.failed")).toBeTruthy())
    const testButton = screen.getByRole("button", { name: /networkProbe\.official\.sites\.baidu/ })
    expect(testButton.querySelector("details")).toBeNull()
    expect(testButton.textContent).not.toContain(rawError)

    const details = screen.getByText("networkProbe.sites.failureDetails").closest("details")
    expect(details?.open).toBe(false)
    fireEvent.click(screen.getByText("networkProbe.sites.failureDetails"))
    expect(details?.open).toBe(true)
  })

  it("keeps pack controls disabled while an official-site request owns the shared scan slot", () => {
    render(
      <SitesProbePanel
        loading={false}
        busy
        canCancel
        cancelRequested={false}
        result={null}
        streaming={[]}
        sparklines={{}}
        packIds={["global"]}
        toolEnabled
        onRunPack={vi.fn()}
        onRunCustom={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "networkProbe.sites.run" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: "networkProbe.sites.customRun" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: "networkProbe.sites.cancel" }).hasAttribute("disabled"),
    ).toBe(false)
  })
})
