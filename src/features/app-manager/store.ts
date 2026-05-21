import { create } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import type { AppInfo, AppScanResult, BatchOperationResult, InstallListAppInfo, OperationRecord } from "@/lib/tauri/types/app-manager";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import { createInstallListApps } from "@/features/app-manager/model/install-list";
import {
  loadAppManagerPreferences,
  loadAppManagerViewMode,
  saveAppManagerPreferences,
  saveAppManagerViewMode,
  type AppFilterKey,
} from "@/features/app-manager/model/preferences";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";

export type { AppFilterKey };

const savedPrefs = loadAppManagerPreferences();

export const APP_FILTER_OPTIONS = [
  { key: "all" as const, labelKey: "appManager.filterAll" },
  { key: "user" as const, labelKey: "appManager.filterUser" },
  { key: "system" as const, labelKey: "appManager.filterSystem" },
  { key: "launchable" as const, labelKey: "appManager.filterLaunchable" },
  { key: "managed" as const, labelKey: "appManager.filterManaged" },
  { key: "upgradable" as const, labelKey: "appManager.filterUpgradable" },
];

export type OperationStatus = "idle" | "pending" | "running" | "success" | "error";

interface AppOperationState {
  status: OperationStatus;
  message: string;
}

interface BatchProgress {
  running: boolean;
  current: number;
  total: number;
}

export interface AppManagerState {
  apps: AppInfo[];
  loading: boolean;
  error: string;
  searchQuery: string;
  activeFilter: AppFilterKey;
  categoryFilter: AppCategoryKey | null;
  seriesFilter: AppSeriesKey | null;
  sorting: SortingState;
  scanned: boolean;
  result: AppScanResult | null;

  // Single-item operations
  operations: Record<string, AppOperationState>;
  history: OperationRecord[];
  confirmDialog: {
    open: boolean;
    appId: string;
    appName: string;
    action: "upgrade" | "uninstall";
  };
  historyOpen: boolean;

  // Batch selection
  selectedAppIds: Set<string>;
  batchMode: boolean;
  batchProgress: BatchProgress | null;
  batchResults: BatchOperationResult | null;
  batchConfirmDialog: {
    open: boolean;
    action: "upgrade" | "uninstall" | "install";
    count: number;
  };

  // Timestamps (from scan result)
  lastScanTime: number;
  lastUpdateCheck: number;

  // Three-column layout state
  viewMode: "table" | "grid";
  selectedItem: AppInfo | null;
  filterPanelOpen: boolean;

  // Recommended install checklist
  installListApps: InstallListAppInfo[];
  installStates: Record<string, AppOperationState>;
  installConfirmDialog: {
    open: boolean;
    appId: string;
    appName: string;
  };

  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: AppFilterKey) => void;
  setCategoryFilter: (category: AppCategoryKey | null) => void;
  setSeriesFilter: (series: AppSeriesKey | null) => void;
  setSorting: (sorting: Updater<SortingState>) => void;
  scanApps: () => Promise<void>;
  refreshUpdates: () => Promise<void>;
  refreshInstallList: () => void;

  // Single operations
  doUpgrade: (appId: string) => Promise<void>;
  doUninstall: (appId: string) => Promise<void>;
  setOperationStatus: (appId: string, status: OperationStatus, message?: string) => void;
  openConfirmDialog: (appId: string, appName: string, action: "upgrade" | "uninstall") => void;
  closeConfirmDialog: () => void;

  // Installation operations
  setInstallState: (appId: string, status: OperationStatus, message?: string) => void;
  doInstall: (appId: string, appName: string, installSource: InstallListAppInfo["installSource"]) => Promise<void>;
  openInstallConfirmDialog: (appId: string, appName: string) => void;
  closeInstallConfirmDialog: () => void;
  launchApp: (app: AppInfo) => Promise<void>;
  revealApp: (app: AppInfo) => Promise<void>;
  openExternal: (reference: string) => Promise<void>;

  // Batch operations
  toggleSelectApp: (appId: string) => void;
  selectAllFiltered: (filteredIds: string[]) => void;
  clearSelection: () => void;
  setBatchMode: (on: boolean) => void;
  openBatchConfirmDialog: (action: "upgrade" | "uninstall" | "install", count: number) => void;
  closeBatchConfirmDialog: () => void;
  clearBatchResults: () => void;
  doBatchUpgrade: () => Promise<void>;
  doBatchUninstall: () => Promise<void>;

  // Layout
  setViewMode: (mode: "table" | "grid") => void;
  setSelectedItem: (item: AppInfo | null) => void;
  setFilterPanelOpen: (open: boolean) => void;

  // History
  loadHistory: () => Promise<void>;
  setHistoryOpen: (open: boolean) => void;

  reset: () => void;
}

