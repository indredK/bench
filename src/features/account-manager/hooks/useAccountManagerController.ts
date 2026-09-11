/**
 * account-manager controller / 账号管理控制器: wires store, use-cases, and sub-hooks.
 * (A1-3 拆分：站点 CRUD → useStationActions，账号 CRUD → useAccountActions，
 * 刷新编排 → useRefreshOrchestrator，导入导出 → useDataPorting，Deep Link/Auth Proxy → useAuthProxy。
 * 对 page.tsx 的返回接口保持不变，仅新增区域错误出口 regionErrors/retryRegion/dismissRegionError。)
 */
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/react/shallow"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import {
  selectAccountCountByStation,
  selectSelectedAccount,
  selectStation as selectStationById,
  selectStationAccounts,
} from "@/features/account-manager/model/selectors"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useAuthProxy } from "@/features/account-manager/hooks/useAuthProxy"
import { useAccountActions } from "@/features/account-manager/hooks/useAccountActions"
import { useDataPorting } from "@/features/account-manager/hooks/useDataPorting"
import { useFingerprint } from "@/features/account-manager/hooks/useFingerprint"
import { useQuickLoginHistory } from "@/features/account-manager/hooks/useQuickLoginHistory"
import { useRefreshOrchestrator } from "@/features/account-manager/hooks/useRefreshOrchestrator"
import { useSessionKeeper } from "@/features/account-manager/hooks/useSessionKeeper"
import { useStationActions } from "@/features/account-manager/hooks/useStationActions"
import type { AccountManagerRegion } from "@/features/account-manager/errors"
import { TAURI_EVENTS, type StoreChangedEventPayload } from "@/lib/tauri/contracts"
import { translateError } from "@/lib/tauri/errors"
import { listenToPlatformEvent } from "@/platform/events"

