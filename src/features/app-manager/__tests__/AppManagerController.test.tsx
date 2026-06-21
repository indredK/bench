/**
 * Test / 测试: verify behavior only; 只验证行为与契约.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useAppManagerController } from "@/features/app-manager/hooks/useAppManagerController";
import { useAppManagerStore } from "@/features/app-manager/store";
import { requestFeatureRefresh } from "@/features/refresh";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/shared/context-menu/useContextMenuRegistration", () => ({
  useContextMenuRegistration: () => {},
}));

vi.mock("@/features/app-manager/hooks/useInstallEvents", () => ({
  useInstallEvents: () => {},
}));

vi.mock("@/platform/capabilities", () => ({
  canUseDesktopFeatures: () => true,
}));

vi.mock("@/platform/clipboard", () => ({
  writeClipboardText: vi.fn(async () => {}),
}));

vi.mock("@/lib/tauri/commands/app-manager", () => ({
  batchInstallApps: vi.fn(async () => ({ total: 0, succeeded: 0, failed: 0, results: [] })),
  batchUninstallApps: vi.fn(async () => ({ total: 0, succeeded: 0, failed: 0, results: [] })),
  batchUpgradeApps: vi.fn(async () => ({ total: 0, succeeded: 0, failed: 0, results: [] })),
  cancelBatchOperation: vi.fn(async () => true),
  checkAllAppUpdates: vi.fn(async () => []),
  checkManagedAppUpdates: vi.fn(async () => []),
  getAppIconBase64: vi.fn(async () => null),
  installApp: vi.fn(async () => ({
    success: true,
    message: "ok",
    exitCode: 0,
    errorCode: null,
    permissionIssue: false,
  })),
  installAppUpdate: vi.fn(async () => {}),
  launchApp: vi.fn(async () => {}),
  openInMacAppStore: vi.fn(async () => {}),
  openMacAppStoreUpdates: vi.fn(async () => {}),
  refreshAppUpdates: vi.fn(async () => {}),
  revealAppInFinder: vi.fn(async () => {}),
  scanInstalledApps: vi.fn(async () => ({
    apps: [],
    totalCount: 0,
    userCount: 0,
    systemCount: 0,
    scanTimeMs: 0,
    managedCount: 0,
    platformCapabilities: {
      brewAvailable: true,
      wingetAvailable: false,
      flatpakAvailable: false,
      snapAvailable: false,
      aptAvailable: false,
    },
    lastScanTime: 0,
    lastUpdateCheck: 0,
  })),
  uninstallApp: vi.fn(async () => ({
    success: true,
    message: "ok",
    exitCode: 0,
    errorCode: null,
    permissionIssue: false,
  })),
  upgradeApp: vi.fn(async () => ({
    success: true,
    message: "ok",
    exitCode: 0,
    errorCode: null,
    permissionIssue: false,
  })),
}));

function HookHarness({ active }: { active: boolean }) {
  useAppManagerController(active);
  return null;
}

describe("useAppManagerController refresh routing", () => {
  beforeEach(() => {
    useAppManagerStore.getState().reset();
    useAppManagerStore.setState({
      scanned: true,
      updatesScanned: true,
      lastUpdateCheck: Date.now(),
    });

    vi.spyOn(appManagerUseCases, "loadPreferences").mockReturnValue({
      activeFilter: "all",
      sorting: [{ id: "name", desc: false }],
    });
    vi.spyOn(appManagerUseCases, "loadViewMode").mockReturnValue("table");
    vi.spyOn(appManagerUseCases, "savePreferences").mockImplementation(() => {});
    vi.spyOn(appManagerUseCases, "saveViewMode").mockImplementation(() => {});
    vi.spyOn(appManagerUseCases, "isAvailable").mockReturnValue(true);
    vi.spyOn(appManagerUseCases, "scanInstalledApps").mockResolvedValue({
      apps: [],
      totalCount: 0,
      userCount: 0,
      systemCount: 0,
      scanTimeMs: 0,
      managedCount: 0,
      lastScanTime: 0,
      lastUpdateCheck: 0,
      platformCapabilities: {
        brewAvailable: true,
        wingetAvailable: false,
        flatpakAvailable: false,
        snapAvailable: false,
        aptAvailable: false,
      },
    });
    vi.spyOn(appManagerUseCases, "findManagedAppUpdates").mockResolvedValue(new Set());
    vi.spyOn(appManagerUseCases, "checkAllAppUpdates").mockResolvedValue({
      updates: [],
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes shell refresh to update checks when the software update tab is active", async () => {
    const scanInstalledApps = vi.spyOn(appManagerUseCases, "scanInstalledApps");
    const checkAllAppUpdates = vi.spyOn(appManagerUseCases, "checkAllAppUpdates");

    render(<HookHarness active={true} />);

    act(() => {
      useAppManagerStore.getState().setActiveTab("softwareUpdate");
    });

    await act(async () => {
      await requestFeatureRefresh("app-manager");
    });

    expect(checkAllAppUpdates).toHaveBeenCalledWith(true);
    expect(scanInstalledApps).not.toHaveBeenCalled();
  });
});