export const useAppManagerStore = create<AppManagerState>((set, get) => ({
  apps: [],
  loading: false,
  error: "",
  searchQuery: "",
  activeFilter: savedPrefs.activeFilter,
  categoryFilter: null,
  seriesFilter: null,
  sorting: savedPrefs.sorting,
  scanned: false,
  result: null,
  operations: {},
  history: [],
  confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" },
  historyOpen: false,

  // Batch
  selectedAppIds: new Set(),
  batchMode: false,
  batchProgress: null,
  batchResults: null,
  batchConfirmDialog: { open: false, action: "upgrade", count: 0 },

  // Timestamps
  lastScanTime: 0,
  lastUpdateCheck: 0,

  // Three-column layout
  viewMode: loadAppManagerViewMode(),
  selectedItem: null,
  filterPanelOpen: true,

  // Recommended install checklist
  installListApps: [],
  installStates: {},
  installConfirmDialog: { open: false, appId: "", appName: "" },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFilter: (filter) => {
    set({ activeFilter: filter });
    saveAppManagerPreferences({ activeFilter: filter, sorting: get().sorting });
  },
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  setSeriesFilter: (series) => set({ seriesFilter: series }),
  setSorting: (sorting: Updater<SortingState>) => {
    set((state) => {
      const next = typeof sorting === "function" ? sorting(state.sorting) : sorting;
      saveAppManagerPreferences({ activeFilter: state.activeFilter, sorting: next });
      return { sorting: next };
    });
  },

  scanApps: async () => {
    const { loading } = get();
    if (loading) return;
    // Keep existing data visible while scanning — avoids white-screen flash
    set({ loading: true, error: "", selectedAppIds: new Set(), batchMode: false, batchResults: null });
    if (!appManagerUseCases.isAvailable()) { set({ scanned: true, loading: false }); return; }
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
      get().loadHistory();
    } catch (e) {
      set({ apps: [], result: null, error: String(e) || "Failed to scan", scanned: true, loading: false });
    }
  },

  refreshUpdates: async () => {
    const { apps } = get();
    try {
      const updatableSet = await appManagerUseCases.findManagedAppUpdates(apps);
      if (updatableSet.size === 0) return;
      set((state) => ({
        apps: state.apps.map((a) => ({ ...a, upgradeAvailable: updatableSet.has(a.appId) })),
      }));
    } catch (e) { console.warn("[AppManager] Failed to check updates:", e); }
  },

  refreshInstallList: () => {
    const { apps } = get();
    set({ installListApps: createInstallListApps(apps) });
  },

  // --- Single-item Operations ---
  setOperationStatus: (appId, status, message = "") =>
    set((state) => ({ operations: { ...state.operations, [appId]: { status, message } } })),

  doUpgrade: async (appId: string) => {
    const { operations, setOperationStatus, loadHistory } = get();
    // Prevent duplicate clicks
    if (operations[appId]?.status === "running") return;
    setOperationStatus(appId, "running", "Upgrading...");
    try {
      const result = await appManagerUseCases.upgradeApp(appId);
      setOperationStatus(appId, result.success ? "success" : "error", result.message);
      if (result.success) setTimeout(() => setOperationStatus(appId, "idle"), 5000);
    } catch (e) {
      setOperationStatus(appId, "error", String(e));
    }
    await loadHistory();
    get().scanApps();
  },

  doUninstall: async (appId: string) => {
    const { operations, setOperationStatus, loadHistory } = get();
    if (operations[appId]?.status === "running") return;
    setOperationStatus(appId, "running", "Uninstalling...");
    try {
      const result = await appManagerUseCases.uninstallApp(appId);
      if (result.success) {
        setOperationStatus(appId, "success", result.message);
        setTimeout(() => get().scanApps(), 800);
      } else {
        setOperationStatus(appId, "error", result.message);
      }
    } catch (e) {
      setOperationStatus(appId, "error", String(e));
    }
    await loadHistory();
  },

  openConfirmDialog: (appId, appName, action) =>
    set({ confirmDialog: { open: true, appId, appName, action } }),
  closeConfirmDialog: () =>
    set({ confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" } }),

  // --- Installation Operations ---
  setInstallState: (appId, status, message = "") =>
    set((state) => ({ installStates: { ...state.installStates, [appId]: { status, message } } })),

  doInstall: async (appId, _appName, installSource) => {
    const { installStates, setInstallState } = get();
    if (installStates[appId]?.status === "running") return;
    setInstallState(appId, "running", "Installing...");
    try {
      const result = await appManagerUseCases.installApp(appId, installSource);
      setInstallState(appId, result.success ? "success" : "error", result.message);
      if (result.success) {
        setTimeout(() => {
          get().scanApps();
          get().refreshInstallList();
        }, 2000);
      }
    } catch (e) {
      setInstallState(appId, "error", String(e));
    }
  },

  openInstallConfirmDialog: (appId, appName) =>
    set({ installConfirmDialog: { open: true, appId, appName } }),
  closeInstallConfirmDialog: () =>
    set({ installConfirmDialog: { open: false, appId: "", appName: "" } }),

  launchApp: async (app) => {
    try {
      await appManagerUseCases.launchApp(app);
    } catch (e) {
      console.warn("[AppManager] Failed to launch app:", e);
    }
  },

  revealApp: async (app) => {
    try {
      await appManagerUseCases.revealApp(app);
    } catch (e) {
      console.warn("[AppManager] Failed to reveal app:", e);
    }
  },

  openExternal: async (reference) => {
    await appManagerUseCases.openExternal(reference);
  },

  // --- Batch Selection ---
  toggleSelectApp: (appId: string) =>
    set((state) => {
      const next = new Set(state.selectedAppIds);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return { selectedAppIds: next };
    }),

  selectAllFiltered: (filteredIds: string[]) =>
    set({ selectedAppIds: new Set(filteredIds) }),

  clearSelection: () => set({ selectedAppIds: new Set(), batchMode: false }),

  setBatchMode: (on) => set({ batchMode: on }),

  openBatchConfirmDialog: (action, count) =>
    set({ batchConfirmDialog: { open: true, action, count } }),

  closeBatchConfirmDialog: () =>
    set({ batchConfirmDialog: { open: false, action: "upgrade", count: 0 } }),

  clearBatchResults: () => set({ batchResults: null }),

  // --- Batch Operations ---
  doBatchUpgrade: async () => {
    const { selectedAppIds, loadHistory } = get();
    const ids = Array.from(selectedAppIds);
    if (ids.length === 0) return;
    set({ batchProgress: { running: true, current: 0, total: ids.length }, batchResults: null });
    try {
      const result = await appManagerUseCases.batchUpgradeApps(ids);
      set({
        batchProgress: null,
        batchResults: result,
        selectedAppIds: new Set(),
        batchMode: false,
      });
    } catch (e) {
      set({ batchProgress: null, batchResults: null, selectedAppIds: new Set(), batchMode: false, error: String(e) });
    }
    await loadHistory();
    get().scanApps();
  },

  doBatchUninstall: async () => {
    const { selectedAppIds, loadHistory } = get();
    const ids = Array.from(selectedAppIds);
    if (ids.length === 0) return;
    set({ batchProgress: { running: true, current: 0, total: ids.length }, batchResults: null });
    try {
      const result = await appManagerUseCases.batchUninstallApps(ids);
      set({
        batchProgress: null,
        batchResults: result,
        selectedAppIds: new Set(),
        batchMode: false,
      });
    } catch (e) {
      set({ batchProgress: null, batchResults: null, selectedAppIds: new Set(), batchMode: false, error: String(e) });
    }
    await loadHistory();
    get().scanApps();
  },

  // --- Layout ---
  setViewMode: (mode) => {
    set({ viewMode: mode });
    saveAppManagerViewMode(mode);
  },
  setSelectedItem: (item) => set({ selectedItem: item }),
  setFilterPanelOpen: (open) => set({ filterPanelOpen: open }),

  // --- History ---
  loadHistory: async () => {
    if (!appManagerUseCases.isAvailable()) return;
    try { set({ history: await appManagerUseCases.loadHistory() }); }
    catch (e) { console.warn("[AppManager] Failed to load history:", e); }
  },
  setHistoryOpen: (open) => set({ historyOpen: open }),

  reset: () =>
    set({
      apps: [], loading: false, error: "", searchQuery: "", activeFilter: "all", categoryFilter: null, seriesFilter: null,
      sorting: [{ id: "name", desc: false }], scanned: false, result: null,
      operations: {}, history: [], confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" },
      historyOpen: false, selectedAppIds: new Set(), batchMode: false, batchProgress: null, batchResults: null,
      batchConfirmDialog: { open: false, action: "upgrade", count: 0 },
      lastScanTime: 0, lastUpdateCheck: 0,
      viewMode: loadAppManagerViewMode(), selectedItem: null, filterPanelOpen: true,
      installListApps: [], installStates: {}, installConfirmDialog: { open: false, appId: "", appName: "" },
    }),
}));
