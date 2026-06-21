import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppManagerStore } from "@/features/app-manager/store";

export function useAppManagerViewState() {
  const state = useAppManagerStore(
    useShallow((store) => ({
      apps: store.apps,
      loading: store.loading,
      error: store.error,
      searchQuery: store.searchQuery,
      activeFilter: store.activeFilter,
      marketplaceFilter: store.marketplaceFilter,
      categoryFilter: store.categoryFilter,
      seriesFilter: store.seriesFilter,
      sorting: store.sorting,
      scanned: store.scanned,
      result: store.result,
      confirmDialog: store.confirmDialog,
      lastScanTime: store.lastScanTime,
      lastUpdateCheck: store.lastUpdateCheck,
      viewMode: store.viewMode,
      selectedItem: store.selectedItem,
      filterPanelOpen: store.filterPanelOpen,
      selectedAppIds: store.selectedAppIds,
      batchMode: store.batchMode,
      batchProgress: store.batchProgress,
      batchResults: store.batchResults,
      batchConfirmDialog: store.batchConfirmDialog,
      installListApps: store.installListApps,
      installStates: store.installStates,
      installConfirmDialog: store.installConfirmDialog,
      activeTab: store.activeTab,
      updates: store.updates,
      updatesLoading: store.updatesLoading,
      updatesError: store.updatesError,
      updatesScanned: store.updatesScanned,
      expandedUpdateGroups: store.expandedUpdateGroups,
      selectedUpdateIds: store.selectedUpdateIds,
      updateSourceFilter: store.updateSourceFilter,
      selectedUpdate: store.selectedUpdate,
      updateOperations: store.updateOperations,
      installFinished: store.installFinished,
      installProgress: store.installProgress,
    }))
  );

  return useMemo(() => state, [state]);
}
