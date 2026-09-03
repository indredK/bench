/**
 * account-manager controller / 账号管理控制器: wires store, use-cases, and sub-hooks.
 * (A1-3 拆分：站点 CRUD → useStationActions，账号 CRUD → useAccountActions，
 * 刷新编排 → useRefreshOrchestrator，导入导出 → useDataPorting，Deep Link/Auth Proxy → useAuthProxy。
 * 对 page.tsx 的返回接口保持不变，仅新增区域错误出口 regionErrors/retryRegion/dismissRegionError。)
 */
import { useCallback, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/react/shallow"
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
import { useQuickLoginHistory } from "@/features/account-manager/hooks/useQuickLoginHistory"
import { useRefreshOrchestrator } from "@/features/account-manager/hooks/useRefreshOrchestrator"
import { useStationActions } from "@/features/account-manager/hooks/useStationActions"
import type { AccountManagerRegion } from "@/features/account-manager/errors"
import { translateError } from "@/lib/tauri/errors"

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
    regionErrors,
    setSelectedAccountId,
    setAddStationOpen,
    setAddAccountOpen,
    setQuickLoginOpen,
    setExternalAppsOpen,
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
      regionErrors: s.regionErrors,
      setSelectedAccountId: s.setSelectedAccountId,
      setAddStationOpen: s.setAddStationOpen,
      setAddAccountOpen: s.setAddAccountOpen,
      setQuickLoginOpen: s.setQuickLoginOpen,
      setExternalAppsOpen: s.setExternalAppsOpen,
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

  const refresh = useRefreshOrchestrator()
  const stationActions = useStationActions({ loadInitialData })
  const accountActions = useAccountActions({ loadInitialData })
  const dataPorting = useDataPorting()
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

  const authProxy = useAuthProxy()

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
    isExternalAppsOpen,
    setExternalAppsOpen,
    externalAppsAccountId,
    handleOpenExternalApps,
    regionErrors,
    retryRegion,
    dismissRegionError,
    ...authProxy,
    readQuickLoginHistory,
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
