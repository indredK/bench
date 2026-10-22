import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PackInstallDialog } from "@/features/network-probe/components/PackInstallDialog"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

afterEach(() => cleanup())

const packs = [
  {
    id: "pcap-diag",
    version: "0.1.0",
    sizeBytes: 4_000_000,
    status: "available",
    descriptionKey: "networkProbe.packs.desc.pcapDiag",
    artifactReady: false,
  },
]

describe("capability pack install feedback", () => {
  it("shows hash verification failure as a localized alert and collapses raw details", () => {
    const rawMessage = "[PACK_HASH_MISMATCH] SHA-256 mismatch: binary not installed."

    render(
      <PackInstallDialog
        open
        packs={packs}
        busy={false}
        progressText={null}
        installResult={{
          packId: "pcap-diag",
          ok: false,
          mode: "hash-mismatch",
          message: rawMessage,
          commandHint: "installCapabilityPack('pcap-diag') // hash-mismatch",
        }}
        onOpenChange={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("networkProbe.packs.hashMismatch")
    const rawDetails = screen.getByText(rawMessage).closest("details")
    expect(rawDetails).not.toHaveAttribute("open")

    fireEvent.click(screen.getByText("networkProbe.packs.resultDetails"))
    expect(rawDetails).toHaveAttribute("open")
  })

  it("omits the developer test control when no test callback is supplied", () => {
    render(
      <PackInstallDialog
        open
        packs={packs}
        busy={false}
        onOpenChange={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.queryByRole("button", { name: "networkProbe.packs.verifyFail" })).toBeNull()
    expect(screen.getByRole("button", { name: "networkProbe.packs.install" })).toBeInTheDocument()
  })
})
