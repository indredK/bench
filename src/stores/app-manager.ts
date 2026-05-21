import { create } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import { isTauri } from "@tauri-apps/api/core";
import {
  scanInstalledApps,
  checkManagedAppUpdates,
  upgradeApp,
  uninstallApp,
  getAppOperationHistory,
  batchUpgradeApps,
  batchUninstallApps,
  installApp as tauriInstallApp,
} from "@/lib/tauri/commands";
import type { AppInfo, AppScanResult, BatchOperationResult, InstallListAppInfo, OperationRecord } from "@/lib/tauri/types";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import { getRecommendedInstallList } from "@/features/app-manager/recommended-apps";
import type { RecommendedAppInstallStatus } from "@/features/app-manager/recommended-apps";

export type AppFilterKey = "all" | "user" | "system" | "launchable" | "managed" | "upgradable" | "installList";

// ============================================================================
// Preference Persistence (localStorage)
// ============================================================================

const PREF_KEY = "app-manager-preferences";

interface PersistedPreferences {
  activeFilter: AppFilterKey;
  sorting: SortingState;
}

const VALID_FILTER_KEYS = new Set<AppFilterKey>([
  "all",
  "user",
  "system",
  "launchable",
  "managed",
  "upgradable",
  "installList",
]);

function normalizeFilterKey(value: unknown): AppFilterKey {
  if (value === "uninstalled") return "installList";
  return typeof value === "string" && VALID_FILTER_KEYS.has(value as AppFilterKey)
    ? value as AppFilterKey
    : "all";
}

function loadPreferences(): PersistedPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) {
      const prefs = JSON.parse(raw) as Partial<PersistedPreferences> & { activeFilter?: unknown };
      return {
        activeFilter: normalizeFilterKey(prefs.activeFilter),
        sorting: Array.isArray(prefs.sorting) ? prefs.sorting : [{ id: "name", desc: false }],
      };
    }
  } catch { /* ignore */ }
  return { activeFilter: "all", sorting: [{ id: "name", desc: false }] };
}

function savePreferences(prefs: PersistedPreferences) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

const VIEW_MODE_KEY = "view-mode:app-manager";
function loadViewMode(): "table" | "grid" {
  try {
    const s = localStorage.getItem(VIEW_MODE_KEY);
    return s === "grid" ? "grid" : "table";
  } catch { return "table"; }
}
function saveViewMode(m: "table" | "grid") {
  try { localStorage.setItem(VIEW_MODE_KEY, m); } catch {}
}

const savedPrefs = loadPreferences();

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
    action: "upgrade" | "uninstall";
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

  // Batch operations
  toggleSelectApp: (appId: string) => void;
  selectAllFiltered: (filteredIds: string[]) => void;
  clearSelection: () => void;
  setBatchMode: (on: boolean) => void;
  openBatchConfirmDialog: (action: "upgrade" | "uninstall", count: number) => void;
  closeBatchConfirmDialog: () => void;
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
  viewMode: loadViewMode(),
  selectedItem: null,
  filterPanelOpen: true,

  // Recommended install checklist
  installListApps: [],
  installStates: {},
  installConfirmDialog: { open: false, appId: "", appName: "" },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFilter: (filter) => {
    set({ activeFilter: filter });
    savePreferences({ activeFilter: filter, sorting: get().sorting });
  },
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  setSeriesFilter: (series) => set({ seriesFilter: series }),
  setSorting: (sorting: Updater<SortingState>) => {
    set((state) => {
      const next = typeof sorting === "function" ? sorting(state.sorting) : sorting;
      savePreferences({ activeFilter: state.activeFilter, sorting: next });
      return { sorting: next };
    });
  },

  scanApps: async () => {
    const { loading } = get();
    if (loading) return;
    // Keep existing data visible while scanning — avoids white-screen flash
    set({ loading: true, error: "", selectedAppIds: new Set(), batchMode: false, batchResults: null });
    if (!isTauri()) { set({ scanned: true, loading: false }); return; }
    try {
      const result = await scanInstalledApps();
      set({ apps: result.apps, result, scanned: true, loading: false, lastScanTime: result.lastScanTime, lastUpdateCheck: result.lastUpdateCheck });
      get().loadHistory();
      get().refreshInstallList();
    } catch (e) {
      set({ apps: [], result: null, error: String(e) || "Failed to scan", scanned: true, loading: false });
    }
  },

  refreshUpdates: async () => {
    const { apps } = get();
    if (!isTauri() || apps.length === 0) return;
    try {
      const managedIds = apps.filter((a) => a.canUpgrade).map((a) => a.appId);
      if (managedIds.length === 0) return;
      const updatableIds = await checkManagedAppUpdates(managedIds);
      const updatableSet = new Set(updatableIds);
      set((state) => ({
        apps: state.apps.map((a) => ({ ...a, upgradeAvailable: updatableSet.has(a.appId) })),
      }));
    } catch (e) { console.warn("[AppManager] Failed to check updates:", e); }
  },

  refreshInstallList: () => {
    const { apps } = get();
    const installList = getRecommendedInstallList(apps);
    set({
      installListApps: installList.map((app: RecommendedAppInstallStatus) => ({
        _virtual: true as const,
        id: app.id,
        name: app.name,
        bundleId: app.bundleIdPattern,
        category: app.category,
        series: app.series,
        description: app.description,
        installSource: app.installSource,
        iconKey: app.iconKey,
        installed: app.installed,
        installedAppId: app.installedAppId,
        installedVersion: app.installedVersion,
        installedPath: app.installedPath,
      })),
    });
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
      const result = await upgradeApp(appId);
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
      const result = await uninstallApp(appId);
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
      const result = await tauriInstallApp(appId, installSource);
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

  // --- Batch Operations ---
  doBatchUpgrade: async () => {
    const { selectedAppIds, loadHistory } = get();
    const ids = Array.from(selectedAppIds);
    if (ids.length === 0) return;
    set({ batchProgress: { running: true, current: 0, total: ids.length }, batchResults: null });
    try {
      const result = await batchUpgradeApps(ids);
      set({
        batchProgress: null,
        batchResults: result,
        selectedAppIds: new Set(),
        batchMode: false,
      });
    } catch (e) {
      set({ batchProgress: null, error: String(e) });
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
      const result = await batchUninstallApps(ids);
      set({
        batchProgress: null,
        batchResults: result,
        selectedAppIds: new Set(),
        batchMode: false,
      });
    } catch (e) {
      set({ batchProgress: null, error: String(e) });
    }
    await loadHistory();
    get().scanApps();
  },

  // --- Layout ---
  setViewMode: (mode) => {
    set({ viewMode: mode });
    saveViewMode(mode);
  },
  setSelectedItem: (item) => set({ selectedItem: item }),
  setFilterPanelOpen: (open) => set({ filterPanelOpen: open }),

  // --- History ---
  loadHistory: async () => {
    if (!isTauri()) return;
    try { set({ history: await getAppOperationHistory() }); }
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
      viewMode: loadViewMode(), selectedItem: null, filterPanelOpen: true,
      installListApps: [], installStates: {}, installConfirmDialog: { open: false, appId: "", appName: "" },
    }),
}));
