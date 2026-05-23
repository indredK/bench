/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { UpdateSource } from "@/lib/tauri/types/app-manager";
import type { AppManagerState } from "@/features/app-manager/model/store-types";

type AppManagerDataState = Omit<
  AppManagerState,
  | "setSearchQuery"
  | "setActiveFilter"
  | "setCategoryFilter"
  | "setSeriesFilter"
  | "setSorting"
  | "setOperationStatus"
  | "openConfirmDialog"
  | "closeConfirmDialog"
  | "setInstallState"
  | "openInstallConfirmDialog"
  | "closeInstallConfirmDialog"
  | "toggleSelectApp"
  | "selectAllFiltered"
  | "clearSelection"
  | "setBatchMode"
  | "openBatchConfirmDialog"
  | "closeBatchConfirmDialog"
  | "clearBatchResults"
  | "setViewMode"
  | "setSelectedItem"
  | "setFilterPanelOpen"
  | "setHistoryOpen"
  | "setActiveTab"
  | "setUpdates"
  | "setUpdatesLoading"
  | "setUpdatesError"
  | "setUpdatesScanned"
  | "toggleUpdateGroup"
  | "toggleSelectUpdate"
  | "selectAllUpdates"
  | "clearUpdateSelection"
  | "setUpdateSourceFilter"
  | "setSelectedUpdate"
  | "setUpdateOperationStatus"
  | "setInstallProgress"
  | "clearInstallProgress"
  | "setInstallFinished"
  | "clearInstallFinished"
  | "reset"
>;

function defaultExpandedGroups(): Record<UpdateSource, boolean> {
  return {
    homebrew: true,
    macAppStore: true,
    sparkle: true,
    electron: true,
    squirrel: true,
    gitHub: true,
  };
}

export function createInitialAppManagerState(): AppManagerDataState {
  return {
    apps: [],
    loading: false,
    error: "",
    searchQuery: "",
    activeFilter: "all",
    categoryFilter: null,
    seriesFilter: null,
    sorting: [{ id: "name", desc: false }],
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
    viewMode: "table",
    selectedItem: null,
    filterPanelOpen: true,
    installListApps: [],
    installStates: {},
    installConfirmDialog: { open: false, appId: "", appName: "" },
    activeTab: "installed",
    updates: [],
    updatesLoading: false,
    updatesError: "",
    updatesScanned: false,
    expandedUpdateGroups: defaultExpandedGroups(),
    selectedUpdateIds: new Set(),
    updateSourceFilter: "all",
    selectedUpdate: null,
    updateOperations: {},
    installProgress: {},
    installFinished: {},
  };
}
