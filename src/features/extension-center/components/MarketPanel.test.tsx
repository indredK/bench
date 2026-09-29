import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MarketPanel } from "./MarketPanel"

const mocks = vi.hoisted(() => ({
  marketListing: null as unknown,
  marketLoading: false,
  marketError: null as unknown,
  pendingPreview: null as unknown,
  prepareInstall: vi.fn(),
  confirmInstall: vi.fn(async () => {}),
  cancelInstall: vi.fn(async () => {}),
  refreshMarket: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; name?: string; id?: string; version?: string },
    ) => {
      const translations: Record<string, string> = {
        "extensionCenter.market.install": "Install",
        "extensionCenter.cancel": "Cancel",
        "extensionCenter.close": "Close",
        "extensionCenter.market.update": "Update",
        "extensionCenter.market.details": "Details",
        "extensionCenter.market.detailsTitle": "Extension details",
        "extensionCenter.market.detailsDescription": "{{name}} ({{id}}), version {{version}}",
        "extensionCenter.market.publisher": "Registry-declared publisher",
        "extensionCenter.market.releaseVersion": "Release version",
        "extensionCenter.market.requiresBenchLabel": "Bench version requirement",
        "extensionCenter.market.packageSize": "Package size",
        "extensionCenter.market.publishedAt": "Published",
        "extensionCenter.market.unknownDate": "Unknown",
        "extensionCenter.market.releaseStatus": "Release status",
        "extensionCenter.market.compatible": "Compatible",
        "extensionCenter.market.supported": "Supported",
        "extensionCenter.market.unsupported": "Unsupported",
        "extensionCenter.market.verificationTitle": "Package trust and permissions",
        "extensionCenter.market.verifyToViewPermissions":
          "Verify this release to inspect package trust and permissions",
        "extensionCenter.market.permissionsHiddenUntilVerified":
          "Permission details are hidden until verified",
        "extensionCenter.market.permissionGroups.photoTriage":
          "Local photo scanning and file organization",
        "extensionCenter.market.capabilityStatusNote":
          "Supported means commands passed the host ACL allow-list check",
        "extensionCenter.market.noOptionalPacks": "No optional packs are declared",
        "extensionCenter.market.verifyPackage": "Verify package",
        "extensionCenter.market.verifying": "Verifying…",
        "extensionCenter.market.trustKind.officialRegistry":
          "Official registry package checksum and file manifest verified",
        "extensionCenter.market.requestedPermissions": "Requested host commands",
        "extensionCenter.market.trustNote": "Extension code remains untrusted",
        "extensionCenter.market.revoked": "Revoked",
        "extensionCenter.market.revokedReason": "Reason: {reason}",
        "extensionCenter.market.selectVersion": "Select a version to install",
        "extensionCenter.market.noInstallableVersion":
          "No compatible release is currently available to install",
        "extensionCenter.market.noUpdateAvailable": "No compatible update is currently available",
        "extensionCenter.market.revokedBanner": "Revoked extensions were force-disabled",
        "extensionCenter.market.revokedNote":
          "The installed version was force-disabled. Choose a safe release to update, or uninstall the extension.",
        "extensionCenter.market.refreshFailed": "Market refresh failed",
        "extensionCenter.market.staleDataHint":
          "Showing the last successfully loaded catalog. Retry when your connection is available.",
        "extensionCenter.market.refreshing": "Refreshing market…",
        "extensionCenter.retry": "Retry",
      }
      return (translations[key] ?? options?.defaultValue ?? key).replace(
        /{{(name|id|version)}}/g,
        (_placeholder, name: "name" | "id" | "version") => options?.[name] ?? `{{${name}}}`,
      )
    },
  }),
}))