export function useAccountManagerController() {
  const { t } = useTranslation()
  const {
    stations,
    accounts,
    loading,
    loadError,
    capabilities,
    selectedStationId,
    selectedAccountId,
    openingAccountId,
    importingData,
    exportingData,
    reorderingStations,
    reorderingAccounts,
    isAddStationOpen,
    isAddAccountOpen,
    isEditStationOpen,
    editingStation,
    isEditAccountOpen,
    editingAccount,
    isDeleteStationOpen,
    deletingStation,
    isDeleteAccountOpen,
    deletingAccount,
    isQuickLoginOpen,
    isExternalAppsOpen,
    externalAppsAccountId,
    isFingerprintConfirmOpen,
    fingerprintSummary,
    fingerprintTarget,
    isFingerprintDetailOpen,
    fingerprintDetail,
    regionErrors,
    setSelectedAccountId,
    setAddStationOpen,
    setAddAccountOpen,
    setQuickLoginOpen,
    setExternalAppsOpen,
    setFingerprintConfirmOpen,
    setFingerprintDetailOpen,
    setEditStationOpen,
    setEditingStation,
    setEditAccountOpen,
    setEditingAccount,
    setDeleteStationOpen,
    setDeletingStation,
    setDeleteAccountOpen,
    setDeletingAccount,
  } = useAccountManagerStore(
    useShallow((s) => ({
      stations: s.stations,
      accounts: s.accounts,
      loading: s.loading,
      loadError: s.loadError,
      capabilities: s.capabilities,
      selectedStationId: s.selectedStationId,
      selectedAccountId: s.selectedAccountId,
      openingAccountId: s.openingAccountId,
      importingData: s.importingData,
      exportingData: s.exportingData,
      reorderingStations: s.reorderingStations,
      reorderingAccounts: s.reorderingAccounts,
      isAddStationOpen: s.isAddStationOpen,
      isAddAccountOpen: s.isAddAccountOpen,
      isEditStationOpen: s.isEditStationOpen,
      editingStation: s.editingStation,
      isEditAccountOpen: s.isEditAccountOpen,
      editingAccount: s.editingAccount,
      isDeleteStationOpen: s.isDeleteStationOpen,
      deletingStation: s.deletingStation,
      isDeleteAccountOpen: s.isDeleteAccountOpen,
      deletingAccount: s.deletingAccount,
      isQuickLoginOpen: s.isQuickLoginOpen,
      isExternalAppsOpen: s.isExternalAppsOpen,
      externalAppsAccountId: s.externalAppsAccountId,
      isFingerprintConfirmOpen: s.isFingerprintConfirmOpen,
      fingerprintSummary: s.fingerprintSummary,
      fingerprintTarget: s.fingerprintTarget,
      isFingerprintDetailOpen: s.isFingerprintDetailOpen,
      fingerprintDetail: s.fingerprintDetail,
      regionErrors: s.regionErrors,
      setSelectedAccountId: s.setSelectedAccountId,
      setAddStationOpen: s.setAddStationOpen,
      setAddAccountOpen: s.setAddAccountOpen,
      setQuickLoginOpen: s.setQuickLoginOpen,
      setExternalAppsOpen: s.setExternalAppsOpen,
      setFingerprintConfirmOpen: s.setFingerprintConfirmOpen,
      setFingerprintDetailOpen: s.setFingerprintDetailOpen,
      setEditStationOpen: s.setEditStationOpen,
      setEditingStation: s.setEditingStation,
      setEditAccountOpen: s.setEditAccountOpen,
      setEditingAccount: s.setEditingAccount,
      setDeleteStationOpen: s.setDeleteStationOpen,
      setDeletingStation: s.setDeletingStation,
      setDeleteAccountOpen: s.setDeleteAccountOpen,
      setDeletingAccount: s.setDeletingAccount,
    })),
  )

  const loadInitialData = useCallback(async () => {
    const s = useAccountManagerStore.getState()
    s.setLoading(true)
    s.setLoadError(null)
    try {
      const [loadedCapabilities, loadedStations, loadedAccounts] =
        await accountManagerUseCases.loadInitialData()
      s.setCapabilities(loadedCapabilities)
      s.setStations(loadedStations)
      s.setAccounts(loadedAccounts)
      s.applyInitialSelection(loadedStations, loadedAccounts)
      s.clearRegionErrors()
    } catch (error) {
      useAccountManagerStore
        .getState()
        .setLoadError(translateError(t, error, t("accountManager.toasts.initFailed")))
      throw error
    } finally {
      useAccountManagerStore.getState().setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadInitialData().catch(() => undefined)
  }, [loadInitialData])

  // 外部通道（浏览器扩展桥）写入站点/账号后，后端发 store-changed 事件：
  // ① 重载数据并（在重载完成后）把选中项跳到被写入的站点/账号，
  //    保证「扩展里保存 → 回到 Bench 立刻能看到」；
  // ② 真实保存成功时弹 toast（右下角消息通知），sonner-archive 会自动把该 toast
  //    镜像归档到右上角消息中心「系统通知」，供事后追溯。
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      try {
        const nextUnlisten = await listenToPlatformEvent<StoreChangedEventPayload>(
          TAURI_EVENTS.accountManager.storeChanged,
          (event) => {
            const payload = event.payload
            const reload = loadInitialData().then(() => {
              // 站点可能已被重载覆盖成最新列表，校验存在后再跳选中项。
              const s = useAccountManagerStore.getState()
              if (payload?.stationId && s.stations.some((item) => item.id === payload.stationId)) {
                s.setSelectedStationId(payload.stationId)
                s.setSelectedAccountId(payload.accountId ?? "")
              }
            })
            void reload.catch(() => undefined)
            if (payload?.saved) {
              toast.success(
                t("accountManager.toasts.extensionSaveSuccess", {
                  station: payload.stationRemark,
                  cookieCount: payload.cookieCount,
                }),
              )
            }
          },
        )
        if (cancelled) {
          nextUnlisten()
          return
        }
        unlisten = nextUnlisten
      } catch (error) {
        if (!cancelled) {
          console.warn("[account-manager] store-changed listener failed:", String(error))
        }
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [loadInitialData, t])

  const refresh = useRefreshOrchestrator()
  const stationActions = useStationActions({ loadInitialData })
  const accountActions = useAccountActions({ loadInitialData })
  const dataPorting = useDataPorting()
  const sessionKeeper = useSessionKeeper()
  /** 指纹确认后刷新全组:复用刷新编排(自带 loading),包装为可 await 的 Promise。 */
  const refreshStationForFingerprint = useCallback(
    (stationId: string) => Promise.resolve(refresh.handleRefreshStation(stationId)),
    [refresh],
  )
  const fingerprint = useFingerprint({ refreshStation: refreshStationForFingerprint })
  const { readQuickLoginHistory } = useQuickLoginHistory()

  const selectedStation = useMemo(
    () => selectStationById(stations, selectedStationId),
    [stations, selectedStationId],
  )
  const stationAccounts = useMemo(
    () => selectStationAccounts(accounts, selectedStationId),
    [accounts, selectedStationId],
  )
  const accountCountByStation = useMemo(() => selectAccountCountByStation(accounts), [accounts])
  const selectedAccount = useMemo(
    () => selectSelectedAccount(stationAccounts, selectedAccountId),
    [stationAccounts, selectedAccountId],
  )

  const handleOpenExternalApps = useCallback((accountId: string | null) => {
    const s = useAccountManagerStore.getState()
    s.setExternalAppsAccountId(accountId)
    s.setExternalAppsOpen(true)
  }, [])

  const handleSelectStation = useCallback(
    (id: string) => {
      useAccountManagerStore.getState().selectStation(id, accounts)
    },
    [accounts],
  )

  /** 快速登录对话框:站点 → 账号列表(过滤出 id/username/status 轻量结构)。 */
  const getStationAccountsForQuickLogin = useCallback((stationId: string) => {
    return useAccountManagerStore
      .getState()
      .accounts.filter((account) => account.stationId === stationId)
      .map((account) => ({
        id: account.id,
        username: account.username,
        status: account.status,
        statusReason: account.statusReason ?? null,
      }))
  }, [])

  const authProxy = useAuthProxy()

  /** 快速登录预填 URL：供外部登录引导转发（F1）。 */
  const quickLoginPendingUrlRef = useRef<string>("")

  const handleQuickLoginPrefill = useCallback(
    (url: string) => {
      quickLoginPendingUrlRef.current = url
      useAccountManagerStore.getState().setQuickLoginOpen(true)
      authProxy.setAuthProxyOpen(false)
    },
    [authProxy],
  )

  /** 手动打开快速登录：清空上一次引导转发的预填 URL，避免残留。 */
  const handleOpenQuickLogin = useCallback(() => {
    quickLoginPendingUrlRef.current = ""
    useAccountManagerStore.getState().setQuickLoginOpen(true)
  }, [])

  /** 区域错误条重试入口：执行写入错误时登记的区域级重试函数。 */
  const retryRegion = useCallback((region: AccountManagerRegion) => {
    const payload = useAccountManagerStore.getState().regionErrors[region]
    payload?.retry?.()
  }, [])

  const dismissRegionError = useCallback((region: AccountManagerRegion) => {
    useAccountManagerStore.getState().setRegionError(region, null)
  }, [])

  return {
    stations,
    accounts,
    loading,
    loadError,
    capabilities,
    loadInitialData,
    selectedStation,
    selectedAccount,
    stationAccounts,
    accountCountByStation,
    selectedStationId,
    selectedAccountId,
    setSelectedAccountId,
    openingAccountId,
    refreshingAccountIds: refresh.refreshingAccountIds,
    refreshingStationIds: refresh.refreshingStationIds,
    refreshingAll: refresh.refreshingAll,
    justRefreshedIds: refresh.justRefreshedIds,
    importingData,
    exportingData,
    reorderingStations,
    reorderingAccounts,
    quickLoginPending: accountActions.quickLoginPending,
    deletingStationPending: stationActions.deletingStationPending,
    deletingAccountPending: accountActions.deletingAccountPending,
    togglingProxyIds: accountActions.togglingProxyIds,
    redetectingStationIds: stationActions.redetectingStationIds,
    settingProbeStrategyIds: stationActions.settingProbeStrategyIds,
    isAddStationOpen,
    setAddStationOpen,
    isAddAccountOpen,
    setAddAccountOpen,
    isEditStationOpen,
    setEditStationOpen,
    editingStation,
    setEditingStation,
    isEditAccountOpen,
    setEditAccountOpen,
    editingAccount,
    setEditingAccount,
    isDeleteStationOpen,
    setDeleteStationOpen,
    deletingStation,
    setDeletingStation,
    isDeleteAccountOpen,
    setDeleteAccountOpen,
    deletingAccount,
    setDeletingAccount,
    isQuickLoginOpen,
    setQuickLoginOpen,
    quickLoginPrefillUrl: quickLoginPendingUrlRef.current,
    handleQuickLoginPrefill,
    handleOpenQuickLogin,
    isExternalAppsOpen,
    setExternalAppsOpen,
    externalAppsAccountId,
    handleOpenExternalApps,
    // F2 登录指纹
    isFingerprintConfirmOpen,
    setFingerprintConfirmOpen,
    fingerprintSummary,
    fingerprintTarget,
    isFingerprintDetailOpen,
    setFingerprintDetailOpen,
    fingerprintDetail,
    capturingFingerprint: fingerprint.capturingFingerprint,
    confirmingFingerprint: fingerprint.confirmingFingerprint,
    loadingFingerprintDetail: fingerprint.loadingFingerprintDetail,
    handleCaptureFingerprint: fingerprint.handleCaptureFingerprint,
    handleConfirmFingerprint: fingerprint.handleConfirmFingerprint,
    handleViewFingerprintDetail: fingerprint.handleViewFingerprintDetail,
    regionErrors,
    retryRegion,
    dismissRegionError,
    ...authProxy,
    readQuickLoginHistory,
    sessionKeeper,
    getStationAccountsForQuickLogin,
    handleAddStation: stationActions.handleAddStation,
    handleQuickLogin: accountActions.handleQuickLogin,
    handleRedetectProfile: stationActions.handleRedetectProfile,
    handleAddAccount: accountActions.handleAddAccount,
    handleLogin: accountActions.handleLogin,
    handleSelectStation,
    handleRefreshAccount: refresh.handleRefreshAccount,
    handleRefreshStation: refresh.handleRefreshStation,
    handleRefreshAll: refresh.handleRefreshAll,
    handleToggleProxy: accountActions.handleToggleProxy,
    handleRevealPassword: accountActions.handleRevealPassword,
    handleCopyPassword: accountActions.handleCopyPassword,
    handleProbeStrategyChange: stationActions.handleProbeStrategyChange,
    handleExportData: dataPorting.handleExportData,
    handleImportData: dataPorting.handleImportData,
    handleEditStation: stationActions.handleEditStation,
    handleEditAccount: accountActions.handleEditAccount,
    handleDeleteStation: stationActions.handleDeleteStation,
    handleDeleteAccount: accountActions.handleDeleteAccount,
    handleReorderStations: stationActions.handleReorderStations,
    handleReorderAccounts: accountActions.handleReorderAccounts,
  }
}
