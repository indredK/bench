import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PackInstallDialog } from "@/features/network-probe/components/PackInstallDialog"
import type { CapabilityPackInfo } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { status?: string }) => {
      if (key === "networkProbe.packs.meta") return options?.status ?? key
      const translations: Record<string, string> = {
        "networkProbe.packs.status.installed": "已安装",
        "networkProbe.packs.status.available": "可用",
        "networkProbe.packs.status.unavailable": "不可用",
        "networkProbe.packs.status.unknown": "状态未知",
      }
      return translations[key] ?? key
    },
  }),
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
  {
    id: "pcap-diag",
    version: "1.0.0",
    sizeBytes: 2048,
    status: "installed",
    descriptionKey: "networkProbe.packs.desc.pcapDiag",
    artifactReady: true,
  },
  {
    id: "priv-helper",
    version: "1.0.0",
    sizeBytes: 4096,
    status: "unavailable",
    descriptionKey: "networkProbe.packs.desc.privHelper",
    artifactReady: false,
  },
  {
    id: "future-pack",
    version: "1.0.0",
    sizeBytes: 4096,
    status: "future-state",
    descriptionKey: "networkProbe.packs.desc.privHelper",
    artifactReady: false,
  },
]

afterEach(() => cleanup())

describe("PackInstallDialog refresh state", () => {
  it("localizes pack statuses and falls back for unknown values", () => {
    render(
      <PackInstallDialog
        open
        packs={packs}
        busy={false}
        refreshing={false}
        onOpenChange={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: /adv-scanner.*可用/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /pcap-diag.*已安装/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /priv-helper.*不可用/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /future-pack.*状态未知/ })).toBeInTheDocument()
    expect(screen.queryByText("available", { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByText("installed", { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByText("unavailable", { exact: false })).not.toBeInTheDocument()
  })

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
