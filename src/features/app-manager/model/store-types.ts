/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { SortingState, Updater } from "@tanstack/react-table"
import type {
  AppInfo,
  AppScanResult,
  BatchOperationResult,
  InstallFinishedEvent,
  InstallListAppInfo,
  InstallPhase,
  UpdateInfo,
  UpdateSource,
} from "@/lib/tauri/types/app-manager"
import type { AppCategoryKey } from "@/features/app-manager/app-categories"
import type { AppSeriesKey } from "@/features/app-manager/app-series"
import type {
  AppOperationState,
  BatchProgress,
  OperationStatus,
} from "@/features/app-manager/model/operations"
import type { AppFilterKey, MarketplaceFilterKey } from "@/features/app-manager/model/preferences"
import type { LocalizedError } from "@/lib/errors"

export type { AppFilterKey }
export type { MarketplaceFilterKey }

export const APP_FILTER_OPTIONS = [
  { key: "all" as const, labelKey: "appManager.filterAll" },
  { key: "user" as const, labelKey: "appManager.filterUser" },
  { key: "system" as const, labelKey: "appManager.filterSystem" },
  { key: "launchable" as const, labelKey: "appManager.filterLaunchable" },
  { key: "managed" as const, labelKey: "appManager.filterManaged" },
]

export const MARKETPLACE_FILTER_OPTIONS = [
  { key: "all" as const, labelKey: "appManager.filterAll" },
  { key: "pending" as const, labelKey: "appManager.installListPending" },
  { key: "installed" as const, labelKey: "appManager.installListInstalled" },
]

export type AppManagerTabKey = "installed" | "softwareUpdate" | "marketplace"

export interface AppManagerState {
  apps: AppInfo[]
  loading: boolean
  scanProgress: { current: number; stage: string } | null
  error: LocalizedError | null
  searchQuery: string
  installedSearchQuery: string
  marketplaceSearchQuery: string
  updatesSearchQuery: string
  activeFilter: AppFilterKey
  marketplaceFilter: MarketplaceFilterKey
  categoryFilter: AppCategoryKey | null
  installedCategoryFilter: AppCategoryKey | null
  marketplaceCategoryFilter: AppCategoryKey | null
  seriesFilter: AppSeriesKey | null
  installedSeriesFilter: AppSeriesKey | null
  marketplaceSeriesFilter: AppSeriesKey | null
  sorting: SortingState
  scanned: boolean
  result: AppScanResult | null

  operations: Record<string, AppOperationState>
  confirmDialog: {
    open: boolean
    appId: string
    appName: string
    action: "upgrade" | "uninstall"
  }

  selectedAppIds: Set<string>
  batchMode: boolean
  batchProgress: BatchProgress | null
  batchResults: BatchOperationResult | null
  batchConfirmDialog: {
    open: boolean
    action: "upgrade" | "uninstall" | "install"
    count: number
    names: string[]
  }

  lastScanTime: number
  lastUpdateCheck: number

  viewMode: "table" | "grid"
  selectedItem: AppInfo | null
  filterPanelOpen: boolean

  installListApps: InstallListAppInfo[]
  installStates: Record<string, AppOperationState>
  installConfirmDialog: {
    open: boolean
    appId: string
    appName: string
  }

  activeTab: AppManagerTabKey
  updates: UpdateInfo[]
  updatesLoading: boolean
  updatesError: LocalizedError | null
  updatesScanned: boolean
  expandedUpdateGroups: Record<UpdateSource, boolean>
  selectedUpdateIds: Set<string>
  updateSourceFilter: UpdateSource | "all"
  selectedUpdate: UpdateInfo | null
  updateOperations: Record<string, AppOperationState>

  /**
   * v1.2: latest `InstallPhase` per app_id for any in-flight install. Cleared
   * when the install reaches a terminal state and the UI dismisses its
   * progress dialog. Dialogs pattern-match on `.phase`.
   */
  installProgress: Record<string, InstallPhase>
  /**
   * v1.2: terminal payload of the most recent install per app_id. Used by the
   * progress dialog to show a final success/failure line, then cleared on
   * dismiss.
   */
  installFinished: Record<string, InstallFinishedEvent>

  setSearchQuery: (query: string) => void
  setActiveFilter: (filter: AppFilterKey) => void
  setMarketplaceFilter: (filter: MarketplaceFilterKey) => void
  setCategoryFilter: (category: AppCategoryKey | null) => void
  setSeriesFilter: (series: AppSeriesKey | null) => void
  setError: (error: LocalizedError | null) => void
  setScanProgress: (progress: { current: number; stage: string } | null) => void
  setSorting: (sorting: Updater<SortingState>) => void

  setOperationStatus: (appId: string, status: OperationStatus, message?: string) => void
  openConfirmDialog: (appId: string, appName: string, action: "upgrade" | "uninstall") => void
  closeConfirmDialog: () => void

  setInstallState: (appId: string, status: OperationStatus, message?: string) => void
  openInstallConfirmDialog: (appId: string, appName: string) => void
  closeInstallConfirmDialog: () => void

  toggleSelectApp: (appId: string) => void
  selectAllFiltered: (filteredIds: string[]) => void
  clearSelectedApps: () => void
  clearSelection: () => void
  setBatchMode: (on: boolean) => void
  openBatchConfirmDialog: (
    action: "upgrade" | "uninstall" | "install",
    count: number,
    names?: string[],
  ) => void
  closeBatchConfirmDialog: () => void
  clearBatchResults: () => void

  setViewMode: (mode: "table" | "grid") => void
  setSelectedItem: (item: AppInfo | null) => void
  setFilterPanelOpen: (open: boolean) => void

  setActiveTab: (tab: AppManagerTabKey) => void
  setUpdates: (updates: UpdateInfo[]) => void
  setUpdatesLoading: (loading: boolean) => void
  setUpdatesError: (error: LocalizedError | null) => void
  setUpdatesScanned: (scanned: boolean) => void
  toggleUpdateGroup: (source: UpdateSource) => void
  toggleSelectUpdate: (appId: string) => void
  selectAllUpdates: (appIds: string[]) => void
  clearUpdateSelection: () => void
  setUpdateSourceFilter: (filter: UpdateSource | "all") => void
  setSelectedUpdate: (update: UpdateInfo | null) => void
  setUpdateOperationStatus: (appId: string, status: OperationStatus, message?: string) => void

  /** v1.2: write the latest progress phase for an app_id. */
  setInstallProgress: (appId: string, phase: InstallPhase) => void
  /** v1.2: clear the in-flight progress entry. */
  clearInstallProgress: (appId: string) => void
  /** v1.2: record the terminal `app-update-install:finished` payload. */
  setInstallFinished: (appId: string, event: InstallFinishedEvent) => void
  /** v1.2: clear the terminal payload after the user dismisses it. */
  clearInstallFinished: (appId: string) => void

  reset: () => void
}
