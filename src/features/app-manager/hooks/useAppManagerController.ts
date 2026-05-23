/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types";
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration";
import { useAppManagerStore } from "@/features/app-manager/store";
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
import type { AppInfo, InstallListAppInfo, UpdateInfo } from "@/lib/tauri/types/app-manager";
import type { AppManagerTabKey } from "@/features/app-manager/model/store-types";
import { appManagerPlatformConfig } from "@/platform/config";
import { canUseDesktopFeatures } from "@/platform/capabilities";
import { writeClipboardText } from "@/platform/clipboard";
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

  const activeTab = useAppManagerStore((s) => s.activeTab);
  const updates = useAppManagerStore((s) => s.updates);
  const updatesLoading = useAppManagerStore((s) => s.updatesLoading);
  const updatesError = useAppManagerStore((s) => s.updatesError);
  const updatesScanned = useAppManagerStore((s) => s.updatesScanned);
  const expandedUpdateGroups = useAppManagerStore((s) => s.expandedUpdateGroups);
  const selectedUpdateIds = useAppManagerStore((s) => s.selectedUpdateIds);
  const updateSourceFilter = useAppManagerStore((s) => s.updateSourceFilter);
  const selectedUpdate = useAppManagerStore((s) => s.selectedUpdate);
  const updateOperations = useAppManagerStore((s) => s.updateOperations);

  const setInstallFinished = useAppManagerStore((s) => s.setInstallFinished);
  const clearInstallProgress = useAppManagerStore((s) => s.clearInstallProgress);
  const clearInstallFinished = useAppManagerStore((s) => s.clearInstallFinished);

  const setSearchQuery = useAppManagerStore((s) => s.setSearchQuery);
  const setActiveFilter = useAppManagerStore((s) => s.setActiveFilter);
  const setCategoryFilter = useAppManagerStore((s) => s.setCategoryFilter);
  const setSeriesFilter = useAppManagerStore((s) => s.setSeriesFilter);
  const setSorting = useAppManagerStore((s) => s.setSorting);
  const openConfirmDialog = useAppManagerStore((s) => s.openConfirmDialog);
  const closeConfirmDialog = useAppManagerStore((s) => s.closeConfirmDialog);
  const setHistoryOpen = useAppManagerStore((s) => s.setHistoryOpen);
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
  const selectAllUpdates = useAppManagerStore((s) => s.selectAllUpdates);
  const clearUpdateSelection = useAppManagerStore((s) => s.clearUpdateSelection);
  const setUpdateSourceFilter = useAppManagerStore((s) => s.setUpdateSourceFilter);
  const setSelectedUpdate = useAppManagerStore((s) => s.setSelectedUpdate);
  const setUpdateOperationStatus = useAppManagerStore((s) => s.setUpdateOperationStatus);

  const [selectedInstallIds, setSelectedInstallIds] = useState<Set<string>>(new Set());
  const [installBatchMode, setInstallBatchMode] = useState(false);
  const [installDetailItem, setInstallDetailItem] = useState<InstallListAppInfo | null>(null);
  // v1.2: which UpdateInfo the orchestrator is currently driving (drives the
  // progress + blocking dialogs). `null` when nothing is in flight.
  const [inProgressUpdate, setInProgressUpdate] = useState<UpdateInfo | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const pendingBatchInstallIds = useRef<string[]>([]);
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

  const loadHistory = useCallback(async () => {
    if (!appManagerUseCases.isAvailable()) return;
    try {
      useAppManagerStore.setState({ history: await appManagerUseCases.loadHistory() });
    } catch (error) {
      console.warn("[AppManager] Failed to load history:", error);
    }
  }, []);

  const scanApps = useCallback(async () => {
    const { loading: currentLoading } = useAppManagerStore.getState();
    if (currentLoading) return;

    useAppManagerStore.setState({
      loading: true,
      error: "",
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
      void loadHistory();
    } catch (scanError) {
      useAppManagerStore.setState({
        apps: [],
        result: null,
        error: String(scanError) || "Failed to scan",
        scanned: true,
        loading: false,
      });
    }
  }, [loadHistory]);

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
      setUpdatesError("");
      try {
        const { updates: result, error } = await appManagerUseCases.checkAllAppUpdates(forceRefresh);
        if (error) {
          setUpdatesError(error);
        }
        setUpdates(result);
        setUpdatesScanned(true);
      } catch (err) {
        setUpdatesError(String(err));
        setUpdatesScanned(true);
      } finally {
        setUpdatesLoading(false);
      }
    },
    [setUpdates, setUpdatesError, setUpdatesLoading, setUpdatesScanned]
  );

  const handleUpdateAction = useCallback(
    async (update: UpdateInfo) => {
      const { updateOperations: ops } = useAppManagerStore.getState();
      if (isOperationRunning(ops, update.appId)) return;

      if (update.source === "macAppStore") {
        if (!update.adamId) {
          setUpdateOperationStatus(update.appId, "error", "Missing Mac App Store identifier");
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
      if (update.source === "sparkle" || update.source === "electron" || update.source === "squirrel") {
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
        setUpdateOperationStatus(update.appId, "error", "No download URL available");
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

  // v1.2: invoked by the progress / blocking dialogs when the user dismisses
  // them. Mirrors the terminal install outcome into the row's `updateOperations`
  // status and clears the per-app install snapshots so subsequent runs start
  // fresh. On success we also re-scan so the row drops out of the list.
  const handleCloseInstallDialog = useCallback(() => {
    const update = inProgressUpdate;
    if (!update) return;
    const { installFinished: finishedMap } = useAppManagerStore.getState();
    const finished = finishedMap[update.appId];
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
      setUpdateOperationStatus(update.appId, "idle");
    }
    clearInstallProgress(update.appId);
    clearInstallFinished(update.appId);
    setInProgressUpdate(null);
  }, [
    inProgressUpdate,
    checkAllUpdates,
    scanApps,
    clearInstallFinished,
    clearInstallProgress,
    setUpdateOperationStatus,
  ]);

  const handleUpdateAllVisible = useCallback(
    async (visibleUpdates: UpdateInfo[]) => {
      if (visibleUpdates.length === 0) return;
      for (const update of visibleUpdates) {
        if (update.source === "homebrew") {
          // For non-brew sources, "update all" still iterates so external pages are opened in sequence.
          await handleUpdateAction(update);
        } else {
          await handleUpdateAction(update);
        }
      }
    },
    [handleUpdateAction]
  );

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

      await loadHistory();
      if (outcome.shouldRescan) void scanApps();
    },
    [loadHistory, scanApps, scheduleTimeout]
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

      await loadHistory();
    },
    [loadHistory, scheduleScanApps]
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
    async (kind: "upgrade" | "uninstall") => {
      const ids = Array.from(useAppManagerStore.getState().selectedAppIds);
      if (ids.length === 0) return;

      useAppManagerStore.setState({ batchProgress: createBatchProgress(ids.length), batchResults: null });
      const outcome = await appManagerUseCases.runBatchOperation(kind, ids);
      if (!outcome) return;

      useAppManagerStore.setState(
        outcome.result ? createBatchSuccessPatch(outcome.result) : createBatchErrorPatch(outcome.error)
      );
      await loadHistory();
      void scanApps();
    },
    [loadHistory, scanApps]
  );

  const doBatchUpgrade = useCallback(() => runBatchOperation("upgrade"), [runBatchOperation]);
  const doBatchUninstall = useCallback(() => runBatchOperation("uninstall"), [runBatchOperation]);

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
    if (historyOpen) loadHistory();
  }, [historyOpen, loadHistory]);

  useEffect(() => {
    // Single ESC listener with deepest-first priority. Previously each modal
    // (history / selectedItem / installDetailItem) registered its own
    // document-level keydown listener, so when two modals were open ESC
    // closed both at once instead of unwinding the stack (#069).
    if (!historyOpen && !selectedItem && !installDetailItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (installDetailItem) {
        setInstallDetailItem(null);
        return;
      }
      if (selectedItem) {
        setSelectedItem(null);
        return;
      }
      if (historyOpen) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [historyOpen, installDetailItem, selectedItem, setHistoryOpen, setInstallDetailItem, setSelectedItem]);

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
        categoryFilter,
        seriesFilter,
      }),
    [installListApps, searchQuery, categoryFilter, seriesFilter]
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
  }, [activeTab, categoryFilter, seriesFilter, searchQuery, clearInstallSelection]);

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

  const selectedUpgradable = filteredApps.filter(
    (app) => app.allowedActions.upgrade && selectedAppIds.has(app.appId)
  ).length;
  const selectedUninstallable = filteredApps.filter(
    (app) => app.allowedActions.uninstall && selectedAppIds.has(app.appId)
  ).length;

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
    ((categoryFilter || seriesFilter) ? 1 : 0);
  const visibleInstallListInstalledCount = filteredInstallListApps.filter((app) => app.installed).length;
  const visibleInstallListPendingCount = filteredInstallListApps.length - visibleInstallListInstalledCount;
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
    setSearchQuery,
    setActiveFilter,
    setCategoryFilter,
    setSeriesFilter,
    setSorting,
    scanApps,
    refreshUpdates,
    checkAllUpdates,
    handleUpdateAction,
    handleUpdateAllVisible,
    handleCloseInstallDialog,
    inProgressUpdate,
    handleSetActiveTab,
    toggleUpdateGroup,
    toggleSelectUpdate,
    selectAllUpdates,
    clearUpdateSelection,
    setUpdateSourceFilter,
    setSelectedUpdate,
    setUpdateOperationStatus,
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
    copyText,
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
