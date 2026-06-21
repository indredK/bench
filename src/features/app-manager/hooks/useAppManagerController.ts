/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types";
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration";
import { useAppManagerStore } from "@/features/app-manager/store";
import { useAppManagerViewState } from "@/features/app-manager/hooks/useAppManagerViewState";
import { createAppManagerColumns } from "@/features/app-manager/columns";
import { createInstallListApps } from "@/features/app-manager/model/install-list";
import {
  createBatchErrorPatch,
  createBatchProgress,
  createBatchSuccessPatch,
  createRunningOperationState,
  isOperationRunning,
  toOperationState,
} from "@/features/app-manager/model/operations";
import {
  filterAppManagerItems,
  filterInstallListApps,
} from "@/features/app-manager/model/selectors";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";
import { useInstallEvents } from "@/features/app-manager/hooks/useInstallEvents";
import { installAppUpdate } from "@/lib/tauri/commands/app-manager";
import { registerFeatureRefresh } from "@/features/refresh";
import type {
  AppInfo,
  InstallListAppInfo,
  UpdateInfo,
  UpdateSource,
} from "@/lib/tauri/types/app-manager";
import type { AppManagerTabKey } from "@/features/app-manager/model/store-types";
import { appManagerPlatformConfig } from "@/platform/config";
import { canUseDesktopFeatures } from "@/platform/capabilities";
import { writeClipboardText } from "@/platform/clipboard";
import { createInstallListColumns } from "@/features/app-manager/components/install-list-columns";
import type { LocalizedError } from "@/lib/errors";
import { localizeError } from "@/lib/errors";

function isInstallerUpdateSource(source: UpdateSource): boolean {
  return source === "sparkle" || source === "electron" || source === "squirrel";
}

