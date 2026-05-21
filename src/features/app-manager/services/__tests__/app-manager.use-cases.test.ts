/**
 * Test / 测试: verify behavior only; 只验证行为与契约.
 */
import { describe, expect, it, vi } from "vitest";
import { createAppManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";
import type { AppManagerRepository } from "@/features/app-manager/services/app-manager.repository";
import type { AppInfo, InstallSource, OperationResult } from "@/lib/tauri/types/app-manager";

const ok = (message = "ok"): OperationResult => ({
  success: true,
  message,
  exitCode: 0,
  errorCode: null,
  permissionIssue: false,
});

const createRepository = (
  overrides: Partial<AppManagerRepository> = {}
): AppManagerRepository => ({
  scanInstalledApps: vi.fn(),
  launchApp: vi.fn(),
  revealAppInFinder: vi.fn(),
  checkManagedAppUpdates: vi.fn(),
  upgradeApp: vi.fn(),
  uninstallApp: vi.fn(),
  getAppOperationHistory: vi.fn(),
  batchUpgradeApps: vi.fn(),
  batchUninstallApps: vi.fn(),
  refreshAppUpdates: vi.fn(),
  installApp: vi.fn(),
  batchInstallApps: vi.fn(),
  openExternal: vi.fn(),
  ...overrides,
});

describe("appManagerUseCases", () => {
  it("filters update checks to managed apps", async () => {
    const repository = createRepository({
      checkManagedAppUpdates: vi.fn().mockResolvedValue(["managed"]),
    });
    const useCases = createAppManagerUseCases(repository, () => true);

    const updates = await useCases.findManagedAppUpdates([
      createApp({ appId: "managed", canUpgrade: true }),
      createApp({ appId: "manual", canUpgrade: false }),
    ]);

    expect(repository.checkManagedAppUpdates).toHaveBeenCalledWith(["managed"]);
    expect(updates).toEqual(new Set(["managed"]));
  });

  it("wraps single operation failures into operation outcomes", async () => {
    const repository = createRepository({
      upgradeApp: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const useCases = createAppManagerUseCases(repository, () => true);

    const outcome = await useCases.runAppOperation({ appId: "app-1", kind: "upgrade" });

    expect(outcome).toMatchObject({
      appId: "app-1",
      kind: "upgrade",
      shouldRescan: false,
      result: { success: false, message: "Error: boom" },
    });
  });

  it("routes install operations through the install repository command", async () => {
    const installSource: InstallSource = { brew: "demo" };
    const repository = createRepository({
      installApp: vi.fn().mockResolvedValue(ok("installed")),
    });
    const useCases = createAppManagerUseCases(repository, () => true);

    const outcome = await useCases.runAppOperation({
      appId: "demo",
      kind: "install",
      installSource,
    });

    expect(repository.installApp).toHaveBeenCalledWith("demo", installSource);
    expect(outcome).toMatchObject({
      kind: "install",
      shouldRescan: true,
      result: { success: true, message: "installed" },
    });
  });

  it("wraps batch operation failures into batch outcomes", async () => {
    const repository = createRepository({
      batchUninstallApps: vi.fn().mockRejectedValue("denied"),
    });
    const useCases = createAppManagerUseCases(repository, () => true);

    await expect(useCases.runBatchOperation("upgrade", [])).resolves.toBeNull();
    await expect(useCases.runBatchOperation("uninstall", ["app-1"])).resolves.toEqual({
      kind: "uninstall",
      result: null,
      error: "denied",
    });
  });
});

function createApp(overrides: Partial<AppInfo>): AppInfo {
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
    allowedActions: {
      launch: true,
      reveal: true,
      upgrade: true,
      uninstall: true,
    },
    ...overrides,
  };
}
