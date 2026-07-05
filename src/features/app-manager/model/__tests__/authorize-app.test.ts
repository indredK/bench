import { describe, expect, it, vi } from "vitest"
import type { AppInfo } from "@/lib/tauri/types/app-manager"

vi.mock("@/platform/config", () => ({
  platformName: "macos",
  platformConfig: {},
  appManagerPlatformConfig: {},
}))

import { canAuthorizeMacApp } from "@/features/app-manager/model/authorize-app"

const baseApp: AppInfo = {
  appId: "test",
  name: "Test",
  version: "1.0",
  bundleId: "com.test",
  installPath: "/Applications/Test.app",
  source: "Bundle",
  sourceType: "MacBundle",
  sourceId: "",
  sourceConfidence: 1,
  canUpgrade: false,
  canUninstall: true,
  upgradeAvailable: false,
  lastOperationResult: null,
  lastModified: 0,
  isSystemApp: false,
  iconBase64: null,
  allowedActions: {
    launch: true,
    reveal: true,
    upgrade: false,
    uninstall: true,
  },
}

describe("canAuthorizeMacApp", () => {
  it("allows non-system .app bundles on macOS user agent", () => {
    expect(canAuthorizeMacApp(baseApp)).toBe(true)
  })

  it("blocks system apps", () => {
    expect(canAuthorizeMacApp({ ...baseApp, isSystemApp: true })).toBe(false)
  })

  it("blocks non-.app paths", () => {
    expect(canAuthorizeMacApp({ ...baseApp, installPath: "/usr/bin/test" })).toBe(false)
  })
})
