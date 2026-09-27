import { act, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PackInstallDialog } from "@/features/network-probe/components/PackInstallDialog"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "networkProbe.packs.dialogTitle": "可选能力包",
        "networkProbe.packs.dialogHint": "能力包说明",
        "networkProbe.packs.meta": "v{{version}} · {{sizeMb}} MB · {{status}}",
        "networkProbe.packs.gatekeeperNote": "Gatekeeper 说明",
        "networkProbe.packs.refresh": "刷新",
        "networkProbe.packs.refreshing": "正在刷新…",
        "networkProbe.packs.install": "安装",
        "networkProbe.packs.installing": "安装中…",
        "networkProbe.packs.desc": "能力包描述",
      })[key] ?? key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("PackInstallDialog", () => {
  it("shows refresh progress and blocks repeated or conflicting actions", async () => {
    const pending = deferred<void>()
    const onRefresh = vi.fn(() => pending.promise)
    const onInstall = vi.fn()

    render(
      <PackInstallDialog
        open
        packs={[
          {
            id: "pcap-diag",
            version: "1.0.0",
            sizeBytes: 1_000_000,
            status: "missing",
            descriptionKey: "networkProbe.packs.desc.pcapDiag",
            artifactReady: true,
          },
        ]}
        busy={false}
        onOpenChange={vi.fn()}
        onRefresh={onRefresh}
        onInstall={onInstall}
        onUninstall={vi.fn()}
      />,
    )

    const refreshButton = screen.getByRole("button", { name: "刷新" })
    act(() => {
      refreshButton.click()
      refreshButton.click()
    })

    expect(onRefresh).toHaveBeenCalledOnce()
    const refreshingButton = screen.getByRole("button", { name: "正在刷新…" })
    expect(refreshingButton).toBeDisabled()
    expect(refreshingButton).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: "安装" })).toBeDisabled()
    expect(onInstall).not.toHaveBeenCalled()

    pending.resolve()
    await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled())
  })
})
