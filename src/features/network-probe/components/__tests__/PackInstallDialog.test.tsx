import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { PackInstallDialog } from "@/features/network-probe/components/PackInstallDialog"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const pack = {
  id: "adv-scanner",
  version: "1.0.0",
  sizeBytes: 1_000_000,
  status: "missing_pack",
  descriptionKey: "networkProbe.packs.desc.advScanner",
  artifactReady: false,
}

describe("PackInstallDialog", () => {
  it("shows a refreshing state and disables conflicting pack actions", () => {
    render(
      <PackInstallDialog
        open
        packs={[pack]}
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
