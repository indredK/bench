import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MarketPanel } from "./MarketPanel"

const mocks = vi.hoisted(() => ({
  marketListing: null as unknown,
  prepareInstall: vi.fn(),
  refreshMarket: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        "extensionCenter.market.install": "Install",
        "extensionCenter.market.update": "Update",
        "extensionCenter.market.revoked": "Revoked",
        "extensionCenter.market.revokedReason": "Reason: {reason}",
        "extensionCenter.market.selectVersion": "Select a version to install",
        "extensionCenter.market.noInstallableVersion":
          "No compatible release is currently available to install",
        "extensionCenter.market.noUpdateAvailable": "No compatible update is currently available",
        "extensionCenter.market.revokedBanner": "Revoked extensions were force-disabled",
        "extensionCenter.market.revokedNote":
          "The installed version was force-disabled. Choose a safe release to update, or uninstall the extension.",
      }
      return translations[key] ?? options?.defaultValue ?? key
    },
  }),
}))

vi.mock("../hooks/useMarketController", () => ({
  useMarketController: () => ({
    marketListing: mocks.marketListing,
    marketLoading: false,
    marketError: null,
    busyIds: [],
    refreshMarket: mocks.refreshMarket,
    prepareInstall: mocks.prepareInstall,
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
})
