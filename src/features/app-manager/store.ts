import { create } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import type { AppInfo, AppScanResult, BatchOperationResult, InstallListAppInfo, OperationRecord } from "@/lib/tauri/types/app-manager";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import {
  type AppOperationState,
  type BatchProgress,
  type OperationStatus,
} from "@/features/app-manager/model/operations";
import {
  loadAppManagerPreferences,
  loadAppManagerViewMode,
  saveAppManagerPreferences,
  saveAppManagerViewMode,
  type AppFilterKey,
} from "@/features/app-manager/model/preferences";
import { createAppManagerStoreActions } from "@/features/app-manager/model/store-actions";

export type { AppFilterKey };
export type { OperationStatus };

const savedPrefs = loadAppManagerPreferences();

export const APP_FILTER_OPTIONS = [
  { key: "all" as const, labelKey: "appManager.filterAll" },
  { key: "user" as const, labelKey: "appManager.filterUser" },
  { key: "system" as const, labelKey: "appManager.filterSystem" },
  { key: "launchable" as const, labelKey: "appManager.filterLaunchable" },
  { key: "managed" as const, labelKey: "appManager.filterManaged" },
  { key: "upgradable" as const, labelKey: "appManager.filterUpgradable" },
];

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

const initialState = (): Pick<
  AppManagerState,
  | "apps"
  | "loading"
  | "error"
  | "searchQuery"
  | "activeFilter"
  | "categoryFilter"
  | "seriesFilter"
  | "sorting"
  | "scanned"
  | "result"
  | "operations"
  | "history"
  | "confirmDialog"
  | "historyOpen"
  | "selectedAppIds"
  | "batchMode"
  | "batchProgress"
  | "batchResults"
  | "batchConfirmDialog"
  | "lastScanTime"
  | "lastUpdateCheck"
  | "viewMode"
  | "selectedItem"
  | "filterPanelOpen"
  | "installListApps"
  | "installStates"
  | "installConfirmDialog"
> => ({
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
  selectedAppIds: new Set(),
  batchMode: false,
  batchProgress: null,
  batchResults: null,
  batchConfirmDialog: { open: false, action: "upgrade", count: 0 },
  lastScanTime: 0,
  lastUpdateCheck: 0,
  viewMode: loadAppManagerViewMode(),
  selectedItem: null,
  filterPanelOpen: true,
  installListApps: [],
  installStates: {},
  installConfirmDialog: { open: false, appId: "", appName: "" },
});

export const useAppManagerStore = create<AppManagerState>((set, get) => ({
  ...initialState(),

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

  // --- Single-item Operations ---
  setOperationStatus: (appId, status, message = "") =>
    set((state) => ({ operations: { ...state.operations, [appId]: { status, message } } })),

  openConfirmDialog: (appId, appName, action) =>
    set({ confirmDialog: { open: true, appId, appName, action } }),
  closeConfirmDialog: () =>
    set({ confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" } }),

  // --- Installation Operations ---
  setInstallState: (appId, status, message = "") =>
    set((state) => ({ installStates: { ...state.installStates, [appId]: { status, message } } })),

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

  clearBatchResults: () => set({ batchResults: null }),

  // --- Layout ---
  setViewMode: (mode) => {
    set({ viewMode: mode });
    saveAppManagerViewMode(mode);
  },
  setSelectedItem: (item) => set({ selectedItem: item }),
  setFilterPanelOpen: (open) => set({ filterPanelOpen: open }),

  // --- History ---
  setHistoryOpen: (open) => set({ historyOpen: open }),

  reset: () => set({ ...initialState(), activeFilter: "all", sorting: [{ id: "name", desc: false }] }),

  ...createAppManagerStoreActions(set, get),
}));
