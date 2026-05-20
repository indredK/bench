import { create } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import { isTauri } from "@tauri-apps/api/core";
import {
  scanInstalledApps,
  checkManagedAppUpdates,
  upgradeApp,
  uninstallApp,
  getAppOperationHistory,
} from "@/lib/tauri/commands";
import type { AppInfo, AppScanResult, OperationRecord } from "@/lib/tauri/types";

export type AppFilterKey = "all" | "user" | "system" | "launchable" | "managed" | "upgradable";

export const APP_FILTER_OPTIONS = [
  { key: "all" as const, labelKey: "appManager.filterAll" },
  { key: "user" as const, labelKey: "appManager.filterUser" },
  { key: "system" as const, labelKey: "appManager.filterSystem" },
  { key: "launchable" as const, labelKey: "appManager.filterLaunchable" },
  { key: "managed" as const, labelKey: "appManager.filterManaged" },
  { key: "upgradable" as const, labelKey: "appManager.filterUpgradable" },
];

/** Possible states for a management operation on a specific app */
export type OperationStatus = "idle" | "pending" | "running" | "success" | "error";

interface AppOperationState {
  status: OperationStatus;
  message: string;
}

interface AppManagerState {
  apps: AppInfo[];
  loading: boolean;
  error: string;
  searchQuery: string;
  activeFilter: AppFilterKey;
  sorting: SortingState;
  scanned: boolean;
  result: AppScanResult | null;

  // Operation tracking: appId → state
  operations: Record<string, AppOperationState>;
  // Operation history
  history: OperationRecord[];
  // Confirmation dialog
  confirmDialog: {
    open: boolean;
    appId: string;
    appName: string;
    action: "upgrade" | "uninstall";
  };
  // History drawer
  historyOpen: boolean;

  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: AppFilterKey) => void;
  setSorting: (sorting: Updater<SortingState>) => void;
  scanApps: () => Promise<void>;
  refreshUpdates: () => Promise<void>;

  // Operations
  doUpgrade: (appId: string) => Promise<void>;
  doUninstall: (appId: string) => Promise<void>;
  setOperationStatus: (appId: string, status: OperationStatus, message?: string) => void;

  // Confirm dialog
  openConfirmDialog: (appId: string, appName: string, action: "upgrade" | "uninstall") => void;
  closeConfirmDialog: () => void;

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
  activeFilter: "all",
  sorting: [{ id: "name", desc: false }],
  scanned: false,
  result: null,
  operations: {},
  history: [],
  confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" },
  historyOpen: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSorting: (sorting: Updater<SortingState>) =>
    set((state) => ({
      sorting: typeof sorting === "function" ? sorting(state.sorting) : sorting,
    })),

  scanApps: async () => {
    const { loading } = get();
    if (loading) return;

    set({ loading: true, error: "", apps: [], result: null });

    if (!isTauri()) {
      set({ scanned: true, loading: false });
      return;
    }

    try {
      const result = await scanInstalledApps();
      set({
        apps: result.apps,
        result,
        scanned: true,
        loading: false,
      });
      // Load history after scan
      get().loadHistory();
    } catch (e) {
      console.warn("[AppManager] Failed to scan apps:", e);
      set({
        apps: [],
        result: null,
        error: String(e) || "Failed to scan applications",
        scanned: true,
        loading: false,
      });
    }
  },

  refreshUpdates: async () => {
    const { apps } = get();
    if (!isTauri() || apps.length === 0) return;

    try {
      const managedIds = apps
        .filter((a) => a.canUpgrade)
        .map((a) => a.appId);

      if (managedIds.length === 0) return;

      const updatableIds = await checkManagedAppUpdates(managedIds);
      const updatableSet = new Set(updatableIds);

      set((state) => ({
        apps: state.apps.map((a) => ({
          ...a,
          upgradeAvailable: updatableSet.has(a.appId),
        })),
      }));
    } catch (e) {
      console.warn("[AppManager] Failed to check updates:", e);
    }
  },

  // --- Operations ---

  setOperationStatus: (appId, status, message = "") =>
    set((state) => ({
      operations: {
        ...state.operations,
        [appId]: { status, message },
      },
    })),

  doUpgrade: async (appId: string) => {
    const { setOperationStatus, loadHistory } = get();
    setOperationStatus(appId, "running", "Upgrading...");

    try {
      const result = await upgradeApp(appId);
      if (result.success) {
        setOperationStatus(appId, "success", result.message);
        // Clear after 5s
        setTimeout(() => setOperationStatus(appId, "idle"), 5000);
      } else {
        setOperationStatus(appId, "error", result.message);
      }
    } catch (e) {
      setOperationStatus(appId, "error", String(e));
    }

    await loadHistory();
    // Refresh the scan to pick up any changes
    get().scanApps();
  },

  doUninstall: async (appId: string) => {
    const { setOperationStatus, loadHistory } = get();
    setOperationStatus(appId, "running", "Uninstalling...");

    try {
      const result = await uninstallApp(appId);
      if (result.success) {
        setOperationStatus(appId, "success", result.message);
        setTimeout(() => {
          // Re-scan after successful uninstall
          get().scanApps();
        }, 800);
      } else {
        setOperationStatus(appId, "error", result.message);
      }
    } catch (e) {
      setOperationStatus(appId, "error", String(e));
    }

    await loadHistory();
  },

  // --- Confirm dialog ---

  openConfirmDialog: (appId, appName, action) =>
    set({ confirmDialog: { open: true, appId, appName, action } }),

  closeConfirmDialog: () =>
    set({ confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" } }),

  // --- History ---

  loadHistory: async () => {
    if (!isTauri()) return;
    try {
      const records = await getAppOperationHistory();
      set({ history: records });
    } catch (e) {
      console.warn("[AppManager] Failed to load history:", e);
    }
  },

  setHistoryOpen: (open) => set({ historyOpen: open }),

  reset: () =>
    set({
      apps: [],
      loading: false,
      error: "",
      searchQuery: "",
      activeFilter: "all",
      sorting: [{ id: "name", desc: false }],
      scanned: false,
      result: null,
      operations: {},
      history: [],
      confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" },
      historyOpen: false,
    }),
}));