vi.mock("../hooks/useMarketController", () => ({
  useMarketController: () => ({
    marketListing: mocks.marketListing,
    marketLoading: mocks.marketLoading,
    marketError: mocks.marketError,
    busyIds: [],
    pendingPreview: mocks.pendingPreview,
    committing: false,
    refreshMarket: mocks.refreshMarket,
    prepareInstall: mocks.prepareInstall,
    confirmInstall: mocks.confirmInstall,
    cancelInstall: mocks.cancelInstall,
  }),
}))

vi.mock("../lib/metadata", () => ({
  useResolvedLocale: () => "en",
  selectMetadata: (
    _locale: string,
    values: { en?: string | null; zh?: string | null },
    fallback?: string,
  ) => values.en ?? values.zh ?? fallback ?? "",
}))

function version(
  value: string,
  overrides: Partial<{
    yanked: boolean
    revokedReason: string | null
    compatible: boolean
    installed: boolean
    updateAvailable: boolean
    installable: boolean
  }> = {},
) {
  return {
    version: value,
    enginesBench: "*",
    size: 1,
    publishedAt: null,
    yanked: false,
    revokedReason: null,
    compatible: true,
    installed: false,
    updateAvailable: false,
    installable: true,
    ...overrides,
  }
}

function listing(
  versions: ReturnType<typeof version>[],
  revokedHits: Array<{ id: string; version: string; reason: string }> = [],
) {
  return {
    updatedAt: null,
    revokedHits,
    extensions: [
      {
        id: "revocation-demo",
        displayEn: "Revocation Demo",
        displayZh: "吊销验证插件",
        descriptionEn: null,
        descriptionZh: null,
        publisherName: "Bench QA",
        versions,
      },
    ],
  }
}

