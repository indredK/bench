import { describe, expect, it } from "vitest"
import { getRecommendedInstallList } from "@/features/app-manager/recommended-apps"

const uninstallable = {
  launch: true,
  reveal: true,
  upgrade: true,
  uninstall: true,
}

describe("recommended app correlation", () => {
  it("does not expose destructive identity from a display-name-only match", () => {
    const chrome = getRecommendedInstallList([
      {
        appId: "app-v1-unrelated",
        name: "Google Chrome",
        bundleId: "unknown",
        sourceId: "",
        version: "1.0",
        installPath: "C:\\Unrelated\\chrome.exe",
        allowedActions: uninstallable,
      },
    ]).find((app) => app.id === "google-chrome")

    expect(chrome?.installed).toBe(true)
    expect(chrome?.installedAppId).toBeUndefined()
    expect(chrome?.installedCanUninstall).toBe(false)
  })

  it("retains destructive identity for an exact package-source match", () => {
    const chrome = getRecommendedInstallList([
      {
        appId: "app-v1-chrome",
        name: "Chrome",
        bundleId: "windows:registry:chrome",
        sourceId: "Google.Chrome",
        version: "1.0",
        installPath: "C:\\Chrome\\chrome.exe",
        allowedActions: uninstallable,
      },
    ]).find((app) => app.id === "google-chrome")

    expect(chrome?.installedAppId).toBe("app-v1-chrome")
    expect(chrome?.installedCanUninstall).toBe(true)
  })
})
