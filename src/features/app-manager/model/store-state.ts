/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { UpdateSource } from "@/lib/tauri/types/app-manager";
import type { AppManagerState } from "@/features/app-manager/model/store-types";

type AppManagerDataState = Omit<
  AppManagerState,
  | "setSearchQuery"
  | "setActiveFilter"
  | "setMarketplaceFilter"
  | "setCategoryFilter"
  | "setSeriesFilter"
  | "setError"
  | "setSorting"
  | "setOperationStatus"
  | "openConfirmDialog"
  | "closeConfirmDialog"
  | "setInstallState"
  | "openInstallConfirmDialog"
  | "closeInstallConfirmDialog"
  | "toggleSelectApp"
  | "selectAllFiltered"
  | "clearSelectedApps"
  | "clearSelection"
  | "setBatchMode"
  | "openBatchConfirmDialog"
  | "closeBatchConfirmDialog"
  | "clearBatchResults"
  | "setViewMode"
  | "setSelectedItem"
  | "setFilterPanelOpen"
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
    error: null,
    searchQuery: "",
    installedSearchQuery: "",
    marketplaceSearchQuery: "",
    updatesSearchQuery: "",
    activeFilter: "all",
    marketplaceFilter: "all",
    categoryFilter: null,
    installedCategoryFilter: null,
    marketplaceCategoryFilter: null,
    seriesFilter: null,
    installedSeriesFilter: null,
    marketplaceSeriesFilter: null,
    sorting: [{ id: "name", desc: false }],
    scanned: false,
    result: null,
    operations: {},
    confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" },
    selectedAppIds: new Set(),
    batchMode: false,
    batchProgress: null,
    batchResults: null,
    batchConfirmDialog: { open: false, action: "upgrade", count: 0, names: [] },
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
    updatesError: null,
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
