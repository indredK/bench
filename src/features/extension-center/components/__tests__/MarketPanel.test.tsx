import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MarketPanel } from "@/features/extension-center/components/MarketPanel"
import type { MarketListing } from "@/lib/tauri/types/extension-center"

const mocks = vi.hoisted(() => ({
  useMarketController: vi.fn(),
  i18n: { language: "en", resolvedLanguage: "en" },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: mocks.i18n }),
}))

vi.mock("../../hooks/useMarketController", () => ({
  useMarketController: mocks.useMarketController,
}))

const listing: MarketListing = {
  updatedAt: null,
  extensions: [
    {
      id: "photo-triage",
      displayEn: "Photo Triage",
      displayZh: "照片筛选",
      descriptionEn: null,
      descriptionZh: null,
      publisherName: null,
      versions: [
        {
          version: "1.0.0",
          enginesBench: "*",
          size: 100,
          publishedAt: null,
          yanked: false,
          compatible: true,
          installed: false,
          updateAvailable: false,
        },
      ],
    },
  ],
  revokedHits: [],
}

function controllerState(overrides: Record<string, unknown> = {}) {
  return {
    marketListing: listing,
    marketLoading: false,
    marketError: null,
    pendingPreview: null,
    committing: false,
    busyIds: [],
    refreshMarket: vi.fn(),
    prepareInstall: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  mocks.useMarketController.mockReturnValue(controllerState())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("MarketPanel refresh feedback", () => {
  it("keeps the last successful listing visible after a refresh error", () => {
    mocks.useMarketController.mockReturnValue(
      controllerState({
        marketError: { code: "EXTENSION_REGISTRY_TOO_LARGE", message: "oversized" },
      }),
    )

    render(<MarketPanel />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText("Photo Triage")).toBeInTheDocument()
    expect(
      screen.getByText("[EXTENSION_REGISTRY_TOO_LARGE] errors.EXTENSION_REGISTRY_TOO_LARGE"),
    ).toBeInTheDocument()
  })

  it("shows a compact refreshing state while retaining existing entries", () => {
    mocks.useMarketController.mockReturnValue(controllerState({ marketLoading: true }))

    render(<MarketPanel />)

    expect(screen.getByRole("status")).toHaveTextContent("extensionCenter.market.refreshing")
    expect(screen.getByText("Photo Triage")).toBeInTheDocument()
  })
})
