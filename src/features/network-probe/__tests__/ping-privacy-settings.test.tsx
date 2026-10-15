import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import type { PingProbeResult } from "@/lib/tauri/types/network-probe"

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

function resultWithSampleError(error: "permission_denied" | "timeout"): PingProbeResult {
  return {
    target: "192.168.8.1",
    resolvedIp: "192.168.8.1",
    packetsSent: 1,
    packetsReceived: 0,
    lossPercent: 100,
    samples: [{ seq: 0, ok: false, error }],
    sessionId: "ping-session",
    cancelled: false,
    commandHint: "pingHost(local)",
  }
}

describe("network-probe Ping privacy guidance", () => {
  it("opens Privacy & Security when a sample has a permission-denied error", () => {
    const openPrivacySettings = vi.fn()

    render(
      <PingPanel
        loading={false}
        result={resultWithSampleError("permission_denied")}
        streamingSamples={[]}
        toolEnabled
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onOpenPrivacySettings={openPrivacySettings}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "networkProbe.ping.openPrivacySettings" }))

    expect(openPrivacySettings).toHaveBeenCalledTimes(1)
  })

  it("disables the settings action while it is already opening", () => {
    render(
      <PingPanel
        loading={false}
        result={resultWithSampleError("permission_denied")}
        streamingSamples={[]}
        toolEnabled
        canCancel={false}
        cancelling={false}
        openingPrivacySettings
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onOpenPrivacySettings={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "networkProbe.ping.openingPrivacySettings" }),
    ).toBeDisabled()
  })

  it("does not offer a permission-settings action for a normal timeout", () => {
    render(
      <PingPanel
        loading={false}
        result={resultWithSampleError("timeout")}
        streamingSamples={[]}
        toolEnabled
        canCancel={false}
        cancelling={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onOpenPrivacySettings={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "networkProbe.ping.openPrivacySettings" }),
    ).not.toBeInTheDocument()
  })
})
