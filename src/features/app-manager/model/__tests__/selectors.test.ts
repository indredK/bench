/**
 * Test / 测试: verify behavior only; 只验证行为与契约.
 */
import { describe, expect, it } from "vitest";
import { getInstalledFilterCounts } from "@/features/app-manager/model/selectors";
import type { AppInfo } from "@/lib/tauri/types/app-manager";

type AppOverrides = Partial<Omit<AppInfo, "allowedActions">> & {
  allowedActions?: Partial<AppInfo["allowedActions"]>;
};

describe("getInstalledFilterCounts", () => {
  it("returns counts for every installed type filter", () => {
    const counts = getInstalledFilterCounts([
      createApp({ appId: "user-managed", canUpgrade: true }),
      createApp({ appId: "user-launchable", allowedActions: { launch: true } }),
      createApp({
        appId: "system-unmanaged",
        isSystemApp: true,
        allowedActions: { launch: false },
      }),
    ]);

    expect(counts).toEqual({
      all: 3,
      user: 2,
      system: 1,
      launchable: 2,
      managed: 1,
    });
  });

  it("treats uninstallable apps as managed too", () => {
    const counts = getInstalledFilterCounts([
      createApp({ appId: "uninstallable", canUninstall: true }),
    ]);

    expect(counts.managed).toBe(1);
  });
});

function createApp(overrides: AppOverrides): AppInfo {
  const { allowedActions: allowedActionOverrides, ...rest } = overrides;
  const allowedActions: AppInfo["allowedActions"] = {
    launch: true,
    reveal: true,
    upgrade: true,
    uninstall: true,
    ...allowedActionOverrides,
  };

  return {
    appId: "app",
    name: "App",
    version: "1.0.0",
    bundleId: "com.example.app",
    installPath: "/Applications/App.app",
    source: "manual",
    sourceType: "manual",
    sourceId: "",
    sourceConfidence: 0,
    canUpgrade: false,
    canUninstall: false,
    upgradeAvailable: false,
    lastOperationResult: null,
    lastModified: 0,
    isSystemApp: false,
    iconBase64: null,
    allowedActions,
    ...rest,
  };
}
