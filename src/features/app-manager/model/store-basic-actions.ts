/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { StoreApi } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import type { AppInfo, UpdateInfo, UpdateSource } from "@/lib/tauri/types/app-manager";
import type {
  InstallFinishedEvent,
  InstallPhase,
} from "@/lib/tauri/types/app-manager";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import type {
  AppManagerState,
  AppManagerTabKey,
} from "@/features/app-manager/model/store-types";
import type {
  AppFilterKey,
  MarketplaceFilterKey,
} from "@/features/app-manager/model/preferences";
import type { OperationStatus } from "@/features/app-manager/model/operations";
import { createInitialAppManagerState } from "@/features/app-manager/model/store-state";
import type { LocalizedError } from "@/lib/errors";

type SetState = StoreApi<AppManagerState>["setState"];

export function createAppManagerBasicActions(set: SetState) {
  const applySearchQuery = (tab: AppManagerTabKey, query: string) => {
    switch (tab) {
      case "marketplace":
        return { searchQuery: query, marketplaceSearchQuery: query };
      case "softwareUpdate":
        return { searchQuery: query, updatesSearchQuery: query };
      case "installed":
      default:
        return { searchQuery: query, installedSearchQuery: query };
    }
  };

  const applyCategoryFilter = (tab: AppManagerTabKey, category: AppCategoryKey | null) => {
    switch (tab) {
      case "marketplace":
        return {
          categoryFilter: category,
          marketplaceCategoryFilter: category,
        };
      case "installed":
        return {
          categoryFilter: category,
          installedCategoryFilter: category,
        };
      case "softwareUpdate":
      default:
        return { categoryFilter: null };
    }
  };

  const applySeriesFilter = (tab: AppManagerTabKey, series: AppSeriesKey | null) => {
    switch (tab) {
      case "marketplace":
        return {
          seriesFilter: series,
          marketplaceSeriesFilter: series,
        };
      case "installed":
        return {
          seriesFilter: series,
          installedSeriesFilter: series,
        };
      case "softwareUpdate":
      default:
        return { seriesFilter: null };
    }
  };

  return {
    setSearchQuery: (query: string) =>
      set((state) => ({
        ...applySearchQuery(state.activeTab, query),
      })),
    setActiveFilter: (filter: AppFilterKey) => set({ activeFilter: filter }),
    setMarketplaceFilter: (filter: MarketplaceFilterKey) => set({ marketplaceFilter: filter }),
    setCategoryFilter: (category: AppCategoryKey | null) =>
      set((state) => ({
        ...applyCategoryFilter(state.activeTab, category),
      })),
    setSeriesFilter: (series: AppSeriesKey | null) =>
      set((state) => ({
        ...applySeriesFilter(state.activeTab, series),
      })),
    setError: (error: LocalizedError | null) => set({ error }),
    setScanProgress: (progress: { current: number; stage: string } | null) =>
      set({ scanProgress: progress }),
    setSorting: (sorting: Updater<SortingState>) =>
      set((state) => ({
        sorting: typeof sorting === "function" ? sorting(state.sorting) : sorting,
      })),

    setOperationStatus: (appId: string, status: OperationStatus, message = "") =>
      set((state) => ({
        operations: { ...state.operations, [appId]: { status, message } },
      })),
    openConfirmDialog: (appId: string, appName: string, action: "upgrade" | "uninstall") =>
      set({ confirmDialog: { open: true, appId, appName, action } }),
    closeConfirmDialog: () =>
      set({ confirmDialog: { open: false, appId: "", appName: "", action: "upgrade" } }),

    setInstallState: (appId: string, status: OperationStatus, message = "") =>
      set((state) => ({
        installStates: { ...state.installStates, [appId]: { status, message } },
      })),
    openInstallConfirmDialog: (appId: string, appName: string) =>
      set({ installConfirmDialog: { open: true, appId, appName } }),
    closeInstallConfirmDialog: () =>
      set({ installConfirmDialog: { open: false, appId: "", appName: "" } }),

    toggleSelectApp: (appId: string) =>
      set((state) => {
        const next = new Set(state.selectedAppIds);
        if (next.has(appId)) next.delete(appId);
        else next.add(appId);
        return { selectedAppIds: next };
      }),
    selectAllFiltered: (filteredIds: string[]) => set({ selectedAppIds: new Set(filteredIds) }),
    clearSelectedApps: () => set({ selectedAppIds: new Set() }),
    clearSelection: () => set({ selectedAppIds: new Set(), batchMode: false }),
    setBatchMode: (on: boolean) => set({ batchMode: on }),
    openBatchConfirmDialog: (
      action: "upgrade" | "uninstall" | "install",
      count: number,
      names: string[] = []
    ) =>
      set({ batchConfirmDialog: { open: true, action, count, names } }),
    closeBatchConfirmDialog: () =>
      set({ batchConfirmDialog: { open: false, action: "upgrade", count: 0, names: [] } }),
    clearBatchResults: () => set({ batchResults: null }),

    setViewMode: (mode: "table" | "grid") => set({ viewMode: mode }),
    setSelectedItem: (item: AppInfo | null) => set({ selectedItem: item }),
    setFilterPanelOpen: (open: boolean) => set({ filterPanelOpen: open }),

    setActiveTab: (tab: AppManagerTabKey) =>
      set((state) => ({
        activeTab: tab,
        ...applySearchQuery(
          tab,
          tab === "marketplace"
            ? state.marketplaceSearchQuery
            : tab === "softwareUpdate"
              ? state.updatesSearchQuery
              : state.installedSearchQuery
        ),
        ...applyCategoryFilter(
          tab,
          tab === "marketplace" ? state.marketplaceCategoryFilter : state.installedCategoryFilter
        ),
        ...applySeriesFilter(
          tab,
          tab === "marketplace" ? state.marketplaceSeriesFilter : state.installedSeriesFilter
        ),
      })),
    setUpdates: (updates: UpdateInfo[]) =>
      set((state) => {
        const updateMap = new Map(updates.map((update) => [update.appId, update]));
        return {
          updates,
          selectedUpdateIds: new Set(
            [...state.selectedUpdateIds].filter((appId) => updateMap.has(appId))
          ),
          selectedUpdate: state.selectedUpdate
            ? updateMap.get(state.selectedUpdate.appId) ?? null
            : null,
        };
      }),
    setUpdatesLoading: (loading: boolean) => set({ updatesLoading: loading }),
    setUpdatesError: (error: LocalizedError | null) => set({ updatesError: error }),
    setUpdatesScanned: (scanned: boolean) => set({ updatesScanned: scanned }),
    toggleUpdateGroup: (source: UpdateSource) =>
      set((state) => ({
        expandedUpdateGroups: {
          ...state.expandedUpdateGroups,
          [source]: !state.expandedUpdateGroups[source],
        },
      })),
    toggleSelectUpdate: (appId: string) =>
      set((state) => {
        const next = new Set(state.selectedUpdateIds);
        if (next.has(appId)) next.delete(appId);
        else next.add(appId);
        return { selectedUpdateIds: next };
      }),
    selectAllUpdates: (appIds: string[]) => set({ selectedUpdateIds: new Set(appIds) }),
    clearUpdateSelection: () => set({ selectedUpdateIds: new Set() }),
    setUpdateSourceFilter: (filter: UpdateSource | "all") => set({ updateSourceFilter: filter }),
    setSelectedUpdate: (update: UpdateInfo | null) => set({ selectedUpdate: update }),
    setUpdateOperationStatus: (appId: string, status: OperationStatus, message = "") =>
      set((state) => ({
        updateOperations: {
          ...state.updateOperations,
          [appId]: { status, message },
        },
      })),

    setInstallProgress: (appId: string, phase: InstallPhase) =>
      set((state) => ({
        installProgress: { ...state.installProgress, [appId]: phase },
      })),
    clearInstallProgress: (appId: string) =>
      set((state) => {
        if (!(appId in state.installProgress)) return state;
        const next = { ...state.installProgress };
        delete next[appId];
        return { installProgress: next };
      }),
    setInstallFinished: (appId: string, event: InstallFinishedEvent) =>
      set((state) => ({
        installFinished: { ...state.installFinished, [appId]: event },
      })),
    clearInstallFinished: (appId: string) =>
      set((state) => {
        if (!(appId in state.installFinished)) return state;
        const next = { ...state.installFinished };
        delete next[appId];
        return { installFinished: next };
      }),

    reset: () =>
      set({
        ...createInitialAppManagerState(),
        activeFilter: "all",
        sorting: [{ id: "name", desc: false }],
      }),
  };
}
