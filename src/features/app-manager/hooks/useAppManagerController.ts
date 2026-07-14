/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types"
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration"
import { useAppManagerStore } from "@/features/app-manager/store"
import { useAppManagerViewState } from "@/features/app-manager/hooks/useAppManagerViewState"
import { createAppManagerColumns } from "@/features/app-manager/columns"
import { createInstallListApps } from "@/features/app-manager/model/install-list"
import {
  createRunningOperationState,
  isOperationRunning,
  toOperationState,
} from "@/features/app-manager/model/operations"
import {
  filterAppManagerItems,
  filterInstallListApps,
} from "@/features/app-manager/model/selectors"
import { canAuthorizeMacApp } from "@/features/app-manager/model/authorize-app"
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases"
import { useAppManagerUpdates } from "@/features/app-manager/hooks/useAppManagerUpdates"
import { registerFeatureRefresh } from "@/features/refresh"
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager"
import type { AppManagerTabKey } from "@/features/app-manager/model/store-types"
import { appManagerPlatformConfig } from "@/platform/config"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { writeClipboardText } from "@/platform/clipboard"
import { useAppInventoryStore } from "@/shared/app-inventory/store"
import { appInventoryUseCases } from "@/shared/app-inventory/inventory.use-cases"
import { createInstallListColumns } from "@/features/app-manager/components/install-list-columns"
import type { LocalizedError } from "@/lib/errors"
import { localizeError } from "@/lib/errors"
import { getErrorMessage } from "@/lib/tauri/errors"

