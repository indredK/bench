import { describe, expect, it } from "vitest"

import type {
  MarketExtensionSummary,
  MarketListing,
  MarketVersionSummary,
} from "@/lib/tauri/types/extension-center"

import { compareVersions, findAvailableUpdates, latestInstallable } from "./versions"

const version = (
  value: string,
  overrides: Partial<MarketVersionSummary> = {},
): MarketVersionSummary => ({
  version: value,
  enginesBench: "*",
  size: 1,
  publishedAt: null,
  yanked: false,
  compatible: true,
  installed: false,
  updateAvailable: false,
  ...overrides,
})

const entry = (id: string, versions: MarketVersionSummary[]): MarketExtensionSummary => ({
  id,
  displayEn: id,
  displayZh: null,
  descriptionEn: null,
  descriptionZh: null,
  publisherName: null,
  versions,
})

const listing = (extensions: MarketExtensionSummary[], revoked: string[] = []): MarketListing => ({
  updatedAt: null,
  extensions,
  revokedHits: revoked.map((id) => ({ id, version: "1.0.0", reason: "bad" })),
})

describe("compareVersions", () => {
  it("按数字段而非字典序比较", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0)
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
  })
})

describe("latestInstallable", () => {
  it("跳过已撤回版本并取数字最大者", () => {
    const latest = latestInstallable(
      entry("a", [version("0.9.0"), version("0.10.0"), version("1.0.0", { yanked: true })]),
    )
    expect(latest?.version).toBe("0.10.0")
  })
})

describe("findAvailableUpdates", () => {
  it("只收最新可装版本可升级且兼容的插件", () => {
    const updates = findAvailableUpdates(
      listing(
        [
          entry("up", [
            version("1.1.0", { updateAvailable: true }),
            version("1.0.0", { installed: true }),
          ]),
          entry("current", [version("1.0.0", { installed: true })]),
          entry("incompatible", [version("2.0.0", { updateAvailable: true, compatible: false })]),
          entry("revoked", [version("1.1.0", { updateAvailable: true })]),
          entry("yanked-latest", [
            version("1.2.0", { yanked: true, updateAvailable: true }),
            version("1.0.0", { installed: true }),
          ]),
        ],
        ["revoked"],
      ),
    )
    expect(updates).toEqual({ up: "1.1.0" })
  })

  it("没有目录时返回空", () => {
    expect(findAvailableUpdates(null)).toEqual({})
  })
})
