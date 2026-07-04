/**
 * Use Case / 用例层: coordinate business rules; 只编排业务规则.
 */
import type {
  AppInfo,
  AppScanResult,
  BatchOperationResult,
  InstallListAppInfo,
  OperationResult,
  UpdateInfo,
} from "@/lib/tauri/types/app-manager";
import {
  appManagerRepository,
  type AppManagerRepository,
} from "@/features/app-manager/services/app-manager.repository";
import { getErrorMessage } from "@/lib/tauri/errors";
import { canUseDesktopFeatures } from "@/platform/capabilities";
import {
  normalizeAppManagerPreferences,
  normalizeAppManagerViewMode,
  type PersistedPreferences,
} from "@/features/app-manager/model/preferences";

export type AppOperationKind = "upgrade" | "uninstall" | "install";
export type BatchOperationKind = "upgrade" | "uninstall";

export interface AppOperationRequest {
  appId: string;
  kind: AppOperationKind;
  installSource?: InstallListAppInfo["installSource"];
}

export interface AppOperationOutcome {
  appId: string;
  kind: AppOperationKind;
  result: OperationResult;
  shouldRescan: boolean;
}

export type BatchOperationOutcome = {
  kind: BatchOperationKind;
  result: BatchOperationResult;
  error?: never;
} | {
  kind: BatchOperationKind;
  result: null;
  error: string;
};

const operationErrorResult = (error: unknown): OperationResult => ({
  success: false,
  message: getErrorMessage(error),
  exitCode: null,
  errorCode: null,
  permissionIssue: false,
});

const operationSkippedResult = (message: string): OperationResult => ({
  success: false,
  message,
  exitCode: null,
  errorCode: "SKIPPED",
  permissionIssue: false,
});

function createAppManagerUseCases(
  repository: AppManagerRepository = appManagerRepository,
  isAvailable: () => boolean = canUseDesktopFeatures
) {
  return {
    isAvailable() {
      return isAvailable();
    },

    scanInstalledApps(): Promise<AppScanResult> {
      return repository.scanInstalledApps();
    },

    loadAppIconBase64(installPath: string) {
      return repository.getAppIconBase64(installPath);
    },

    async findManagedAppUpdates(apps: AppInfo[]): Promise<Set<string>> {
      if (!isAvailable() || apps.length === 0) return new Set();

      const managedIds = apps.filter((app) => app.canUpgrade).map((app) => app.appId);
      if (managedIds.length === 0) return new Set();

      const updatableIds = await repository.checkManagedAppUpdates(managedIds);
      return new Set(updatableIds);
    },

    loadPreferences(): PersistedPreferences {
      try {
        const raw = repository.loadPreferences();
        return normalizeAppManagerPreferences(raw ? JSON.parse(raw) : null);
      } catch {
        return normalizeAppManagerPreferences(null);
      }
    },

    savePreferences(preferences: PersistedPreferences) {
      try {
        repository.savePreferences(preferences);
      } catch {
        /* ignore storage failures */
      }
    },

    loadViewMode(): "table" | "grid" {
      try {
        return normalizeAppManagerViewMode(repository.loadViewMode());
      } catch {
        return "table";
      }
    },

    saveViewMode(mode: "table" | "grid") {
      try {
        repository.saveViewMode(mode);
      } catch {
        /* ignore storage failures */
      }
    },

    async runAppOperation(
      request: AppOperationRequest
    ): Promise<AppOperationOutcome | null> {
      try {
        const result = await runRepositoryOperation(repository, request);
        return {
          appId: request.appId,
          kind: request.kind,
          result,
          shouldRescan: result.success,
        };
      } catch (error) {
        return {
          appId: request.appId,
          kind: request.kind,
          result: operationErrorResult(error),
          shouldRescan: false,
        };
      }
    },

    async runBatchOperation(
      kind: BatchOperationKind,
      ids: string[]
    ): Promise<BatchOperationOutcome | null> {
      if (ids.length === 0) return null;

      try {
        const result =
          kind === "upgrade"
            ? await repository.batchUpgradeApps(ids)
            : await repository.batchUninstallApps(ids);

        return { kind, result };
      } catch (error) {
        return { kind, result: null, error: getErrorMessage(error) };
      }
    },

    async cancelBatch(): Promise<boolean> {
      try {
        return await repository.cancelBatchOperation();
      } catch {
        return false;
      }
    },

    async checkAllAppUpdates(
      forceRefresh = false
    ): Promise<{ updates: UpdateInfo[]; error: string | null }> {
      if (!isAvailable()) return { updates: [], error: null };
      try {
        const updates = await repository.checkAllAppUpdates(forceRefresh);
        return { updates, error: null };
      } catch (error) {
        return { updates: [], error: getErrorMessage(error) };
      }
    },

    openInMacAppStore(adamId: string): Promise<void> {
      if (!isAvailable()) return Promise.resolve();
      return repository.openInMacAppStore(adamId);
    },

    openMacAppStoreUpdates(): Promise<void> {
      if (!isAvailable()) return Promise.resolve();
      return repository.openMacAppStoreUpdates();
    },

    launchApp(app: AppInfo) {
      if (!isAvailable()) return Promise.resolve();
      return repository.launchApp(app.installPath);
    },

    revealApp(app: AppInfo) {
      if (!isAvailable()) return Promise.resolve();
      return repository.revealAppInFinder(app.installPath);
    },

    openExternal(reference: string) {
      return repository.openExternal(reference);
    },
  };
}

function runRepositoryOperation(
  repository: AppManagerRepository,
  request: AppOperationRequest
): Promise<OperationResult> {
  switch (request.kind) {
    case "upgrade":
      return repository.upgradeApp(request.appId);
    case "uninstall":
      return repository.uninstallApp(request.appId);
    case "install":
      if (!request.installSource) {
        return Promise.resolve(operationSkippedResult("Missing install source"));
      }
      return repository.installApp(request.appId, request.installSource);
  }
}

export const appManagerUseCases = createAppManagerUseCases();
export { createAppManagerUseCases };