export function useAppManagerController(active: boolean) {
  const { t } = useTranslation()
  const viewState = useAppManagerViewState()
  const {
    apps,
    loading,
    scanProgress,
    error,
    installedSearchQuery,
    marketplaceSearchQuery,
    updatesSearchQuery,
    activeFilter,
    marketplaceFilter,
    installedCategoryFilter,
    marketplaceCategoryFilter,
    installedSeriesFilter,
    marketplaceSeriesFilter,
    sorting,
    scanned,
    result,
    confirmDialog,
    lastScanTime,
    lastUpdateCheck,
    viewMode,
    selectedItem,
    installedFilterPanelOpen,
    marketplaceFilterPanelOpen,
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
    updatesWarning,
    updatesScanned,
    expandedUpdateGroups,
    selectedUpdateIds,
    updateSourceFilter,
    selectedUpdate,
    updateOperations,
  } = viewState

  const setSearchQuery = useAppManagerStore((s) => s.setSearchQuery)
  const setActiveFilter = useAppManagerStore((s) => s.setActiveFilter)
  const setMarketplaceFilter = useAppManagerStore((s) => s.setMarketplaceFilter)
  const setCategoryFilter = useAppManagerStore((s) => s.setCategoryFilter)
  const setSeriesFilter = useAppManagerStore((s) => s.setSeriesFilter)
  const setSorting = useAppManagerStore((s) => s.setSorting)
  const openConfirmDialog = useAppManagerStore((s) => s.openConfirmDialog)
  const closeConfirmDialog = useAppManagerStore((s) => s.closeConfirmDialog)
  const clearSelectedApps = useAppManagerStore((s) => s.clearSelectedApps)
  const clearSelection = useAppManagerStore((s) => s.clearSelection)
  const setBatchMode = useAppManagerStore((s) => s.setBatchMode)
  const toggleSelectApp = useAppManagerStore((s) => s.toggleSelectApp)
  const openBatchConfirmDialog = useAppManagerStore((s) => s.openBatchConfirmDialog)
  const closeBatchConfirmDialog = useAppManagerStore((s) => s.closeBatchConfirmDialog)
  const clearBatchResults = useAppManagerStore((s) => s.clearBatchResults)
  const setViewMode = useAppManagerStore((s) => s.setViewMode)
  const setSelectedItem = useAppManagerStore((s) => s.setSelectedItem)
  const setInstalledFilterPanelOpen = useAppManagerStore((s) => s.setInstalledFilterPanelOpen)
  const setMarketplaceFilterPanelOpen = useAppManagerStore((s) => s.setMarketplaceFilterPanelOpen)
  const openInstallConfirmDialog = useAppManagerStore((s) => s.openInstallConfirmDialog)
  const closeInstallConfirmDialog = useAppManagerStore((s) => s.closeInstallConfirmDialog)

  const setActiveTab = useAppManagerStore((s) => s.setActiveTab)
  const toggleUpdateGroup = useAppManagerStore((s) => s.toggleUpdateGroup)
  const toggleSelectUpdate = useAppManagerStore((s) => s.toggleSelectUpdate)
  const clearUpdateSelection = useAppManagerStore((s) => s.clearUpdateSelection)
  const setUpdateSourceFilter = useAppManagerStore((s) => s.setUpdateSourceFilter)
  const setSelectedUpdate = useAppManagerStore((s) => s.setSelectedUpdate)
  const setUpdatesError = useAppManagerStore((s) => s.setUpdatesError)
  const setUpdatesWarning = useAppManagerStore((s) => s.setUpdatesWarning)
  const setUpdateOperationStatus = useAppManagerStore((s) => s.setUpdateOperationStatus)
  const setError = useAppManagerStore((s) => s.setError)

  const [selectedInstallIds, setSelectedInstallIds] = useState<Set<string>>(new Set())
  const [installBatchMode, setInstallBatchMode] = useState(false)
  const [installDetailItem, setInstallDetailItem] = useState<InstallListAppInfo | null>(null)
  const [authorizeConfirmDialog, setAuthorizeConfirmDialog] = useState({
    open: false,
    appId: "",
    appName: "",
  })
  const [preferencesHydrated, setPreferencesHydrated] = useState(false)
  const pendingBatchExecutionRef = useRef<{
    action: "upgrade" | "uninstall" | "install"
    appIds: string[]
    source: "installed" | "marketplace"
  } | null>(null)
  const batchInstallCancelRef = useRef(false)
  const confirmPendingRef = useRef(false)
  const refreshHandlerRef = useRef<(() => void | Promise<void>) | null>(null)

  // All setTimeout IDs scheduled from this controller. We clear them on
  // unmount so deferred work (status auto-clear, post-op rescans) can't
  // fire against a torn-down view and cause the cross-tab status flicker
  // documented in #068.
  const pendingTimersRef = useRef<Set<number>>(new Set())
  const scheduleTimeout = useCallback((callback: () => void, delayMs: number) => {
    const handle = window.setTimeout(() => {
      pendingTimersRef.current.delete(handle)
      callback()
    }, delayMs)
    pendingTimersRef.current.add(handle)
    return handle
  }, [])
  useEffect(
    () => () => {
      for (const handle of pendingTimersRef.current) {
        window.clearTimeout(handle)
      }
      pendingTimersRef.current.clear()
    },
    [],
  )

  const canUsePlatformFeatures = canUseDesktopFeatures()
  const inventoryProgress = useAppInventoryStore((state) => state.progress)
  const inventorySnapshot = useAppInventoryStore((state) => state.snapshot)

  const deferUntilAfterFirstPaint = useCallback((callback: () => void) => {
    let timeoutId = 0
    const frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(callback, 0)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [])

  const toLocalizedError = useCallback(
    (key: string, fallback?: string, values?: Record<string, unknown>): LocalizedError => ({
      key,
      values,
      fallback,
    }),
    [],
  )

  const scanApps = useCallback(async () => {
    const { loading: currentLoading } = useAppManagerStore.getState()
    if (currentLoading) return

    useAppManagerStore.setState({
      loading: true,
      scanProgress: { current: 0, stage: "scanningDirectories" },
      error: null,
      selectedAppIds: new Set(),
      batchMode: false,
      batchResults: null,
    })

    if (!appManagerUseCases.isAvailable()) {
      useAppManagerStore.setState({ scanned: true, loading: false, scanProgress: null })
      return
    }

    try {
      const scanResult = await appInventoryUseCases.refresh()
      useAppManagerStore.setState({
        apps: scanResult.apps,
        result: scanResult,
        scanned: true,
        loading: false,
        scanProgress: null,
        lastScanTime: scanResult.lastScanTime,
        lastUpdateCheck: scanResult.lastUpdateCheck,
        installListApps: createInstallListApps(scanResult.apps),
      })
    } catch (scanError) {
      useAppManagerStore.setState({
        error: toLocalizedError(
          "appManager.errors.scanFailed",
          getErrorMessage(scanError) || undefined,
        ),
        scanned: true,
        loading: false,
        scanProgress: null,
      })
    }
  }, [toLocalizedError])

  const cancelInventoryScan = useCallback(() => appInventoryUseCases.cancel(), [])

  useEffect(() => {
    if (!inventorySnapshot) return
    const currentRevision = useAppManagerStore.getState().result?.revision
    if (currentRevision === inventorySnapshot.revision) return
    useAppManagerStore.setState({
      apps: inventorySnapshot.apps,
      result: inventorySnapshot,
      scanned: true,
      loading: false,
      scanProgress: null,
      lastScanTime: inventorySnapshot.lastScanTime,
      lastUpdateCheck: inventorySnapshot.lastUpdateCheck,
      installListApps: createInstallListApps(inventorySnapshot.apps),
      error:
        inventorySnapshot.complete === false
          ? toLocalizedError("appManager.errors.scanPartial", undefined, {
              providers: (inventorySnapshot.providers ?? [])
                .filter((provider) => provider.state !== "ok")
                .map((provider) => provider.provider)
                .join(", "),
            })
          : null,
    })
  }, [inventorySnapshot, toLocalizedError])

  const refreshInstallList = useCallback(() => {
    useAppManagerStore.setState({
      installListApps: createInstallListApps(useAppManagerStore.getState().apps),
    })
  }, [])

  const {
    inProgressUpdate,
    refreshUpdates,
    checkAllUpdates,
    handleUpdateAction,
    handleUpdateSourceAction,
    handleCloseInstallDialog,
    runBatchOperation,
    cancelBatch,
  } = useAppManagerUpdates(scanApps, toLocalizedError, scheduleTimeout)

  const cancelBatchAll = useCallback(() => {
    batchInstallCancelRef.current = true
    void cancelBatch()
  }, [cancelBatch])

  const handleSetActiveTab = useCallback(
    (tab: AppManagerTabKey) => {
      setActiveTab(tab)
    },
    [setActiveTab],
  )

  const scheduleScanApps = useCallback(
    (delayMs: number) => {
      scheduleTimeout(() => {
        void scanApps()
      }, delayMs)
    },
    [scanApps, scheduleTimeout],
  )

  const doUpgrade = useCallback(
    async (appId: string) => {
      const { operations, setOperationStatus } = useAppManagerStore.getState()
      if (isOperationRunning(operations, appId)) return

      useAppManagerStore.setState((state) => ({
        operations: {
          ...state.operations,
          [appId]: createRunningOperationState(t("appManager.operation.upgrading")),
        },
      }))

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "upgrade" })
      if (!outcome) return

      useAppManagerStore.setState((state) => ({
        operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
      }))
      if (outcome.result.success) {
        scheduleTimeout(() => setOperationStatus(appId, "idle"), 5000)
      }

      if (outcome.shouldRescan) void scanApps()
    },
    [scanApps, scheduleTimeout, t],
  )

  const doUninstall = useCallback(
    async (appId: string) => {
      const { operations } = useAppManagerStore.getState()
      if (isOperationRunning(operations, appId)) return

      useAppManagerStore.setState((state) => ({
        operations: {
          ...state.operations,
          [appId]: createRunningOperationState(t("appManager.operation.uninstalling")),
        },
      }))

      const outcome = await appManagerUseCases.runAppOperation({ appId, kind: "uninstall" })
      if (!outcome) return

      useAppManagerStore.setState((state) => ({
        operations: { ...state.operations, [appId]: toOperationState(outcome.result) },
      }))
      if (outcome.shouldRescan) {
        scheduleScanApps(800)
      }
    },
    [scheduleScanApps, t],
  )

  const doInstall = useCallback(
    async (
      appId: string,
      _appName: string,
      installSource: InstallListAppInfo["installSource"],
      rescanAfter = true,
    ) => {
      const { installStates } = useAppManagerStore.getState()
      if (isOperationRunning(installStates, appId)) return null

      useAppManagerStore.setState((state) => ({
        installStates: {
          ...state.installStates,
          [appId]: createRunningOperationState(t("appManager.operation.installing")),
        },
      }))

      const outcome = await appManagerUseCases.runAppOperation({
        appId,
        kind: "install",
        installSource,
      })
      if (!outcome) return null

      useAppManagerStore.setState((state) => ({
        installStates: { ...state.installStates, [appId]: toOperationState(outcome.result) },
      }))
      if (outcome.shouldRescan && rescanAfter) {
        scheduleTimeout(() => {
          void scanApps()
          refreshInstallList()
        }, 2000)
      }
      return outcome.result
    },
    [refreshInstallList, scanApps, scheduleTimeout, t],
  )

  const launchApp = useCallback(
    async (app: AppInfo) => {
      try {
        await appManagerUseCases.launchApp(app)
      } catch (error) {
        toast.error(
          t("appManager.errors.launchFailed", {
            name: app.name,
            defaultValue: getErrorMessage(error),
          }),
        )
      }
    },
    [t],
  )

  const revealApp = useCallback(
    async (app: AppInfo) => {
      try {
        await appManagerUseCases.revealApp(app)
      } catch (error) {
        toast.error(
          t("appManager.errors.revealFailed", {
            name: app.name,
            defaultValue: getErrorMessage(error),
          }),
        )
      }
    },
    [t],
  )

  const openExternal = useCallback((reference: string) => {
    return appManagerUseCases.openExternal(reference)
  }, [])

  const copyText = useCallback(async (text?: string) => {
    if (!text) return
    try {
      await writeClipboardText(text)
    } catch {
      /* clipboard may be unavailable */
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [setError])

  const clearUpdatesError = useCallback(() => {
    setUpdatesError(null)
  }, [setUpdatesError])

  const clearUpdatesWarning = useCallback(() => {
    setUpdatesWarning(null)
  }, [setUpdatesWarning])

  const refreshCurrentTab = useCallback(async () => {
    const { activeTab: currentTab } = useAppManagerStore.getState()
    if (currentTab === "softwareUpdate") {
      await checkAllUpdates(true)
      return
    }
    await scanApps()
  }, [checkAllUpdates, scanApps])

  useEffect(() => {
    const preferences = appManagerUseCases.loadPreferences()
    useAppManagerStore.setState({
      activeFilter: preferences.activeFilter,
      sorting: preferences.sorting,
      viewMode: appManagerUseCases.loadViewMode(),
    })
    setPreferencesHydrated(true)
  }, [])

  useEffect(() => {
    if (!preferencesHydrated) return
    appManagerUseCases.savePreferences({ activeFilter, sorting })
  }, [preferencesHydrated, activeFilter, sorting])

  useEffect(() => {
    if (!preferencesHydrated) return
    appManagerUseCases.saveViewMode(viewMode)
  }, [preferencesHydrated, viewMode])

  useEffect(() => {
    refreshHandlerRef.current = refreshCurrentTab
  }, [refreshCurrentTab])

  useEffect(() => registerFeatureRefresh("app-manager", () => refreshHandlerRef.current?.()), [])

  useEffect(() => {
    if (!active || !canUsePlatformFeatures || scanned) return
    return deferUntilAfterFirstPaint(() => {
      void scanApps()
    })
  }, [active, canUsePlatformFeatures, deferUntilAfterFirstPaint, scanned, scanApps])

  useEffect(() => {
    if (!active || !scanned || apps.length === 0) return
    return deferUntilAfterFirstPaint(() => {
      void refreshUpdates()
    })
  }, [active, apps.length, deferUntilAfterFirstPaint, refreshUpdates, scanned])

  useEffect(() => {
    // 进入软件更新视图（切换标签 / 深链 / 激活功能）时自动获取更新，
    // 无需手动点击。5 分钟内已检查过则复用缓存，避免无谓重复请求。
    if (!active || activeTab !== "softwareUpdate") return
    const state = useAppManagerStore.getState()
    const cacheValid =
      state.updatesScanned &&
      state.lastUpdateCheck > 0 &&
      Date.now() - state.lastUpdateCheck < 5 * 60 * 1000
    if (!state.updatesLoading && !cacheValid) {
      void checkAllUpdates(false)
    }
  }, [active, activeTab, checkAllUpdates])

  useEffect(() => {
    // Keep detail ESC behavior in one stack so only the topmost panel closes
    // per keypress.
    if (!selectedItem && !installDetailItem && !selectedUpdate) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (selectedUpdate) {
        setSelectedUpdate(null)
        return
      }
      if (installDetailItem) {
        setInstallDetailItem(null)
        return
      }
      if (selectedItem) {
        setSelectedItem(null)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [
    installDetailItem,
    selectedItem,
    selectedUpdate,
    setInstallDetailItem,
    setSelectedItem,
    setSelectedUpdate,
  ])

  useEffect(() => {
    setSelectedItem(null)
    clearSelection()
  }, [
    activeFilter,
    installedCategoryFilter,
    installedSeriesFilter,
    installedSearchQuery,
    setSelectedItem,
    clearSelection,
  ])

  const getOpStatus = useCallback((appId: string) => {
    const state = useAppManagerStore.getState()
    return state.operations[appId]?.status ?? "idle"
  }, [])

  const filteredApps = useMemo(
    () =>
      filterAppManagerItems({
        apps,
        searchQuery: installedSearchQuery,
        activeFilter,
        categoryFilter: installedCategoryFilter,
        seriesFilter: installedSeriesFilter,
      }),
    [apps, installedSearchQuery, activeFilter, installedCategoryFilter, installedSeriesFilter],
  )

  const filteredInstallListApps = useMemo(
    () =>
      filterInstallListApps({
        installListApps,
        searchQuery: marketplaceSearchQuery,
        marketplaceFilter,
        categoryFilter: marketplaceCategoryFilter,
        seriesFilter: marketplaceSeriesFilter,
        getLocalizedDescription: (app) =>
          t(`appManager.recommendedApps.${app.id}`, { defaultValue: app.description }),
      }),
    [
      installListApps,
      marketplaceSearchQuery,
      marketplaceFilter,
      marketplaceCategoryFilter,
      marketplaceSeriesFilter,
      t,
    ],
  )

  const handleLaunch = useCallback(
    async (app: AppInfo) => {
      if (!canUsePlatformFeatures) return
      await launchApp(app)
    },
    [canUsePlatformFeatures, launchApp],
  )

  const handleReveal = useCallback(
    async (app: AppInfo) => {
      if (!canUsePlatformFeatures) return
      await revealApp(app)
    },
    [canUsePlatformFeatures, revealApp],
  )

  const handleUpgradeFromColumn = useCallback(
    (app: AppInfo) => {
      openConfirmDialog(app.appId, app.name, "upgrade")
    },
    [openConfirmDialog],
  )

  const handleUninstallFromColumn = useCallback(
    (app: AppInfo) => {
      openConfirmDialog(app.appId, app.name, "uninstall")
    },
    [openConfirmDialog],
  )

  const closeAuthorizeConfirmDialog = useCallback(() => {
    setAuthorizeConfirmDialog({ open: false, appId: "", appName: "" })
  }, [])

  const handleAuthorizeFromColumn = useCallback((app: AppInfo) => {
    if (!canAuthorizeMacApp(app)) return
    setAuthorizeConfirmDialog({ open: true, appId: app.appId, appName: app.name })
  }, [])

  const handleAuthorizeConfirm = useCallback(async () => {
    const app = apps.find((item) => item.appId === authorizeConfirmDialog.appId)
    closeAuthorizeConfirmDialog()
    if (!app) return

    try {
      const result = await appManagerUseCases.authorizeMacApp(app)
      if (result.success) {
        toast.success(t("appManager.authorizeSuccess", { name: app.name }))
        return
      }
      toast.error(t("appManager.authorizeFailed", { message: result.message }))
    } catch (error) {
      toast.error(t("appManager.authorizeFailed", { message: getErrorMessage(error) }))
    }
  }, [apps, authorizeConfirmDialog.appId, closeAuthorizeConfirmDialog, t])

  const handleInstall = useCallback(
    (app: InstallListAppInfo) => {
      if (app.installed) return
      openInstallConfirmDialog(app.id, app.name)
    },
    [openInstallConfirmDialog],
  )

  const toggleInstallSelect = useCallback((id: string) => {
    setSelectedInstallIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearInstallSelection = useCallback(() => {
    setSelectedInstallIds(new Set())
  }, [])

  useEffect(() => {
    setInstallDetailItem(null)
    clearInstallSelection()
  }, [
    activeTab,
    marketplaceCategoryFilter,
    marketplaceFilter,
    marketplaceSeriesFilter,
    marketplaceSearchQuery,
    clearInstallSelection,
  ])

  const handleInstallConfirm = useCallback(async () => {
    const { appId } = installConfirmDialog
    closeInstallConfirmDialog()
    const app = installListApps.find((item) => item.id === appId)
    if (app && !app.installed) {
      await doInstall(app.id, app.name, app.installSource)
    }
  }, [installConfirmDialog, closeInstallConfirmDialog, installListApps, doInstall])

  const getRowAttributes = useCallback(
    (app: AppInfo) => ({
      "data-context-type": "app-manager-row",
      "data-row-id": app.appId,
    }),
    [],
  )

  const appRegistration = useMemo(
    () =>
      ({
        id: "app-manager-row",
        selector: '[data-context-type="app-manager-row"]',
        resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
        buildMenu: (ctx: unknown): ContextMenuConfig | null => {
          const appId = ctx as string
          if (!appId) return null
          const app = apps.find((item) => item.appId === appId)
          if (!app) return null
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
              ...(canAuthorizeMacApp(app)
                ? [
                    {
                      id: "authorize",
                      label: t("appManager.actionAuthorize"),
                      icon: undefined,
                      onClick: () => handleAuthorizeFromColumn(app),
                    },
                  ]
                : []),
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
          }
        },
      }) satisfies ContextMenuRegistration,
    [
      apps,
      t,
      handleLaunch,
      handleReveal,
      handleAuthorizeFromColumn,
      handleUpgradeFromColumn,
      handleUninstallFromColumn,
    ],
  )

  useContextMenuRegistration(appRegistration)

  const handleConfirmAction = useCallback(async () => {
    if (confirmPendingRef.current) return
    const { appId, action } = useAppManagerStore.getState().confirmDialog
    if (!appId) return
    confirmPendingRef.current = true
    closeConfirmDialog()
    try {
      if (action === "upgrade") await doUpgrade(appId)
      else await doUninstall(appId)
    } finally {
      confirmPendingRef.current = false
    }
  }, [closeConfirmDialog, doUpgrade, doUninstall])

  const handleToggleBatchMode = useCallback(() => {
    if (batchMode) {
      clearSelection()
      setBatchMode(false)
    } else {
      setSelectedItem(null)
      setBatchMode(true)
    }
  }, [batchMode, clearSelection, setBatchMode, setSelectedItem])

  const handleToggleInstallBatchMode = useCallback(() => {
    if (installBatchMode) {
      clearInstallSelection()
      setInstallBatchMode(false)
    } else {
      setInstallDetailItem(null)
      setInstallBatchMode(true)
    }
  }, [installBatchMode, clearInstallSelection, setInstallDetailItem])

  const selectedUpgradableIds = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.upgrade && selectedAppIds.has(app.appId))
        .map((app) => app.appId),
    [apps, selectedAppIds],
  )
  const selectedUpgradableNames = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.upgrade && selectedAppIds.has(app.appId))
        .map((app) => app.name),
    [apps, selectedAppIds],
  )
  const selectedUpgradable = selectedUpgradableIds.length
  const selectedUninstallableIds = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.uninstall && selectedAppIds.has(app.appId))
        .map((app) => app.appId),
    [apps, selectedAppIds],
  )
  const selectedUninstallableNames = useMemo(
    () =>
      apps
        .filter((app) => app.allowedActions.uninstall && selectedAppIds.has(app.appId))
        .map((app) => app.name),
    [apps, selectedAppIds],
  )
  const selectedUninstallable = selectedUninstallableIds.length
  const selectedInstallableIds = useMemo(
    () =>
      installListApps
        .filter((app) => !app.installed && selectedInstallIds.has(app.id))
        .map((app) => app.id),
    [installListApps, selectedInstallIds],
  )
  const selectedInstallableNames = useMemo(
    () =>
      installListApps
        .filter((app) => !app.installed && selectedInstallIds.has(app.id))
        .map((app) => app.name),
    [installListApps, selectedInstallIds],
  )
  const selectedInstallableCount = selectedInstallableIds.length
  const selectedMarketplaceUninstallableIds = useMemo(
    () =>
      installListApps
        .filter(
          (app) =>
            app.installed &&
            app.installedCanUninstall === true &&
            Boolean(app.installedAppId) &&
            selectedInstallIds.has(app.id),
        )
        .map((app) => app.installedAppId as string),
    [installListApps, selectedInstallIds],
  )
  const selectedMarketplaceUninstallableNames = useMemo(
    () =>
      installListApps
        .filter(
          (app) =>
            app.installed &&
            app.installedCanUninstall === true &&
            Boolean(app.installedAppId) &&
            selectedInstallIds.has(app.id),
        )
        .map((app) => app.name),
    [installListApps, selectedInstallIds],
  )
  const selectedMarketplaceUninstallableCount = selectedMarketplaceUninstallableIds.length

  const handleBatchInstall = useCallback(() => {
    if (selectedInstallableIds.length === 0) return
    pendingBatchExecutionRef.current = {
      action: "install",
      appIds: selectedInstallableIds,
      source: "marketplace",
    }
    openBatchConfirmDialog("install", selectedInstallableIds.length, selectedInstallableNames)
  }, [selectedInstallableIds, selectedInstallableNames, openBatchConfirmDialog])

  const handleBatchInstallListUninstall = useCallback(() => {
    if (selectedMarketplaceUninstallableIds.length === 0) return
    pendingBatchExecutionRef.current = {
      action: "uninstall",
      appIds: selectedMarketplaceUninstallableIds,
      source: "marketplace",
    }
    openBatchConfirmDialog(
      "uninstall",
      selectedMarketplaceUninstallableIds.length,
      selectedMarketplaceUninstallableNames,
    )
  }, [
    selectedMarketplaceUninstallableIds,
    selectedMarketplaceUninstallableNames,
    openBatchConfirmDialog,
  ])

  const handleBatchUpgrade = useCallback(() => {
    if (selectedUpgradable === 0) return
    pendingBatchExecutionRef.current = {
      action: "upgrade",
      appIds: selectedUpgradableIds,
      source: "installed",
    }
    openBatchConfirmDialog("upgrade", selectedUpgradable, selectedUpgradableNames)
  }, [selectedUpgradable, selectedUpgradableIds, selectedUpgradableNames, openBatchConfirmDialog])

  const handleBatchUninstall = useCallback(() => {
    if (selectedUninstallable === 0) return
    pendingBatchExecutionRef.current = {
      action: "uninstall",
      appIds: selectedUninstallableIds,
      source: "installed",
    }
    openBatchConfirmDialog("uninstall", selectedUninstallable, selectedUninstallableNames)
  }, [
    selectedUninstallable,
    selectedUninstallableIds,
    selectedUninstallableNames,
    openBatchConfirmDialog,
  ])

  const handleBatchConfirm = useCallback(async () => {
    const pending = pendingBatchExecutionRef.current
    pendingBatchExecutionRef.current = null
    closeBatchConfirmDialog()
    if (!pending) return

    if (pending.action === "install") {
      batchInstallCancelRef.current = false
      clearInstallSelection()
      useAppManagerStore.setState({
        batchProgress: { running: true, current: 0, total: pending.appIds.length },
        batchResults: null,
      })
      const results: Array<{
        appId: string
        appName: string
        success: boolean
        message: string
        exitCode: number | null
      }> = []
      for (const [index, id] of pending.appIds.entries()) {
        if (batchInstallCancelRef.current) break
        const app = installListApps.find((item) => item.id === id)
        if (app && !app.installed) {
          const result = await doInstall(app.id, app.name, app.installSource, false)
          if (result) {
            results.push({
              appId: app.id,
              appName: app.name,
              success: result.success,
              message: result.message,
              exitCode: result.exitCode,
            })
          } else {
            results.push({
              appId: app.id,
              appName: app.name,
              success: false,
              message: t("appManager.errors.genericOperationFailure"),
              exitCode: null,
            })
          }
        } else {
          results.push({
            appId: id,
            appName: app?.name ?? id,
            success: false,
            message: t("appManager.errors.genericOperationFailure"),
            exitCode: null,
          })
        }
        useAppManagerStore.setState({
          batchProgress: {
            running: true,
            current: index + 1,
            total: pending.appIds.length,
          },
        })
      }
      const cancelled = pending.appIds.length - results.length
      if (cancelled > 0) {
        for (const id of pending.appIds.slice(results.length)) {
          const app = installListApps.find((item) => item.id === id)
          results.push({
            appId: id,
            appName: app?.name ?? id,
            success: false,
            message: t("appManager.batchCancelled", { n: 1 }),
            exitCode: null,
          })
        }
      }
      useAppManagerStore.setState({
        batchProgress: null,
        batchResults: {
          total: pending.appIds.length,
          succeeded: results.filter((item) => item.success).length,
          failed: results.filter((item) => !item.success).length - cancelled,
          cancelled,
          results,
        },
      })
      scheduleTimeout(() => {
        void scanApps()
      }, 1200)
      return
    }

    if (pending.source === "marketplace") {
      clearInstallSelection()
    }
    await runBatchOperation(pending.action, pending.appIds)
  }, [
    closeBatchConfirmDialog,
    installListApps,
    doInstall,
    clearInstallSelection,
    runBatchOperation,
    scanApps,
    scheduleTimeout,
    t,
  ])

  const handleDetailUpgrade = useCallback(() => {
    if (!selectedItem) return
    openConfirmDialog(selectedItem.appId, selectedItem.name, "upgrade")
  }, [selectedItem, openConfirmDialog])

  const handleDetailUninstall = useCallback(() => {
    if (!selectedItem) return
    openConfirmDialog(selectedItem.appId, selectedItem.name, "uninstall")
  }, [selectedItem, openConfirmDialog])

  const appManagerColumns = useMemo(
    () =>
      createAppManagerColumns(
        t,
        getOpStatus,
        handleLaunch,
        handleReveal,
        handleUpgradeFromColumn,
        handleUninstallFromColumn,
      ),
    [
      t,
      getOpStatus,
      handleLaunch,
      handleReveal,
      handleUpgradeFromColumn,
      handleUninstallFromColumn,
    ],
  )

  const installListColumns = useMemo(
    () =>
      createInstallListColumns({
        t,
        onInstall: handleInstall,
        onOpenWebsite: (url) => {
          if (url) void openExternal(url)
        },
        onCopyText: copyText,
      }),
    [t, handleInstall, openExternal, copyText],
  )

  const activeSearchQuery =
    activeTab === "softwareUpdate"
      ? updatesSearchQuery
      : activeTab === "marketplace"
        ? marketplaceSearchQuery
        : installedSearchQuery
  const activeCategoryFilter =
    activeTab === "marketplace"
      ? marketplaceCategoryFilter
      : activeTab === "installed"
        ? installedCategoryFilter
        : null
  const activeSeriesFilter =
    activeTab === "marketplace"
      ? marketplaceSeriesFilter
      : activeTab === "installed"
        ? installedSeriesFilter
        : null
  const activeFilterCount =
    (installedSearchQuery.trim() ? 1 : 0) +
    (activeFilter !== "all" ? 1 : 0) +
    (installedCategoryFilter || installedSeriesFilter ? 1 : 0)

  const marketplaceFilterCount =
    (marketplaceSearchQuery.trim() ? 1 : 0) +
    (marketplaceFilter !== "all" ? 1 : 0) +
    (marketplaceCategoryFilter || marketplaceSeriesFilter ? 1 : 0)
  const visibleInstallListInstalledCount = filteredInstallListApps.filter(
    (app) => app.installed,
  ).length
  const visibleInstallListPendingCount =
    filteredInstallListApps.length - visibleInstallListInstalledCount
  const caps = result?.platformCapabilities
  const errorMessage = error ? localizeError(t, error) : ""
  const updatesErrorMessage = updatesError ? localizeError(t, updatesError) : ""
  const updatesWarningMessage = updatesWarning ? localizeError(t, updatesWarning) : ""

  return {
    apps,
    loading,
    scanProgress: inventoryProgress ?? scanProgress,
    error: errorMessage,
    searchQuery: activeSearchQuery,
    activeFilter,
    marketplaceFilter,
    categoryFilter: activeCategoryFilter,
    seriesFilter: activeSeriesFilter,
    sorting,
    scanned,
    result,
    confirmDialog,
    lastScanTime,
    lastUpdateCheck,
    viewMode,
    selectedItem,
    installedFilterPanelOpen,
    marketplaceFilterPanelOpen,
    selectedAppIds,
    batchMode,
    batchProgress,
    batchResults,
    batchConfirmDialog,
    installListApps,
    installStates,
    installConfirmDialog,
    authorizeConfirmDialog,
    selectedInstallIds,
    selectedInstallableCount,
    selectedMarketplaceUninstallableCount,
    installBatchMode,
    installDetailItem,
    activeTab,
    updates,
    updatesLoading,
    updatesError: updatesErrorMessage,
    updatesWarning: updatesWarningMessage,
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
    clearUpdatesWarning,
    setSearchQuery,
    setActiveFilter,
    setMarketplaceFilter,
    setCategoryFilter,
    setSeriesFilter,
    setSorting,
    scanApps,
    cancelInventoryScan,
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
    setInstalledFilterPanelOpen,
    setMarketplaceFilterPanelOpen,
    doInstall,
    openInstallConfirmDialog,
    closeConfirmDialog,
    closeInstallConfirmDialog,
    closeAuthorizeConfirmDialog,
    launchApp,
    revealApp,
    openExternal,
    copyText,
    handleLaunch,
    handleReveal,
    handleAuthorizeFromColumn,
    handleAuthorizeConfirm,
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
    cancelBatch: cancelBatchAll,
    handleDetailUpgrade,
    handleDetailUninstall,
    setInstallBatchMode,
    setInstallDetailItem,
  }
}
