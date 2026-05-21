/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { StoreApi } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import type { AppInfo } from "@/lib/tauri/types/app-manager";
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import type { AppManagerState } from "@/features/app-manager/model/store-types";
import type { AppFilterKey } from "@/features/app-manager/model/preferences";
import type { OperationStatus } from "@/features/app-manager/model/operations";
import { createInitialAppManagerState } from "@/features/app-manager/model/store-state";

type SetState = StoreApi<AppManagerState>["setState"];

export function createAppManagerBasicActions(set: SetState) {
  return {
    setSearchQuery: (query: string) => set({ searchQuery: query }),
    setActiveFilter: (filter: AppFilterKey) => set({ activeFilter: filter }),
    setCategoryFilter: (category: AppCategoryKey | null) => set({ categoryFilter: category }),
    setSeriesFilter: (series: AppSeriesKey | null) => set({ seriesFilter: series }),
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
    clearSelection: () => set({ selectedAppIds: new Set(), batchMode: false }),
    setBatchMode: (on: boolean) => set({ batchMode: on }),
    openBatchConfirmDialog: (action: "upgrade" | "uninstall" | "install", count: number) =>
      set({ batchConfirmDialog: { open: true, action, count } }),
    closeBatchConfirmDialog: () =>
      set({ batchConfirmDialog: { open: false, action: "upgrade", count: 0 } }),
    clearBatchResults: () => set({ batchResults: null }),

    setViewMode: (mode: "table" | "grid") => set({ viewMode: mode }),
    setSelectedItem: (item: AppInfo | null) => set({ selectedItem: item }),
    setFilterPanelOpen: (open: boolean) => set({ filterPanelOpen: open }),
    setHistoryOpen: (open: boolean) => set({ historyOpen: open }),

    reset: () =>
      set({
        ...createInitialAppManagerState(),
        activeFilter: "all",
        sorting: [{ id: "name", desc: false }],
      }),
  };
}
