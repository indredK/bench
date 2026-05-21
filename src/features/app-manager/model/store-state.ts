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
  | "reset"
>;

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
  };
}
