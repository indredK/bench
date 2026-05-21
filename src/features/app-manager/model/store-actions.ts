import type { StoreApi } from "zustand";
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager";
import type { AppManagerState } from "@/features/app-manager/store";
import { createInstallListApps } from "@/features/app-manager/model/install-list";
import {
  createBatchErrorPatch,
  createBatchProgress,
  createBatchSuccessPatch,
  createRunningOperationState,
  isOperationRunning,
  toOperationState,
} from "@/features/app-manager/model/operations";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";

type SetState = StoreApi<AppManagerState>["setState"];
type GetState = StoreApi<AppManagerState>["getState"];

export function createAppManagerStoreActions(set: SetState, get: GetState) {
  return {
    scanApps: async () => {
      const { loading } = get();
      if (loading) return;

      set({ loading: true, error: "", selectedAppIds: new Set(), batchMode: false, batchResults: null });
      if (!appManagerUseCases.isAvailable()) {
        set({ scanned: true, loading: false });
        return;
      }

      try {
        const result = await appManagerUseCases.scanInstalledApps();
        set({
          apps: result.apps,
          result,
          scanned: true,
          loading: false,
          lastScanTime: result.lastScanTime,
          lastUpdateCheck: result.lastUpdateCheck,
          installListApps: createInstallListApps(result.apps),
        });
        void get().loadHistory();
      } catch (error) {
        set({
          apps: [],
          result: null,
          error: String(error) || "Failed to scan",
          scanned: true,
          loading: false,
        });
      }
    },

    refreshUpdates: async () => {
      const { apps } = get();
      try {
        const updatableSet = await appManagerUseCases.findManagedAppUpdates(apps);
        if (updatableSet.size === 0) return;
        set((state) => ({
          apps: state.apps.map((app) => ({
            ...app,
            upgradeAvailable: updatableSet.has(app.appId),
          })),
        }));
      } catch (error) {
        console.warn("[AppManager] Failed to check updates:", error);
      }
    },

    refreshInstallList: () => {
      set({ installListApps: createInstallListApps(get().apps) });
    },

    doUpgrade: async (appId: string) => {
      const { operations, setOperationStatus, loadHistory } = get();
      if (isOperationRunning(operations, appId)) return;

      set((state) => ({
        operations: { ...state.operations, [appId]: createRunningOperationState("Upgrading...") },
      }));

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "upgrade" });
      if (!outcome) return;

      set((state) => ({
        operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
      }));
      if (outcome.result.success) {
        setTimeout(() => setOperationStatus(appId, "idle"), 5000);
      }

      await loadHistory();
      if (outcome.shouldRescan) void get().scanApps();
    },

    doUninstall: async (appId: string) => {
      const { operations, loadHistory } = get();
      if (isOperationRunning(operations, appId)) return;

      set((state) => ({
        operations: { ...state.operations, [appId]: createRunningOperationState("Uninstalling...") },
      }));

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "uninstall" });
      if (!outcome) return;

      set((state) => ({
        operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
      }));
      if (outcome.shouldRescan) {
        scheduleRescan(get, 800);
      }

      await loadHistory();
    },

    doInstall: async (appId: string, _appName: string, installSource: InstallListAppInfo["installSource"]) => {
      const { installStates } = get();
      if (isOperationRunning(installStates, appId)) return;

      set((state) => ({
        installStates: { ...state.installStates, [appId]: createRunningOperationState("Installing...") },
      }));

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "install", installSource });
      if (!outcome) return;

      set((state) => ({
        installStates: { ...state.installStates, [appId]: toOperationState(outcome.result) },
      }));
      if (outcome.shouldRescan) {
        setTimeout(() => {
          void get().scanApps();
          get().refreshInstallList();
        }, 2000);
      }
    },

    launchApp: async (app: AppInfo) => {
      try {
        await appManagerUseCases.launchApp(app);
      } catch (error) {
        console.warn("[AppManager] Failed to launch app:", error);
      }
    },

    revealApp: async (app: AppInfo) => {
      try {
        await appManagerUseCases.revealApp(app);
      } catch (error) {
        console.warn("[AppManager] Failed to reveal app:", error);
      }
    },

    openExternal: async (reference: string) => {
      await appManagerUseCases.openExternal(reference);
    },

    doBatchUpgrade: async () => {
      await runBatchOperation("upgrade", set, get);
    },

    doBatchUninstall: async () => {
      await runBatchOperation("uninstall", set, get);
    },

    loadHistory: async () => {
      if (!appManagerUseCases.isAvailable()) return;
      try {
        set({ history: await appManagerUseCases.loadHistory() });
      } catch (error) {
        console.warn("[AppManager] Failed to load history:", error);
      }
    },
  };
}

async function runBatchOperation(
  kind: "upgrade" | "uninstall",
  set: SetState,
  get: GetState
) {
  const { selectedAppIds, loadHistory } = get();
  const ids = Array.from(selectedAppIds);
  if (ids.length === 0) return;

  set({ batchProgress: createBatchProgress(ids.length), batchResults: null });
  const outcome = await appManagerUseCases.runBatchOperation(kind, ids);
  if (!outcome) return;

  set(outcome.result ? createBatchSuccessPatch(outcome.result) : createBatchErrorPatch(outcome.error));
  await loadHistory();
  void get().scanApps();
}

function scheduleRescan(get: GetState, delayMs: number) {
  setTimeout(() => {
    void get().scanApps();
  }, delayMs);
}
