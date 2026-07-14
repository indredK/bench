import { describe, expect, it } from "vitest"
import type { TFunction } from "i18next"
import { createConfigItems, createNavigationItems } from "@/features/registry"
import { getFeatureGateReason } from "@/platform/capabilities"

const t = ((key: string) => key) as TFunction

describe("feature platform gating", () => {
  it("hides macOS-only navigation on Windows", () => {
    const environment = { runtime: "desktop", platform: "windows" } as const
    const paths = createNavigationItems(t, environment).map((item) => item.path)

    expect(paths).not.toContain("/account-manager")
    expect(paths).not.toContain("/clean-space")
    expect(paths).not.toContain("/hardware")
    expect(createConfigItems(t, environment)).toEqual([])
    expect(paths).toContain("/app-manager")
  })

  it("keeps macOS-only navigation on macOS desktop", () => {
    const environment = { runtime: "desktop", platform: "macos" } as const
    const paths = createNavigationItems(t, environment).map((item) => item.path)

    expect(paths).toContain("/account-manager")
    expect(paths).toContain("/clean-space")
    expect(paths).toContain("/hardware")
    expect(createConfigItems(t, environment)).toHaveLength(1)
  })

  it("keeps pure frontend modules available in browser preview", () => {
    const environment = { runtime: "browser", platform: "windows" } as const
    const paths = createNavigationItems(t, environment).map((item) => item.path)

    expect(paths).toContain("/terminology")
    expect(paths).not.toContain("/quick-launch")
    expect(paths).not.toContain("/app-manager")
  })

  it("reports direct-route platform mismatches as unsupported", () => {
    expect(
      getFeatureGateReason(
        { desktopOnly: true, platforms: ["macos"] },
        { runtime: "desktop", platform: "windows" },
      ),
    ).toEqual({
      gated: true,
      reason: "platform-unsupported",
      platform: "windows",
    })
  })
})