export function useAppManagerController(active: boolean) {
  const { t } = useTranslation();
  const viewState = useAppManagerViewState();
  const {
    apps,
    loading,
    error,
    searchQuery,
    activeFilter,
    marketplaceFilter,
    categoryFilter,
    seriesFilter,
    sorting,
    scanned,
    result,
    confirmDialog,
    lastScanTime,
    lastUpdateCheck,
    viewMode,
    selectedItem,
    filterPanelOpen,
    selectedAppIds,
    batchMode,
    batchProgress,
    batchResults,
    batchConfirmDialog,
    installListApps,
    installStates,
    installConfirmDialog,
    activeTab,
    updates,
    updatesLoading,
    updatesError,
    updatesScanned,
    expandedUpdateGroups,
    selectedUpdateIds,
    updateSourceFilter,
    selectedUpdate,
    updateOperations,
  } = viewState;

  const setInstallFinished = useAppManagerStore((s) => s.setInstallFinished);
  const clearInstallProgress = useAppManagerStore((s) => s.clearInstallProgress);
  const clearInstallFinished = useAppManagerStore((s) => s.clearInstallFinished);

  const setSearchQuery = useAppManagerStore((s) => s.setSearchQuery);
  const setActiveFilter = useAppManagerStore((s) => s.setActiveFilter);
  const setMarketplaceFilter = useAppManagerStore((s) => s.setMarketplaceFilter);
  const setCategoryFilter = useAppManagerStore((s) => s.setCategoryFilter);
  const setSeriesFilter = useAppManagerStore((s) => s.setSeriesFilter);
  const setSorting = useAppManagerStore((s) => s.setSorting);
  const openConfirmDialog = useAppManagerStore((s) => s.openConfirmDialog);
  const closeConfirmDialog = useAppManagerStore((s) => s.closeConfirmDialog);
  const clearSelectedApps = useAppManagerStore((s) => s.clearSelectedApps);
  const clearSelection = useAppManagerStore((s) => s.clearSelection);
  const setBatchMode = useAppManagerStore((s) => s.setBatchMode);
  const toggleSelectApp = useAppManagerStore((s) => s.toggleSelectApp);
  const openBatchConfirmDialog = useAppManagerStore((s) => s.openBatchConfirmDialog);
  const closeBatchConfirmDialog = useAppManagerStore((s) => s.closeBatchConfirmDialog);
  const clearBatchResults = useAppManagerStore((s) => s.clearBatchResults);
  const setViewMode = useAppManagerStore((s) => s.setViewMode);
  const setSelectedItem = useAppManagerStore((s) => s.setSelectedItem);
  const setFilterPanelOpen = useAppManagerStore((s) => s.setFilterPanelOpen);
  const openInstallConfirmDialog = useAppManagerStore((s) => s.openInstallConfirmDialog);
  const closeInstallConfirmDialog = useAppManagerStore((s) => s.closeInstallConfirmDialog);

  const setActiveTab = useAppManagerStore((s) => s.setActiveTab);
  const setUpdates = useAppManagerStore((s) => s.setUpdates);
  const setUpdatesLoading = useAppManagerStore((s) => s.setUpdatesLoading);
  const setUpdatesError = useAppManagerStore((s) => s.setUpdatesError);
  const setUpdatesScanned = useAppManagerStore((s) => s.setUpdatesScanned);
  const toggleUpdateGroup = useAppManagerStore((s) => s.toggleUpdateGroup);
  const toggleSelectUpdate = useAppManagerStore((s) => s.toggleSelectUpdate);
  const clearUpdateSelection = useAppManagerStore((s) => s.clearUpdateSelection);
  const setUpdateSourceFilter = useAppManagerStore((s) => s.setUpdateSourceFilter);
  const setSelectedUpdate = useAppManagerStore((s) => s.setSelectedUpdate);
  const setUpdateOperationStatus = useAppManagerStore((s) => s.setUpdateOperationStatus);
  const setError = useAppManagerStore((s) => s.setError);

  const [selectedInstallIds, setSelectedInstallIds] = useState<Set<string>>(new Set());
  const [installBatchMode, setInstallBatchMode] = useState(false);
  const [installDetailItem, setInstallDetailItem] = useState<InstallListAppInfo | null>(null);
  // v1.2: which UpdateInfo the orchestrator is currently driving (drives the
  // progress + blocking dialogs). `null` when nothing is in flight.
  const [inProgressUpdate, setInProgressUpdate] = useState<UpdateInfo | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const pendingBatchExecutionRef = useRef<{
    action: "upgrade" | "uninstall" | "install";
    appIds: string[];
    source: "installed" | "marketplace";
  } | null>(null);
  const pendingInstallerUpdatesRef = useRef<UpdateInfo[]>([]);
  const activeInstallerAppIdRef = useRef<string | null>(null);
  const confirmPendingRef = useRef(false);
  const refreshHandlerRef = useRef<(() => void | Promise<void>) | null>(null);

  // All setTimeout IDs scheduled from this controller. We clear them on
  // unmount so deferred work (status auto-clear, post-op rescans) can't
  // fire against a torn-down view and cause the cross-tab status flicker
  // documented in #068.
  const pendingTimersRef = useRef<Set<number>>(new Set());
  const scheduleTimeout = useCallback((callback: () => void, delayMs: number) => {
    const handle = window.setTimeout(() => {
      pendingTimersRef.current.delete(handle);
      callback();
    }, delayMs);
    pendingTimersRef.current.add(handle);
    return handle;
  }, []);
  useEffect(
    () => () => {
      for (const handle of pendingTimersRef.current) {
        window.clearTimeout(handle);
      }
      pendingTimersRef.current.clear();
    },
    []
  );

  useEffect(() => {
    activeInstallerAppIdRef.current = inProgressUpdate?.appId ?? null;
  }, [inProgressUpdate]);

  const canUsePlatformFeatures = canUseDesktopFeatures();

  // v1.2: subscribe to `app-update-install:*` events; the listener writes phase
  // updates and the terminal finished payload into the store, where the
  // progress / blocking dialogs read from.
  useInstallEvents();

  const deferUntilAfterFirstPaint = useCallback((callback: () => void) => {
    let timeoutId = 0;
    const frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(callback, 0);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  const toLocalizedError = useCallback(
    (key: string, fallback?: string, values?: Record<string, unknown>): LocalizedError => ({
      key,
      values,
      fallback,
    }),
    []
  );

  const scanApps = useCallback(async () => {
    const { loading: currentLoading } = useAppManagerStore.getState();
    if (currentLoading) return;

    useAppManagerStore.setState({
      loading: true,
      error: null,
      selectedAppIds: new Set(),
      batchMode: false,
      batchResults: null,
    });

    if (!appManagerUseCases.isAvailable()) {
      useAppManagerStore.setState({ scanned: true, loading: false });
      return;
    }

    try {
      const scanResult = await appManagerUseCases.scanInstalledApps();
      useAppManagerStore.setState({
        apps: scanResult.apps,
        result: scanResult,
        scanned: true,
        loading: false,
        lastScanTime: scanResult.lastScanTime,
        lastUpdateCheck: scanResult.lastUpdateCheck,
        installListApps: createInstallListApps(scanResult.apps),
      });
    } catch (scanError) {
      useAppManagerStore.setState({
        apps: [],
        result: null,
        error: toLocalizedError(
          "appManager.errors.scanFailed",
          String(scanError) || undefined
        ),
        scanned: true,
        loading: false,
      });
    }
  }, [toLocalizedError]);

  const refreshInstallList = useCallback(() => {
    useAppManagerStore.setState({
      installListApps: createInstallListApps(useAppManagerStore.getState().apps),
    });
  }, []);

  const refreshUpdates = useCallback(async () => {
    const { apps: currentApps } = useAppManagerStore.getState();
    try {
      const updatableSet = await appManagerUseCases.findManagedAppUpdates(currentApps);
      if (updatableSet.size === 0) return;
      useAppManagerStore.setState((state) => ({
        apps: state.apps.map((app) => ({
          ...app,
          upgradeAvailable: updatableSet.has(app.appId),
        })),
      }));
    } catch (updateError) {
      console.warn("[AppManager] Failed to check updates:", updateError);
    }
  }, []);

  const checkAllUpdates = useCallback(
    async (forceRefresh = false) => {
      if (!appManagerUseCases.isAvailable()) return;
      const { updatesLoading: currentLoading } = useAppManagerStore.getState();
      if (currentLoading) return;

      setUpdatesLoading(true);
      setUpdatesError(null);
      try {
        const { updates: result, error } = await appManagerUseCases.checkAllAppUpdates(forceRefresh);
        if (error) {
          setUpdatesError(toLocalizedError("appManager.errors.updateCheckFailed", error));
        }
        setUpdates(result);
        setUpdatesScanned(true);
      } catch (err) {
        setUpdatesError(
          toLocalizedError("appManager.errors.updateCheckFailed", String(err) || undefined)
        );
        setUpdatesScanned(true);
      } finally {
        setUpdatesLoading(false);
      }
    },
    [setUpdates, setUpdatesError, setUpdatesLoading, setUpdatesScanned, toLocalizedError]
  );

  const handleUpdateAction = useCallback(
    async (update: UpdateInfo) => {
      const { updateOperations: ops } = useAppManagerStore.getState();
      if (isOperationRunning(ops, update.appId)) return;

      if (update.source === "macAppStore") {
        if (!update.adamId) {
          setUpdateOperationStatus(update.appId, "error", t("appManager.errors.missingMacAppStoreId"));
          return;
        }
        setUpdateOperationStatus(update.appId, "running", "Opening App Store…");
        try {
          await appManagerUseCases.openInMacAppStore(update.adamId);
          setUpdateOperationStatus(update.appId, "success");
        } catch (err) {
          setUpdateOperationStatus(update.appId, "error", String(err));
        }
        return;
      }

      if (update.source === "homebrew") {
        setUpdateOperationStatus(update.appId, "running", "Upgrading via Homebrew…");
        const outcome = await appManagerUseCases.runAppOperation({ appId: update.appId, kind: "upgrade" });
        if (outcome) {
          setUpdateOperationStatus(
            update.appId,
            outcome.result.success ? "success" : "error",
            outcome.result.message
          );
          if (outcome.shouldRescan) {
            void checkAllUpdates(true);
            void scanApps();
          }
        }
        return;
      }

      // v1.2: sparkle / electron / squirrel — kick off the in-place install
      // orchestrator. Progress flows back through the Tauri events into the
      // store, which the UpdateProgressDialog and UpdateBlockingDialogs read.
      if (isInstallerUpdateSource(update.source)) {
        const activeInstallerAppId = activeInstallerAppIdRef.current;
        if (activeInstallerAppId && activeInstallerAppId !== update.appId) return;
        // Wipe any leftover terminal state from a prior run for this app, so
        // the dialog doesn't see both the in-flight progress AND the previous
        // SU_* failure.
        clearInstallProgress(update.appId);
        clearInstallFinished(update.appId);
        setInProgressUpdate(update);
        setUpdateOperationStatus(update.appId, "running", "Installing update…");
        try {
          await installAppUpdate(update);
        } catch (err) {
          // installAppUpdate returns Ok once the orchestrator is spawned; a
          // synchronous Err means we never reached the running-check phase, so
          // synthesise a finished event so the dialog surfaces the error.
          setInstallFinished(update.appId, {
            appId: update.appId,
            success: false,
            message: String(err),
            errorCode: "SU_INSTALL_FAIL",
          });
        }
        return;
      }

      // gitHub (no installer yet) → still fall back to the releases page.
      const url = update.downloadUrl ?? update.releaseNotesUrl ?? update.feedUrl;
      if (!url) {
        setUpdateOperationStatus(update.appId, "error", t("appManager.errors.noDownloadUrl"));
        return;
      }
      try {
        await appManagerUseCases.openExternal(url);
        setUpdateOperationStatus(update.appId, "success");
      } catch (err) {
        setUpdateOperationStatus(update.appId, "error", String(err));
      }
    },
    [
      checkAllUpdates,
      scanApps,
      setUpdateOperationStatus,
      clearInstallProgress,
      clearInstallFinished,
      setInstallFinished,
    ]
  );

  const handleUpdateSourceAction = useCallback(
    async (source: UpdateSource, sourceUpdates: UpdateInfo[]) => {
      const { updateOperations: ops } = useAppManagerStore.getState();
      const availableUpdates = sourceUpdates.filter((update) => !isOperationRunning(ops, update.appId));
      if (availableUpdates.length === 0) return;

      if (source === "macAppStore") {
        pendingInstallerUpdatesRef.current = [];
        try {
          await appManagerUseCases.openMacAppStoreUpdates();
        } catch (error) {
          setUpdatesError(
            toLocalizedError("appManager.errors.updateCheckFailed", String(error) || undefined)
          );
        }
        return;
      }

      if (isInstallerUpdateSource(source)) {
        if (activeInstallerAppIdRef.current || pendingInstallerUpdatesRef.current.length > 0) {
          return;
        }
        const [firstUpdate, ...restUpdates] = availableUpdates;
        if (!firstUpdate) return;
        pendingInstallerUpdatesRef.current = restUpdates;
        await handleUpdateAction(firstUpdate);
        return;
      }

      pendingInstallerUpdatesRef.current = [];
      for (const update of availableUpdates) {
        await handleUpdateAction(update);
      }
    },
    [handleUpdateAction, setUpdatesError, toLocalizedError]
  );

  // v1.2: invoked by the progress / blocking dialogs when the user dismisses
  // them. Mirrors the terminal install outcome into the row's `updateOperations`
  // status and clears the per-app install snapshots so subsequent runs start
  // fresh. On success we also re-scan so the row drops out of the list.
  const handleCloseInstallDialog = useCallback(() => {
    const update = inProgressUpdate;
    if (!update) return;
    const { installFinished: finishedMap } = useAppManagerStore.getState();
    const finished = finishedMap[update.appId];
    const nextQueuedUpdate =
      finished?.success && pendingInstallerUpdatesRef.current.length > 0
        ? pendingInstallerUpdatesRef.current.shift() ?? null
        : null;

    if (finished) {
      setUpdateOperationStatus(
        update.appId,
        finished.success ? "success" : "error",
        finished.message
      );
      if (finished.success) {
        void checkAllUpdates(true);
        void scanApps();
      }
    } else {
      // User cancelled before any terminal event arrived.
      pendingInstallerUpdatesRef.current = [];
      setUpdateOperationStatus(update.appId, "idle");
    }

    if (finished && !finished.success) {
      pendingInstallerUpdatesRef.current = [];
    }

    clearInstallProgress(update.appId);
    clearInstallFinished(update.appId);
    setInProgressUpdate(null);

    if (nextQueuedUpdate) {
      scheduleTimeout(() => {
        void handleUpdateAction(nextQueuedUpdate);
      }, 0);
    }
  }, [
    inProgressUpdate,
    checkAllUpdates,
    scanApps,
    clearInstallFinished,
    clearInstallProgress,
    handleUpdateAction,
    scheduleTimeout,
    setUpdateOperationStatus,
  ]);

  const handleSetActiveTab = useCallback(
    (tab: AppManagerTabKey) => {
      setActiveTab(tab);
      const state = useAppManagerStore.getState();

      if (tab === "softwareUpdate") {
        const cacheValid =
          state.updatesScanned &&
          state.lastUpdateCheck > 0 &&
          Date.now() - state.lastUpdateCheck < 5 * 60 * 1000;
        if (!state.updatesLoading && !cacheValid) {
          void checkAllUpdates(false);
        }
      }
    },
    [checkAllUpdates, setActiveTab]
  );

  const scheduleScanApps = useCallback(
    (delayMs: number) => {
      scheduleTimeout(() => {
        void scanApps();
      }, delayMs);
    },
    [scanApps, scheduleTimeout]
  );

  const doUpgrade = useCallback(
    async (appId: string) => {
      const { operations, setOperationStatus } = useAppManagerStore.getState();
      if (isOperationRunning(operations, appId)) return;

      useAppManagerStore.setState((state) => ({
        operations: { ...state.operations, [appId]: createRunningOperationState("Upgrading...") },
      }));

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "upgrade" });
      if (!outcome) return;

      useAppManagerStore.setState((state) => ({
        operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
      }));
      if (outcome.result.success) {
        scheduleTimeout(() => setOperationStatus(appId, "idle"), 5000);
      }

      if (outcome.shouldRescan) void scanApps();
    },
    [scanApps, scheduleTimeout]
  );

  const doUninstall = useCallback(
    async (appId: string) => {
      const { operations } = useAppManagerStore.getState();
      if (isOperationRunning(operations, appId)) return;

      useAppManagerStore.setState((state) => ({
        operations: { ...state.operations, [appId]: createRunningOperationState("Uninstalling...") },
      }));

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "uninstall" });
      if (!outcome) return;

      useAppManagerStore.setState((state) => ({
        operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
      }));
      if (outcome.shouldRescan) {
        scheduleScanApps(800);
      }
    },
    [scheduleScanApps]
  );

  const doInstall = useCallback(
    async (appId: string, _appName: string, installSource: InstallListAppInfo["installSource"]) => {
      const { installStates } = useAppManagerStore.getState();
      if (isOperationRunning(installStates, appId)) return;

      useAppManagerStore.setState((state) => ({
        installStates: { ...state.installStates, [appId]: createRunningOperationState("Installing...") },
      }));

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "install", installSource });
      if (!outcome) return;

      useAppManagerStore.setState((state) => ({
        installStates: { ...state.installStates, [appId]: toOperationState(outcome.result) },
      }));
      if (outcome.shouldRescan) {
        scheduleTimeout(() => {
          void scanApps();
          refreshInstallList();
        }, 2000);
      }
    },
    [refreshInstallList, scanApps, scheduleTimeout]
  );

  const runBatchOperation = useCallback(
    async (kind: "upgrade" | "uninstall", ids: string[]) => {
      if (ids.length === 0) return;
      if (useAppManagerStore.getState().batchProgress?.running) return;

      useAppManagerStore.setState({ batchProgress: createBatchProgress(ids.length), batchResults: null });
      const outcome = await appManagerUseCases.runBatchOperation(kind, ids);
      if (!outcome) return;

      useAppManagerStore.setState(
        outcome.result ? createBatchSuccessPatch(outcome.result) : createBatchErrorPatch(outcome.error)
      );
      void scanApps();
    },
    [scanApps]
  );

  const launchApp = useCallback(async (app: AppInfo) => {
    try {
      await appManagerUseCases.launchApp(app);
    } catch (error) {
      console.warn("[AppManager] Failed to launch app:", error);
    }
  }, []);

  const revealApp = useCallback(async (app: AppInfo) => {
    try {
      await appManagerUseCases.revealApp(app);
    } catch (error) {
      console.warn("[AppManager] Failed to reveal app:", error);
    }
  }, []);

  const openExternal = useCallback((reference: string) => {
    return appManagerUseCases.openExternal(reference);
  }, []);

  const copyText = useCallback(async (text?: string) => {
    if (!text) return;
    try {
      await writeClipboardText(text);
    } catch {
      /* clipboard may be unavailable */
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  const clearUpdatesError = useCallback(() => {
    setUpdatesError(null);
  }, [setUpdatesError]);

  useEffect(() => {
    const preferences = appManagerUseCases.loadPreferences();
    useAppManagerStore.setState({
      activeFilter: preferences.activeFilter,
      sorting: preferences.sorting,
      viewMode: appManagerUseCases.loadViewMode(),
    });
    setPreferencesHydrated(true);
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    appManagerUseCases.savePreferences({ activeFilter, sorting });
  }, [preferencesHydrated, activeFilter, sorting]);

  useEffect(() => {
    if (!preferencesHydrated) return;
    appManagerUseCases.saveViewMode(viewMode);
  }, [preferencesHydrated, viewMode]);

  useEffect(() => {
    refreshHandlerRef.current = scanApps;
  }, [scanApps]);

  useEffect(
    () => registerFeatureRefresh("app-manager", () => refreshHandlerRef.current?.()),
    []
  );

  useEffect(() => {
    if (!active || !canUsePlatformFeatures || scanned) return;
    return deferUntilAfterFirstPaint(() => {
      void scanApps();
    });
  }, [active, canUsePlatformFeatures, deferUntilAfterFirstPaint, scanned, scanApps]);

  useEffect(() => {
    if (!active || !scanned || apps.length === 0) return;
    return deferUntilAfterFirstPaint(() => {
      void refreshUpdates();
    });
  }, [active, apps.length, deferUntilAfterFirstPaint, refreshUpdates, scanned]);

  useEffect(() => {
    // Keep detail ESC behavior in one stack so only the topmost panel closes
    // per keypress.
    if (!selectedItem && !installDetailItem && !selectedUpdate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedUpdate) {
        setSelectedUpdate(null);
        return;
      }
      if (installDetailItem) {
        setInstallDetailItem(null);
        return;
      }
      if (selectedItem) {
        setSelectedItem(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    installDetailItem,
    selectedItem,
    selectedUpdate,
    setInstallDetailItem,
    setSelectedItem,
    setSelectedUpdate,
  ]);

  useEffect(() => {
    setSelectedItem(null);
    clearSelection();
  }, [activeFilter, categoryFilter, seriesFilter, searchQuery, setSelectedItem, clearSelection]);

  const getOpStatus = useCallback((appId: string) => {
    const state = useAppManagerStore.getState();
    return state.operations[appId]?.status ?? "idle";
  }, []);

  const filteredApps = useMemo(
    () =>
      filterAppManagerItems({
        apps,
        searchQuery,
        activeFilter,
        categoryFilter,
        seriesFilter,
      }),
    [apps, searchQuery, activeFilter, categoryFilter, seriesFilter]
  );

  const filteredInstallListApps = useMemo(
    () =>
      filterInstallListApps({
        installListApps,
        searchQuery,
        marketplaceFilter,
        categoryFilter,
        seriesFilter,
      }),
    [installListApps, searchQuery, marketplaceFilter, categoryFilter, seriesFilter]
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

  useEffect(() => {
    setInstallDetailItem(null);
    clearInstallSelection();
  }, [activeTab, categoryFilter, marketplaceFilter, seriesFilter, searchQuery, clearInstallSelection]);

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

  const handleToggleInstallBatchMode = useCallback(() => {
    if (installBatchMode) {
      clearInstallSelection();
      setInstallBatchMode(false);
    } else {
      setInstallDetailItem(null);
      setInstallBatchMode(true);
    }
  }, [installBatchMode, clearInstallSelection, setInstallDetailItem]);

  const selectedUpgradableIds = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.upgrade && selectedAppIds.has(app.appId))
        .map((app) => app.appId),
    [apps, selectedAppIds]
  );
  const selectedUpgradableNames = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.upgrade && selectedAppIds.has(app.appId))
        .map((app) => app.name),
    [apps, selectedAppIds]
  );
  const selectedUpgradable = selectedUpgradableIds.length;
  const selectedUninstallableIds = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.uninstall && selectedAppIds.has(app.appId))
        .map((app) => app.appId),
    [apps, selectedAppIds]
  );
  const selectedUninstallableNames = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.uninstall && selectedAppIds.has(app.appId))
        .map((app) => app.name),
    [apps, selectedAppIds]
  );
  const selectedUninstallable = selectedUninstallableIds.length;
  const selectedInstallableIds = useMemo(
    () =>
      installListApps
        .filter((app) => !app.installed && selectedInstallIds.has(app.id))
        .map((app) => app.id),
    [installListApps, selectedInstallIds]
  );
  const selectedInstallableNames = useMemo(
    () =>
      installListApps
        .filter((app) => !app.installed && selectedInstallIds.has(app.id))
        .map((app) => app.name),
    [installListApps, selectedInstallIds]
  );
  const selectedInstallableCount = selectedInstallableIds.length;
  const selectedMarketplaceUninstallableIds = useMemo(
    () =>
      installListApps
        .filter(
          (app) => app.installed && Boolean(app.installedAppId) && selectedInstallIds.has(app.id)
        )
        .map((app) => app.installedAppId as string),
    [installListApps, selectedInstallIds]
  );
  const selectedMarketplaceUninstallableNames = useMemo(
    () =>
      installListApps
        .filter(
          (app) => app.installed && Boolean(app.installedAppId) && selectedInstallIds.has(app.id)
        )
        .map((app) => app.name),
    [installListApps, selectedInstallIds]
  );
  const selectedMarketplaceUninstallableCount = selectedMarketplaceUninstallableIds.length;

  const handleBatchInstall = useCallback(() => {
    if (selectedInstallableIds.length === 0) return;
    pendingBatchExecutionRef.current = {
      action: "install",
      appIds: selectedInstallableIds,
      source: "marketplace",
    };
    openBatchConfirmDialog("install", selectedInstallableIds.length, selectedInstallableNames);
  }, [selectedInstallableIds, selectedInstallableNames, openBatchConfirmDialog]);

  const handleBatchInstallListUninstall = useCallback(() => {
    if (selectedMarketplaceUninstallableIds.length === 0) return;
    pendingBatchExecutionRef.current = {
      action: "uninstall",
      appIds: selectedMarketplaceUninstallableIds,
      source: "marketplace",
    };
    openBatchConfirmDialog(
      "uninstall",
      selectedMarketplaceUninstallableIds.length,
      selectedMarketplaceUninstallableNames
    );
  }, [
    selectedMarketplaceUninstallableIds,
    selectedMarketplaceUninstallableNames,
    openBatchConfirmDialog,
  ]);

  const handleBatchUpgrade = useCallback(() => {
    if (selectedUpgradable === 0) return;
    pendingBatchExecutionRef.current = {
      action: "upgrade",
      appIds: selectedUpgradableIds,
      source: "installed",
    };
    openBatchConfirmDialog("upgrade", selectedUpgradable, selectedUpgradableNames);
  }, [selectedUpgradable, selectedUpgradableIds, selectedUpgradableNames, openBatchConfirmDialog]);

  const handleBatchUninstall = useCallback(() => {
    if (selectedUninstallable === 0) return;
    pendingBatchExecutionRef.current = {
      action: "uninstall",
      appIds: selectedUninstallableIds,
      source: "installed",
    };
    openBatchConfirmDialog("uninstall", selectedUninstallable, selectedUninstallableNames);
  }, [
    selectedUninstallable,
    selectedUninstallableIds,
    selectedUninstallableNames,
    openBatchConfirmDialog,
  ]);

  const handleBatchConfirm = useCallback(async () => {
    const pending = pendingBatchExecutionRef.current;
    pendingBatchExecutionRef.current = null;
    closeBatchConfirmDialog();
    if (!pending) return;

    if (pending.action === "install") {
      clearInstallSelection();
      for (const id of pending.appIds) {
        const app = installListApps.find((item) => item.id === id);
        if (app && !app.installed) await doInstall(app.id, app.name, app.installSource);
      }
      return;
    }

    if (pending.source === "marketplace") {
      clearInstallSelection();
    }
    await runBatchOperation(pending.action, pending.appIds);
  }, [closeBatchConfirmDialog, installListApps, doInstall, clearInstallSelection, runBatchOperation]);

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
        onCopyText: copyText,
      }),
    [t, handleInstall, openExternal, copyText]
  );

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (activeFilter !== "all" ? 1 : 0) +
    ((categoryFilter || seriesFilter) ? 1 : 0);

  const marketplaceFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (marketplaceFilter !== "all" ? 1 : 0) +
    ((categoryFilter || seriesFilter) ? 1 : 0);
  const visibleInstallListInstalledCount = filteredInstallListApps.filter((app) => app.installed).length;
  const visibleInstallListPendingCount = filteredInstallListApps.length - visibleInstallListInstalledCount;
  const caps = result?.platformCapabilities;
  const errorMessage = error ? localizeError(t, error) : "";
  const updatesErrorMessage = updatesError ? localizeError(t, updatesError) : "";

  return {
    t,
    apps,
    loading,
    error: errorMessage,
    searchQuery,
    activeFilter,
    marketplaceFilter,
    categoryFilter,
    seriesFilter,
    sorting,
    scanned,
    result,
    confirmDialog,
    lastScanTime,
    lastUpdateCheck,
    viewMode,
    selectedItem,
    filterPanelOpen,
    selectedAppIds,
    batchMode,
    batchProgress,
    batchResults,
    batchConfirmDialog,
    installListApps,
    installStates,
    installConfirmDialog,
    selectedInstallIds,
    selectedInstallableCount,
    selectedMarketplaceUninstallableCount,
    installBatchMode,
    installDetailItem,
    activeTab,
    updates,
    updatesLoading,
    updatesError: updatesErrorMessage,
    updatesScanned,
    expandedUpdateGroups,
    selectedUpdateIds,
    updateSourceFilter,
    selectedUpdate,
    updateOperations,
    filteredApps,
    filteredInstallListApps,
    activeFilterCount,
    marketplaceFilterCount,
    visibleInstallListApps: filteredInstallListApps,
    visibleInstallListInstalledCount,
    visibleInstallListPendingCount,
    caps,
    canUsePlatformFeatures,
    appManagerColumns,
    installListColumns,
    clearError,
    clearUpdatesError,
    setSearchQuery,
    setActiveFilter,
    setMarketplaceFilter,
    setCategoryFilter,
    setSeriesFilter,
    setSorting,
    scanApps,
    refreshUpdates,
    checkAllUpdates,
    handleUpdateAction,
    handleUpdateSourceAction,
    handleCloseInstallDialog,
    inProgressUpdate,
    handleSetActiveTab,
    toggleUpdateGroup,
    toggleSelectUpdate,
    clearUpdateSelection,
    setUpdateSourceFilter,
    setSelectedUpdate,
    setUpdateOperationStatus,
    clearSelectedApps,
    clearSelection,
    setBatchMode,
    toggleSelectApp,
    openBatchConfirmDialog,
    closeBatchConfirmDialog,
    clearBatchResults,
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
    copyText,
    handleLaunch,
    handleReveal,
    handleUpgradeFromColumn,
    handleUninstallFromColumn,
    handleInstall,
    toggleInstallSelect,
    clearInstallSelection,
    handleBatchInstall,
    handleBatchInstallListUninstall,
    handleInstallConfirm,
    getRowAttributes,
    appRegistration,
    handleConfirmAction,
    handleToggleBatchMode,
    handleToggleInstallBatchMode,
    selectedUpgradable,
    selectedUninstallable,
    handleBatchUpgrade,
    handleBatchUninstall,
    handleBatchConfirm,
    handleDetailUpgrade,
    handleDetailUninstall,
    setInstallBatchMode,
    setInstallDetailItem,
  };
}
