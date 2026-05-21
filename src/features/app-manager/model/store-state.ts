import type { AppManagerState } from "@/features/app-manager/model/store-types";
import {
  loadAppManagerPreferences,
  loadAppManagerViewMode,
} from "@/features/app-manager/model/preferences";

type AppManagerDataState = Omit<
  AppManagerState,
  | "setSearchQuery"
  | "setActiveFilter"
  | "setCategoryFilter"
  | "setSeriesFilter"
  | "setSorting"
  | "scanApps"
  | "refreshUpdates"
  | "refreshInstallList"
  | "doUpgrade"
  | "doUninstall"
  | "setOperationStatus"
  | "openConfirmDialog"
  | "closeConfirmDialog"
  | "setInstallState"
  | "doInstall"
  | "openInstallConfirmDialog"
  | "closeInstallConfirmDialog"
  | "launchApp"
  | "revealApp"
  | "openExternal"
  | "toggleSelectApp"
  | "selectAllFiltered"
  | "clearSelection"
  | "setBatchMode"
  | "openBatchConfirmDialog"
  | "closeBatchConfirmDialog"
  | "clearBatchResults"
  | "doBatchUpgrade"
  | "doBatchUninstall"
  | "setViewMode"
  | "setSelectedItem"
  | "setFilterPanelOpen"
  | "loadHistory"
  | "setHistoryOpen"
  | "reset"
>;

export function createInitialAppManagerState(): AppManagerDataState {
  const savedPrefs = loadAppManagerPreferences();

  return {
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
  };
}
