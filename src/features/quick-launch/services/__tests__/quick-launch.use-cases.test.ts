import { describe, expect, it } from "vitest"

import { autoClassifyApps } from "@/features/quick-launch/services/quick-launch.use-cases"
import { classifyInventory } from "@/features/quick-launch/classification-engine"
import { SCENE_RULES_VERSION } from "@/features/quick-launch/scenes"
import type { AppInfo } from "@/lib/tauri/types/app-manager"

function app(overrides: Partial<AppInfo> = {}): AppInfo {
  return {
    appId: "app-v1-demo",
    name: "Demo",
    version: "1.0.0",
    bundleId: "com.example.demo",
    installPath: "/Applications/Demo.app",
    source: "Bundle",
    sourceType: "MacBundle",
    sourceId: "",
    sourceConfidence: 1,
    canUpgrade: false,
    canUninstall: false,
    upgradeAvailable: false,
    lastOperationResult: null,
    lastModified: 0,
    isSystemApp: false,
    iconBase64: null,
    allowedActions: { launch: true, reveal: true, upgrade: false, uninstall: false },
    ...overrides,
  }
}

describe("quick launch classification", () => {
  it("never includes an app without a verified launch target", () => {
    const result = autoClassifyApps([
      app(),
      app({
        appId: "app-v1-disabled",
        name: "Disabled",
        allowedActions: { launch: false, reveal: true, upgrade: false, uninstall: false },
      }),
    ])

    expect(Object.values(result).flat()).toContain("app-v1-demo")
    expect(Object.values(result).flat()).not.toContain("app-v1-disabled")
  })

  it("binds derived classification to an explicit rule version", () => {
    const snapshot = classifyInventory([app({ name: "Safari", bundleId: "com.apple.Safari" })])
    expect(snapshot.ruleVersion).toBe(SCENE_RULES_VERSION)
    expect(snapshot.scenes.browser).toEqual(["app-v1-demo"])
  })
})
