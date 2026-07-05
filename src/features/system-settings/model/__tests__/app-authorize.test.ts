import { describe, expect, it } from "vitest"
import {
  appBundleDisplayName,
  formatMacAppAuthorizeCommand,
  isMacAppBundlePath,
} from "@/features/system-settings/model/app-authorize"

describe("app-authorize helpers", () => {
  it("extracts display name from .app bundle path", () => {
    expect(appBundleDisplayName("/Applications/BetterToLive.app")).toBe("BetterToLive")
  })

  it("formats shell-safe authorize command", () => {
    expect(formatMacAppAuthorizeCommand('/Applications/My "App".app')).toBe(
      'xattr -cr "/Applications/My \\"App\\".app"',
    )
  })

  it("validates .app bundle paths", () => {
    expect(isMacAppBundlePath("/Applications/Demo.app")).toBe(true)
    expect(isMacAppBundlePath("/usr/bin/demo")).toBe(false)
  })
})
