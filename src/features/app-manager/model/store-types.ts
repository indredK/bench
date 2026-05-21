import type { SortingState, Updater } from "@tanstack/react-table";
import type {
  AppInfo,
  AppScanResult,
  BatchOperationResult,
  InstallListAppInfo,
  OperationRecord,
} from "@/lib/tauri/types/app-manager";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import type {
  AppOperationState,
  BatchProgress,
  OperationStatus,
} from "@/features/app-manager/model/operations";
import type { AppFilterKey } from "@/features/app-manager/model/preferences";

export type { AppFilterKey };

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

  operations: Record<string, AppOperationState>;
  history: OperationRecord[];
  confirmDialog: {
    open: boolean;
    appId: string;
    appName: string;
    action: "upgrade" | "uninstall";
  };
  historyOpen: boolean;

  selectedAppIds: Set<string>;
  batchMode: boolean;
  batchProgress: BatchProgress | null;
  batchResults: BatchOperationResult | null;
  batchConfirmDialog: {
    open: boolean;
    action: "upgrade" | "uninstall" | "install";
    count: number;
  };

  lastScanTime: number;
  lastUpdateCheck: number;

  viewMode: "table" | "grid";
  selectedItem: AppInfo | null;
  filterPanelOpen: boolean;

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

  doUpgrade: (appId: string) => Promise<void>;
  doUninstall: (appId: string) => Promise<void>;
  setOperationStatus: (appId: string, status: OperationStatus, message?: string) => void;
  openConfirmDialog: (appId: string, appName: string, action: "upgrade" | "uninstall") => void;
  closeConfirmDialog: () => void;

  setInstallState: (appId: string, status: OperationStatus, message?: string) => void;
  doInstall: (
    appId: string,
    appName: string,
    installSource: InstallListAppInfo["installSource"]
  ) => Promise<void>;
  openInstallConfirmDialog: (appId: string, appName: string) => void;
  closeInstallConfirmDialog: () => void;
  launchApp: (app: AppInfo) => Promise<void>;
  revealApp: (app: AppInfo) => Promise<void>;
  openExternal: (reference: string) => Promise<void>;

  toggleSelectApp: (appId: string) => void;
  selectAllFiltered: (filteredIds: string[]) => void;
  clearSelection: () => void;
  setBatchMode: (on: boolean) => void;
  openBatchConfirmDialog: (action: "upgrade" | "uninstall" | "install", count: number) => void;
  closeBatchConfirmDialog: () => void;
  clearBatchResults: () => void;
  doBatchUpgrade: () => Promise<void>;
  doBatchUninstall: () => Promise<void>;

  setViewMode: (mode: "table" | "grid") => void;
  setSelectedItem: (item: AppInfo | null) => void;
  setFilterPanelOpen: (open: boolean) => void;

  loadHistory: () => Promise<void>;
  setHistoryOpen: (open: boolean) => void;

  reset: () => void;
}
