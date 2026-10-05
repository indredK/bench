import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PackInstallDialog } from "@/features/network-probe/components/PackInstallDialog"
import type { CapabilityPackInfo } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const packs: CapabilityPackInfo[] = [
  {
    id: "adv-scanner",
    version: "1.0.0",
    sizeBytes: 1024,
    status: "available",
    descriptionKey: "networkProbe.packs.desc.advScanner",
    artifactReady: false,
  },
]

afterEach(() => cleanup())

describe("PackInstallDialog refresh state", () => {
  it("shows progress and disables actions while the capability snapshot refreshes", () => {
    render(
      <PackInstallDialog
        open
        packs={packs}
        busy={false}
        refreshing
        onOpenChange={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "networkProbe.packs.refreshing" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "networkProbe.packs.install" })).toBeDisabled()
  })
})
