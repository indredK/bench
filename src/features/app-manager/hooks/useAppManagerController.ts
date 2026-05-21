/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types";
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration";
import { useAppManagerStore } from "@/features/app-manager/store";
import { createAppManagerColumns } from "@/features/app-manager/columns";
import { filterAppManagerItems } from "@/features/app-manager/model/selectors";
import { appManagerOperations } from "@/features/app-manager/operations";
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager";
import { appManagerPlatformConfig } from "@/platform/config";
import { canUseDesktopFeatures } from "@/platform/capabilities";
import { createInstallListColumns } from "@/features/app-manager/components/install-list-columns";

export function useAppManagerController(active: boolean) {
  const { t } = useTranslation();

  const apps = useAppManagerStore((s) => s.apps);
  const loading = useAppManagerStore((s) => s.loading);
  const error = useAppManagerStore((s) => s.error);
  const searchQuery = useAppManagerStore((s) => s.searchQuery);
  const activeFilter = useAppManagerStore((s) => s.activeFilter);
  const categoryFilter = useAppManagerStore((s) => s.categoryFilter);
  const seriesFilter = useAppManagerStore((s) => s.seriesFilter);
  const sorting = useAppManagerStore((s) => s.sorting);
  const scanned = useAppManagerStore((s) => s.scanned);
  const result = useAppManagerStore((s) => s.result);
  const history = useAppManagerStore((s) => s.history);
  const confirmDialog = useAppManagerStore((s) => s.confirmDialog);
  const historyOpen = useAppManagerStore((s) => s.historyOpen);
  const lastScanTime = useAppManagerStore((s) => s.lastScanTime);
  const lastUpdateCheck = useAppManagerStore((s) => s.lastUpdateCheck);
  const viewMode = useAppManagerStore((s) => s.viewMode);
  const selectedItem = useAppManagerStore((s) => s.selectedItem);
  const filterPanelOpen = useAppManagerStore((s) => s.filterPanelOpen);
  const selectedAppIds = useAppManagerStore((s) => s.selectedAppIds);
  const batchMode = useAppManagerStore((s) => s.batchMode);
  const batchResults = useAppManagerStore((s) => s.batchResults);
  const batchConfirmDialog = useAppManagerStore((s) => s.batchConfirmDialog);
  const installListApps = useAppManagerStore((s) => s.installListApps);
  const installStates = useAppManagerStore((s) => s.installStates);
  const installConfirmDialog = useAppManagerStore((s) => s.installConfirmDialog);

  const setSearchQuery = useAppManagerStore((s) => s.setSearchQuery);
  const setActiveFilter = useAppManagerStore((s) => s.setActiveFilter);
  const setCategoryFilter = useAppManagerStore((s) => s.setCategoryFilter);
  const setSeriesFilter = useAppManagerStore((s) => s.setSeriesFilter);
  const setSorting = useAppManagerStore((s) => s.setSorting);
  const scanApps = appManagerOperations.scanApps;
  const refreshUpdates = appManagerOperations.refreshUpdates;
  const doUpgrade = appManagerOperations.upgrade;
  const doUninstall = appManagerOperations.uninstall;
  const openConfirmDialog = useAppManagerStore((s) => s.openConfirmDialog);
  const closeConfirmDialog = useAppManagerStore((s) => s.closeConfirmDialog);
  const loadHistory = appManagerOperations.loadHistory;
  const setHistoryOpen = useAppManagerStore((s) => s.setHistoryOpen);
  const clearSelection = useAppManagerStore((s) => s.clearSelection);
  const setBatchMode = useAppManagerStore((s) => s.setBatchMode);
  const toggleSelectApp = useAppManagerStore((s) => s.toggleSelectApp);
  const openBatchConfirmDialog = useAppManagerStore((s) => s.openBatchConfirmDialog);
  const closeBatchConfirmDialog = useAppManagerStore((s) => s.closeBatchConfirmDialog);
  const clearBatchResults = useAppManagerStore((s) => s.clearBatchResults);
  const doBatchUpgrade = appManagerOperations.batchUpgrade;
  const doBatchUninstall = appManagerOperations.batchUninstall;
  const setViewMode = useAppManagerStore((s) => s.setViewMode);
  const setSelectedItem = useAppManagerStore((s) => s.setSelectedItem);
  const setFilterPanelOpen = useAppManagerStore((s) => s.setFilterPanelOpen);
  const doInstall = appManagerOperations.install;
  const openInstallConfirmDialog = useAppManagerStore((s) => s.openInstallConfirmDialog);
  const closeInstallConfirmDialog = useAppManagerStore((s) => s.closeInstallConfirmDialog);
  const launchApp = appManagerOperations.launchApp;
  const revealApp = appManagerOperations.revealApp;
  const openExternal = appManagerOperations.openExternal;

  const [selectedInstallIds, setSelectedInstallIds] = useState<Set<string>>(new Set());
  const [installBatchMode, setInstallBatchMode] = useState(false);
  const [installDetailItem, setInstallDetailItem] = useState<InstallListAppInfo | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const pendingBatchInstallIds = useRef<string[]>([]);
  const confirmPendingRef = useRef(false);

  const canUsePlatformFeatures = canUseDesktopFeatures();

  useEffect(() => {
    appManagerOperations.restorePreferences();
    setPreferencesHydrated(true);
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    appManagerOperations.savePreferences(activeFilter, sorting);
  }, [preferencesHydrated, activeFilter, sorting]);

  useEffect(() => {
    if (!preferencesHydrated) return;
    appManagerOperations.saveViewMode(viewMode);
  }, [preferencesHydrated, viewMode]);

  useEffect(() => {
    if (active && canUsePlatformFeatures && !scanned) scanApps();
  }, [active, canUsePlatformFeatures, scanned, scanApps]);

  useEffect(() => {
    if (scanned && apps.length > 0) refreshUpdates();
  }, [scanned, apps.length, refreshUpdates]);

  useEffect(() => {
    if (historyOpen) loadHistory();
  }, [historyOpen, loadHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [historyOpen, setHistoryOpen]);

  useEffect(() => {
    if (!selectedItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedItem(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedItem, setSelectedItem]);

  useEffect(() => {
    if (!installDetailItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInstallDetailItem(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [installDetailItem]);

  useEffect(() => {
    setSelectedItem(null);
    setInstallDetailItem(null);
  }, [activeFilter, categoryFilter, seriesFilter, searchQuery, setSelectedItem]);

  const getOpStatus = useCallback((appId: string) => {
    const state = useAppManagerStore.getState();
    return state.operations[appId]?.status ?? "idle";
  }, []);

  const filteredApps = useMemo(
    () =>
      filterAppManagerItems({
        apps,
        installListApps,
        searchQuery,
        activeFilter,
        categoryFilter,
        seriesFilter,
      }),
    [apps, installListApps, searchQuery, activeFilter, categoryFilter, seriesFilter]
  );

  const handleLaunch = useCallback(
    async (app: AppInfo) => {
      if (!canUsePlatformFeatures) return;
      await launchApp(app);
    },
    [canUsePlatformFeatures, launchApp]
  );

  const handleReveal = useCallback(
    async (app: AppInfo) => {
      if (!canUsePlatformFeatures) return;
      await revealApp(app);
    },
    [canUsePlatformFeatures, revealApp]
  );

  const handleUpgradeFromColumn = useCallback(
    (app: AppInfo) => {
      openConfirmDialog(app.appId, app.name, "upgrade");
    },
    [openConfirmDialog]
  );

  const handleUninstallFromColumn = useCallback(
    (app: AppInfo) => {
      openConfirmDialog(app.appId, app.name, "uninstall");
    },
    [openConfirmDialog]
  );

  const handleInstall = useCallback(
    (app: InstallListAppInfo) => {
      if (app.installed) return;
      openInstallConfirmDialog(app.id, app.name);
    },
    [openInstallConfirmDialog]
  );

  const toggleInstallSelect = useCallback((id: string) => {
    setSelectedInstallIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearInstallSelection = useCallback(() => {
    setSelectedInstallIds(new Set());
  }, []);

  const handleBatchInstall = useCallback(() => {
    if (selectedInstallIds.size === 0) return;
    pendingBatchInstallIds.current = [...selectedInstallIds];
    openBatchConfirmDialog("install", selectedInstallIds.size);
  }, [selectedInstallIds, openBatchConfirmDialog]);

  const handleInstallConfirm = useCallback(async () => {
    const { appId } = installConfirmDialog;
    closeInstallConfirmDialog();
    const app = installListApps.find((item) => item.id === appId);
    if (app && !app.installed) {
      await doInstall(app.id, app.name, app.installSource);
    }
  }, [installConfirmDialog, closeInstallConfirmDialog, installListApps, doInstall]);

  const getRowAttributes = useCallback(
    (app: AppInfo) => ({
      "data-context-type": "app-manager-row",
      "data-row-id": app.appId,
    }),
    []
  );

  const appRegistration = useMemo(
    () => ({
      id: "app-manager-row",
      selector: '[data-context-type="app-manager-row"]',
      resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
      buildMenu: (ctx: unknown): ContextMenuConfig | null => {
        const appId = ctx as string;
        if (!appId) return null;
        const app = apps.find((item) => item.appId === appId);
        if (!app) return null;
        return {
          id: "app-manager-menu",
          items: [
            {
              id: "launch",
              label: t("appManager.actionLaunch"),
              icon: undefined,
              disabled: !app.allowedActions.launch,
              onClick: () => handleLaunch(app),
            },
            {
              id: "reveal",
              label: t(appManagerPlatformConfig.revealActionLabel),
              icon: undefined,
              disabled: !app.allowedActions.reveal,
              onClick: () => handleReveal(app),
            },
            ...(app.allowedActions.upgrade
              ? [
                  {
                    id: "upgrade",
                    label: t("appManager.actionUpgrade"),
                    icon: undefined,
                    onClick: () => handleUpgradeFromColumn(app),
                  },
                ]
              : []),
            ...(app.allowedActions.uninstall
              ? [
                  {
                    id: "uninstall",
                    label: t("appManager.actionUninstall"),
                    icon: undefined,
                    destructive: true,
                    onClick: () => handleUninstallFromColumn(app),
                  },
                ]
              : []),
          ],
        };
      },
    } satisfies ContextMenuRegistration),
    [apps, t, handleLaunch, handleReveal, handleUpgradeFromColumn, handleUninstallFromColumn]
  );

  useContextMenuRegistration(appRegistration);

  const handleConfirmAction = useCallback(async () => {
    if (confirmPendingRef.current) return;
    const { appId, action } = useAppManagerStore.getState().confirmDialog;
    if (!appId) return;
    confirmPendingRef.current = true;
    closeConfirmDialog();
    try {
      if (action === "upgrade") await doUpgrade(appId);
      else await doUninstall(appId);
    } finally {
      confirmPendingRef.current = false;
    }
  }, [closeConfirmDialog, doUpgrade, doUninstall]);

  const handleToggleBatchMode = useCallback(() => {
    if (batchMode) {
      clearSelection();
      setBatchMode(false);
    } else {
      setSelectedItem(null);
      setBatchMode(true);
    }
  }, [batchMode, clearSelection, setBatchMode, setSelectedItem]);

  const selectedUpgradable = activeFilter !== "installList"
    ? (filteredApps as AppInfo[]).filter(
        (app) => app.allowedActions.upgrade && selectedAppIds.has(app.appId)
      ).length
    : 0;
  const selectedUninstallable = activeFilter !== "installList"
    ? (filteredApps as AppInfo[]).filter(
        (app) => app.allowedActions.uninstall && selectedAppIds.has(app.appId)
      ).length
    : 0;

  const handleBatchUpgrade = useCallback(() => {
    if (selectedUpgradable === 0) return;
    openBatchConfirmDialog("upgrade", selectedUpgradable);
  }, [selectedUpgradable, openBatchConfirmDialog]);

  const handleBatchUninstall = useCallback(() => {
    if (selectedUninstallable === 0) return;
    openBatchConfirmDialog("uninstall", selectedUninstallable);
  }, [selectedUninstallable, openBatchConfirmDialog]);

  const handleBatchConfirm = useCallback(async () => {
    const action = batchConfirmDialog.action;
    closeBatchConfirmDialog();
    if (action === "upgrade") await doBatchUpgrade();
    else if (action === "uninstall") await doBatchUninstall();
    else if (action === "install") {
      const ids = pendingBatchInstallIds.current;
      pendingBatchInstallIds.current = [];
      clearInstallSelection();
      for (const id of ids) {
        const app = installListApps.find((item) => item.id === id);
        if (app && !app.installed) await doInstall(app.id, app.name, app.installSource);
      }
    }
  }, [batchConfirmDialog, closeBatchConfirmDialog, doBatchUpgrade, doBatchUninstall, installListApps, doInstall, clearInstallSelection]);

  const handleDetailUpgrade = useCallback(() => {
    if (!selectedItem) return;
    openConfirmDialog(selectedItem.appId, selectedItem.name, "upgrade");
  }, [selectedItem, openConfirmDialog]);

  const handleDetailUninstall = useCallback(() => {
    if (!selectedItem) return;
    openConfirmDialog(selectedItem.appId, selectedItem.name, "uninstall");
  }, [selectedItem, openConfirmDialog]);

  const appManagerColumns = useMemo(
    () =>
      createAppManagerColumns(
        t,
        getOpStatus,
        handleLaunch,
        handleReveal,
        handleUpgradeFromColumn,
        handleUninstallFromColumn
      ),
    [t, getOpStatus, handleLaunch, handleReveal, handleUpgradeFromColumn, handleUninstallFromColumn]
  );

  const installListColumns = useMemo(
    () =>
      createInstallListColumns({
        t,
        onInstall: handleInstall,
        onOpenWebsite: (url) => {
          if (url) void openExternal(url);
        },
      }),
    [t, handleInstall, openExternal]
  );

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (activeFilter !== "all" ? 1 : 0) +
    ((categoryFilter || seriesFilter) ? 1 : 0);

  const visibleInstallListApps =
    activeFilter === "installList" ? (filteredApps as InstallListAppInfo[]) : installListApps;
  const visibleInstallListInstalledCount = visibleInstallListApps.filter((app) => app.installed).length;
  const visibleInstallListPendingCount = visibleInstallListApps.length - visibleInstallListInstalledCount;
  const caps = result?.platformCapabilities;

  return {
    t,
    apps,
    loading,
    error,
    searchQuery,
    activeFilter,
    categoryFilter,
    seriesFilter,
    sorting,
    scanned,
    result,
    history,
    confirmDialog,
    historyOpen,
    lastScanTime,
    lastUpdateCheck,
    viewMode,
    selectedItem,
    filterPanelOpen,
    selectedAppIds,
    batchMode,
    batchResults,
    batchConfirmDialog,
    installListApps,
    installStates,
    installConfirmDialog,
    selectedInstallIds,
    installBatchMode,
    installDetailItem,
    filteredApps,
    activeFilterCount,
    visibleInstallListApps,
    visibleInstallListInstalledCount,
    visibleInstallListPendingCount,
    caps,
    canUsePlatformFeatures,
    appManagerColumns,
    installListColumns,
    setSearchQuery,
    setActiveFilter,
    setCategoryFilter,
    setSeriesFilter,
    setSorting,
    scanApps,
    refreshUpdates,
    loadHistory,
    setHistoryOpen,
    clearSelection,
    setBatchMode,
    toggleSelectApp,
    openBatchConfirmDialog,
    closeBatchConfirmDialog,
    clearBatchResults,
    doBatchUpgrade,
    doBatchUninstall,
    setViewMode,
    setSelectedItem,
    setFilterPanelOpen,
    doInstall,
    openInstallConfirmDialog,
    closeConfirmDialog,
    closeInstallConfirmDialog,
    launchApp,
    revealApp,
    openExternal,
    handleLaunch,
    handleReveal,
    handleUpgradeFromColumn,
    handleUninstallFromColumn,
    handleInstall,
    toggleInstallSelect,
    clearInstallSelection,
    handleBatchInstall,
    handleInstallConfirm,
    getRowAttributes,
    appRegistration,
    handleConfirmAction,
    handleToggleBatchMode,
    selectedUpgradable,
    selectedUninstallable,
    handleBatchUpgrade,
    handleBatchUninstall,
    handleBatchConfirm,
    handleDetailUpgrade,
    handleDetailUninstall,
    setInstallBatchMode,
    setInstallDetailItem,
    pendingBatchInstallIds,
  };
}