describe("MarketPanel version selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.marketListing = null
    mocks.marketLoading = false
    mocks.marketError = null
    mocks.pendingPreview = null
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
  })

  it("shows why a release was revoked and offers a safe release", async () => {
    mocks.marketListing = listing([
      version("1.2.0", {
        revokedReason: "Registry security notice",
        installable: false,
      }),
      version("1.1.0"),
    ])

    render(<MarketPanel />)

    expect(screen.getByText("Reason: Registry security notice")).toBeInTheDocument()
    const selector = screen.getByRole("combobox", { name: "Select a version to install" })
    expect(selector).toHaveTextContent("1.1.0")
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled()

    selector.focus()
    await userEvent.keyboard("{ArrowDown}")
    expect(screen.getByRole("option", { name: "1.1.0" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "1.2.0" })).not.toBeInTheDocument()
    await userEvent.keyboard("{Enter}")
    await userEvent.click(screen.getByRole("button", { name: "Install" }))
    expect(mocks.prepareInstall).toHaveBeenCalledWith("revocation-demo", "1.1.0")
  })

  it("prepares the explicitly selected safe version and omits revoked versions", async () => {
    mocks.marketListing = listing([
      version("1.3.0"),
      version("1.2.0", { revokedReason: "Do not install", installable: false }),
      version("1.1.0"),
    ])

    render(<MarketPanel />)

    const selector = screen.getByRole("combobox", { name: "Select a version to install" })
    expect(selector).toHaveTextContent("1.3.0")
    selector.focus()
    await userEvent.keyboard("{ArrowDown}")
    expect(screen.getByRole("option", { name: "1.3.0" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "1.1.0" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "1.2.0" })).not.toBeInTheDocument()
    await userEvent.keyboard("{ArrowDown}{Enter}")
    await userEvent.click(screen.getByRole("button", { name: "Install" }))

    expect(mocks.prepareInstall).toHaveBeenCalledWith("revocation-demo", "1.1.0")
  })

  it("explains when every registry release is unavailable", () => {
    mocks.marketListing = listing([
      version("1.2.0", { revokedReason: "Security notice", installable: false }),
    ])

    render(<MarketPanel />)

    expect(
      screen.getByText("No compatible release is currently available to install"),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument()
  })

  it("distinguishes an installed version without updates from an uninstalled extension", () => {
    mocks.marketListing = listing([version("1.2.0", { installed: true, installable: false })])

    render(<MarketPanel />)

    expect(screen.getByText("No compatible update is currently available")).toBeInTheDocument()
    expect(
      screen.queryByText("No compatible release is currently available to install"),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument()
  })

  it("shows the installed revocation reason once and keeps the recovery guidance", () => {
    const reason = "Registry security notice"
    mocks.marketListing = listing(
      [
        version("1.2.0", { installed: true, revokedReason: reason, installable: false }),
        version("1.3.0", { updateAvailable: true }),
      ],
      [{ id: "revocation-demo", version: "1.2.0", reason }],
    )

    render(<MarketPanel />)

    expect(screen.getAllByText("Reason: Registry security notice")).toHaveLength(1)
    expect(screen.getByText("Revoked extensions were force-disabled")).toBeInTheDocument()
    expect(
      screen.getByText(
        "The installed version was force-disabled. Choose a safe release to update, or uninstall the extension.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled()
  })

  it("keeps the last successful listing visible when a refresh fails", async () => {
    mocks.marketListing = listing([version("1.2.0")])
    mocks.marketError = { code: "INTERNAL", message: "registry unavailable" }

    render(<MarketPanel />)

    expect(screen.getByRole("alert")).toHaveTextContent("Market refresh failed")
    expect(screen.getByText("Revocation Demo")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(mocks.refreshMarket).toHaveBeenCalledOnce()
  })

  it("shows a compact refresh status while retaining loaded market entries", () => {
    mocks.marketListing = listing([version("1.2.0")])
    mocks.marketLoading = true

    render(<MarketPanel />)

    expect(screen.getByRole("status")).toHaveTextContent("Refreshing market…")
    expect(screen.getByText("Revocation Demo")).toBeInTheDocument()
  })

  it("opens registry details without downloading or trusting registry permissions", async () => {
    mocks.marketListing = listing([version("1.2.0")])

    render(<MarketPanel />)
    await userEvent.click(screen.getByRole("button", { name: "Details" }))

    expect(screen.getByRole("dialog")).toHaveTextContent("Extension details")
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Revocation Demo (revocation-demo), version 1.2.0",
    )
    expect(screen.getByText("Registry-declared publisher")).toBeInTheDocument()
    expect(screen.getByText("Bench version requirement")).toBeInTheDocument()
    expect(
      screen.getByText("Verify this release to inspect package trust and permissions"),
    ).toBeInTheDocument()
    expect(mocks.prepareInstall).not.toHaveBeenCalled()
  })

  it("labels a non-installable details dialog as close instead of cancel", async () => {
    mocks.marketListing = listing([version("1.2.0", { installable: false })])

    render(<MarketPanel />)
    await userEvent.click(screen.getByRole("button", { name: "Details" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Verify package" })).not.toBeInTheDocument()
    expect(mocks.prepareInstall).not.toHaveBeenCalled()
  })

  it("shows package trust and the verified host-command matrix only after verification", async () => {
    mocks.marketListing = listing([version("1.2.0")])
    mocks.pendingPreview = {
      id: "revocation-demo",
      version: "1.2.0",
      enginesBench: ">=1.2.0",
      displayEn: "Revocation Demo",
      displayZh: "吊销验证插件",
      publisherName: "Bench QA",
      sizeBytes: 1,
      trustKind: "officialRegistry",
      aclCommands: ["photo_triage_scan", "photo_triage_trash"],
    }

    render(<MarketPanel />)
    await userEvent.click(screen.getByRole("button", { name: "Details" }))

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveTextContent(
      "Official registry package checksum and file manifest verified",
    )
    expect(dialog).toHaveTextContent("Local photo scanning and file organization")
    expect(dialog).toHaveTextContent("photo_triage_scan")
    expect(dialog).toHaveTextContent("photo_triage_trash")
    expect(dialog).toHaveTextContent(">=1.2.0")
  })
})
