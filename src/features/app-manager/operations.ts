import type { SortingState } from "@tanstack/react-table";
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager";
import { createInstallListApps } from "@/features/app-manager/model/install-list";
import {
  createBatchErrorPatch,
  createBatchProgress,
  createBatchSuccessPatch,
  createRunningOperationState,
  isOperationRunning,
  toOperationState,
} from "@/features/app-manager/model/operations";
import {
  loadAppManagerPreferences,
  loadAppManagerViewMode,
  saveAppManagerPreferences,
  saveAppManagerViewMode,
  type AppFilterKey,
} from "@/features/app-manager/model/preferences";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";
import { useAppManagerStore } from "@/features/app-manager/store";

export const appManagerOperations = {
  restorePreferences() {
    const preferences = loadAppManagerPreferences();
    useAppManagerStore.setState({
      activeFilter: preferences.activeFilter,
      sorting: preferences.sorting,
      viewMode: loadAppManagerViewMode(),
    });
  },

  savePreferences(activeFilter: AppFilterKey, sorting: SortingState) {
    saveAppManagerPreferences({ activeFilter, sorting });
  },

  saveViewMode(mode: "table" | "grid") {
    saveAppManagerViewMode(mode);
  },

  async scanApps() {
    const { loading } = useAppManagerStore.getState();
    if (loading) return;

    useAppManagerStore.setState({
      loading: true,
      error: "",
      selectedAppIds: new Set(),
      batchMode: false,
      batchResults: null,
    });

    if (!appManagerUseCases.isAvailable()) {
      useAppManagerStore.setState({ scanned: true, loading: false });
      return;
    }

    try {
      const result = await appManagerUseCases.scanInstalledApps();
      useAppManagerStore.setState({
        apps: result.apps,
        result,
        scanned: true,
        loading: false,
        lastScanTime: result.lastScanTime,
        lastUpdateCheck: result.lastUpdateCheck,
        installListApps: createInstallListApps(result.apps),
      });
      void appManagerOperations.loadHistory();
    } catch (error) {
      useAppManagerStore.setState({
        apps: [],
        result: null,
        error: String(error) || "Failed to scan",
        scanned: true,
        loading: false,
      });
    }
  },

  async refreshUpdates() {
    const { apps } = useAppManagerStore.getState();
    try {
      const updatableSet = await appManagerUseCases.findManagedAppUpdates(apps);
      if (updatableSet.size === 0) return;
      useAppManagerStore.setState((state) => ({
        apps: state.apps.map((app) => ({
          ...app,
          upgradeAvailable: updatableSet.has(app.appId),
        })),
      }));
    } catch (error) {
      console.warn("[AppManager] Failed to check updates:", error);
    }
  },

  refreshInstallList() {
    useAppManagerStore.setState({
      installListApps: createInstallListApps(useAppManagerStore.getState().apps),
    });
  },

  async upgrade(appId: string) {
    const { operations, setOperationStatus } = useAppManagerStore.getState();
    if (isOperationRunning(operations, appId)) return;

    useAppManagerStore.setState((state) => ({
      operations: { ...state.operations, [appId]: createRunningOperationState("Upgrading...") },
    }));

    const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "upgrade" });
    if (!outcome) return;

    useAppManagerStore.setState((state) => ({
      operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
    }));
    if (outcome.result.success) {
      setTimeout(() => setOperationStatus(appId, "idle"), 5000);
    }

    await appManagerOperations.loadHistory();
    if (outcome.shouldRescan) void appManagerOperations.scanApps();
  },

  async uninstall(appId: string) {
    const { operations } = useAppManagerStore.getState();
    if (isOperationRunning(operations, appId)) return;

    useAppManagerStore.setState((state) => ({
      operations: { ...state.operations, [appId]: createRunningOperationState("Uninstalling...") },
    }));

    const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "uninstall" });
    if (!outcome) return;

    useAppManagerStore.setState((state) => ({
      operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
    }));
    if (outcome.shouldRescan) {
      scheduleRescan(800);
    }

    await appManagerOperations.loadHistory();
  },

  async install(appId: string, _appName: string, installSource: InstallListAppInfo["installSource"]) {
    const { installStates } = useAppManagerStore.getState();
    if (isOperationRunning(installStates, appId)) return;

    useAppManagerStore.setState((state) => ({
      installStates: { ...state.installStates, [appId]: createRunningOperationState("Installing...") },
    }));

    const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "install", installSource });
    if (!outcome) return;

    useAppManagerStore.setState((state) => ({
      installStates: { ...state.installStates, [appId]: toOperationState(outcome.result) },
    }));
    if (outcome.shouldRescan) {
      setTimeout(() => {
        void appManagerOperations.scanApps();
        appManagerOperations.refreshInstallList();
      }, 2000);
    }
  },

  async launchApp(app: AppInfo) {
    try {
      await appManagerUseCases.launchApp(app);
    } catch (error) {
      console.warn("[AppManager] Failed to launch app:", error);
    }
  },

  async revealApp(app: AppInfo) {
    try {
      await appManagerUseCases.revealApp(app);
    } catch (error) {
      console.warn("[AppManager] Failed to reveal app:", error);
    }
  },

  openExternal(reference: string) {
    return appManagerUseCases.openExternal(reference);
  },

  async batchUpgrade() {
    await runBatchOperation("upgrade");
  },

  async batchUninstall() {
    await runBatchOperation("uninstall");
  },

  async loadHistory() {
    if (!appManagerUseCases.isAvailable()) return;
    try {
      useAppManagerStore.setState({ history: await appManagerUseCases.loadHistory() });
    } catch (error) {
      console.warn("[AppManager] Failed to load history:", error);
    }
  },
};

async function runBatchOperation(kind: "upgrade" | "uninstall") {
  const ids = Array.from(useAppManagerStore.getState().selectedAppIds);
  if (ids.length === 0) return;

  useAppManagerStore.setState({ batchProgress: createBatchProgress(ids.length), batchResults: null });
  const outcome = await appManagerUseCases.runBatchOperation(kind, ids);
  if (!outcome) return;

  useAppManagerStore.setState(
    outcome.result ? createBatchSuccessPatch(outcome.result) : createBatchErrorPatch(outcome.error)
  );
  await appManagerOperations.loadHistory();
  void appManagerOperations.scanApps();
}

function scheduleRescan(delayMs: number) {
  setTimeout(() => {
    void appManagerOperations.scanApps();
  }, delayMs);
}
