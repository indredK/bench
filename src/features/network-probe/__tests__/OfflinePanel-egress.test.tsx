import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OfflinePanel } from "@/features/network-probe/components/OfflinePanel"
import type { PublicIpInfo } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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

afterEach(() => cleanup())

describe("OfflinePanel egress result", () => {
  it("uses the same collapsed technical details as the standalone egress panel", () => {
    const publicIp: PublicIpInfo = {
      ip: "203.0.113.42",
      source: "ipify",
      detail: '{"ip":"203.0.113.42"}',
      commandHint: "getPublicIpInfo(local)",
    }

    render(
      <OfflinePanel
        loading={false}
        focus="egress"
        captive={null}
        publicIp={publicIp}
        proxyVpn={null}
        ipv6={null}
        mtu={null}
        onRunAll={() => undefined}
        onOpenMtu={() => undefined}
      />,
    )

    expect(screen.getByText("203.0.113.42")).toBeTruthy()
    const details = screen.getByText("networkProbe.egress.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("ipify").closest("details")).toBe(details)
    expect(screen.getByText(publicIp.detail!).closest("details")).toBe(details)
    expect(screen.getByText(publicIp.commandHint).closest("details")).toBe(details)
  })
})
