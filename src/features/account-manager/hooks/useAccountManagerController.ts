/**
 * account-manager controller / 账号管理控制器: wires store, use-cases, and sub-hooks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/react/shallow"
import { toast } from "sonner"
import { classifyAccountManagerError } from "@/features/account-manager/error-classifier"
import {
  accountManagerUseCases,
  isInvalidInput,
  openLoginWebview,
} from "@/features/account-manager/services/account-manager.use-cases"
import {
  selectAccountCountByStation,
  selectSelectedAccount,
  selectStation as selectStationById,
  selectStationAccounts,
} from "@/features/account-manager/model/selectors"
import type { SessionSettings } from "@/features/account-manager/model/types"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useAuthProxy } from "@/features/account-manager/hooks/useAuthProxy"
import { useQuickLoginHistory } from "@/features/account-manager/hooks/useQuickLoginHistory"
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync"
import type { ProbeStrategy, StationAccount } from "@/lib/tauri/types/account-manager"

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
    setStations,
    setAccounts,
    setSelectedStationId,
    setSelectedAccountId,
    setAddStationOpen,
    setAddAccountOpen,
    setQuickLoginOpen,
    setOpeningAccountId,
    setExternalAppsOpen,
    setExportingData,
    setImportingData,
    setEditStationOpen,
    setEditingStation,
    setEditAccountOpen,
    setEditingAccount,
    setDeleteStationOpen,
    setDeletingStation,
    setDeleteAccountOpen,
    setDeletingAccount,
    setReorderingStations,
    setReorderingAccounts,
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
      setStations: s.setStations,
      setAccounts: s.setAccounts,
      setSelectedStationId: s.setSelectedStationId,
      setSelectedAccountId: s.setSelectedAccountId,
      setAddStationOpen: s.setAddStationOpen,
      setAddAccountOpen: s.setAddAccountOpen,
      setQuickLoginOpen: s.setQuickLoginOpen,
      setOpeningAccountId: s.setOpeningAccountId,
      setExternalAppsOpen: s.setExternalAppsOpen,
      setExportingData: s.setExportingData,
      setImportingData: s.setImportingData,
      setEditStationOpen: s.setEditStationOpen,
      setEditingStation: s.setEditingStation,
      setEditAccountOpen: s.setEditAccountOpen,
      setEditingAccount: s.setEditingAccount,
      setDeleteStationOpen: s.setDeleteStationOpen,
      setDeletingStation: s.setDeletingStation,
      setDeleteAccountOpen: s.setDeleteAccountOpen,
      setDeletingAccount: s.setDeletingAccount,
      setReorderingStations: s.setReorderingStations,
      setReorderingAccounts: s.setReorderingAccounts,
    })),
  )
  const { pendingKeys: refreshingAccountIds, run: runAccountRefresh } = useGuardedAsyncSet<string>()
  const { pendingKeys: refreshingStationIds, run: runStationRefresh } = useGuardedAsyncSet<string>()
  const { pending: refreshingAll, run: runAllRefresh } = useGuardedAsync()
  const { pending: quickLoginPending, run: runQuickLogin } = useGuardedAsync()
  const { pending: deletingStationPending, run: runDeleteStation } = useGuardedAsync()
  const { pending: deletingAccountPending, run: runDeleteAccount } = useGuardedAsync()
  const { pendingKeys: togglingProxyIds, run: runToggleProxy } = useGuardedAsyncSet<string>()
  const { pendingKeys: redetectingStationIds, run: runRedetectProfile } =
    useGuardedAsyncSet<string>()
  const { pendingKeys: settingProbeStrategyIds, run: runProbeStrategyChange } =
    useGuardedAsyncSet<string>()

  const [justRefreshedIds, setJustRefreshedIds] = useState<Set<string>>(new Set())
  const justRefreshedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const markJustRefreshed = useCallback((accountId: string) => {
    setJustRefreshedIds((prev) => {
      const next = new Set(prev)
      next.add(accountId)
      return next
    })
    const existing = justRefreshedTimersRef.current.get(accountId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      setJustRefreshedIds((prev) => {
        const next = new Set(prev)
        next.delete(accountId)
        return next
      })
      justRefreshedTimersRef.current.delete(accountId)
    }, 1500)
    justRefreshedTimersRef.current.set(accountId, timer)
  }, [])

  useEffect(() => {
    return () => {
      justRefreshedTimersRef.current.forEach((timer) => clearTimeout(timer))
      justRefreshedTimersRef.current.clear()
    }
  }, [])

  const authProxy = useAuthProxy()
  const { readQuickLoginHistory, pushQuickLoginHistory } = useQuickLoginHistory()

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
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.initFailed"))
      useAccountManagerStore.getState().setLoadError(info.message)
      throw error
    } finally {
      useAccountManagerStore.getState().setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadInitialData().catch(() => undefined)
  }, [loadInitialData])

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

  const handleAddStation = async (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings,
  ) => {
    try {
      const station = await accountManagerUseCases.addStation(remark, website, sessionSettings)
      setStations((prev) => [...prev, station])
      setSelectedStationId(station.id)
      setSelectedAccountId("")
      setAddStationOpen(false)
      return true
    } catch {
      toast.error(t("accountManager.toasts.createStationFailed"))
      return false
    }
  }

  const handleQuickLogin = (
    url: string,
    username: string,
    destroyOnClose: boolean,
    stationId?: string | null,
  ) =>
    runQuickLogin(async () => {
      if (!url.trim() || !username.trim()) return
      try {
        const { account, normalized } = await accountManagerUseCases.quickLogin(
          url,
          username,
          stationId,
        )
        setAccounts((prev) => [...prev, account])
        pushQuickLoginHistory(normalized)
        setQuickLoginOpen(false)

        if (destroyOnClose) {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow")
          const ww = await WebviewWindow.getByLabel(`relay-login-${account.id}`)
          if (ww) {
            const unlisten = await ww.onCloseRequested(async () => {
              unlisten()
              setAccounts((prev) => prev.filter((a) => a.id !== account.id))
              try {
                await accountManagerUseCases.deleteAccount(account.id)
              } catch {
                /* ignore */
              }
            })
          }
        }

        toast.success(t("accountManager.sessionManager.quickLogin.startedToast"))
      } catch {
        toast.error(t("accountManager.sessionManager.quickLogin.failedToast"))
      }
    })

  const handleRedetectProfile = (stationId: string, accountId?: string) =>
    runRedetectProfile(stationId, async () => {
      try {
        const profile = await accountManagerUseCases.redetectAuthProfile(stationId, accountId)
        setStations((prev) =>
          prev.map((station) =>
            station.id === stationId ? { ...station, authProfile: profile } : station,
          ),
        )
        toast.success(t("accountManager.sessionManager.authProfile.redetectSuccess"))
      } catch {
        toast.error(t("accountManager.sessionManager.authProfile.redetectFailed"))
      }
    })

  const handleAddAccount = async (username: string, password: string, notes: string) => {
    if (!selectedStation) return false
    if (accountManagerUseCases.hasDuplicateUsername(accounts, selectedStation.id, username)) {
      toast.error(t("accountManager.toasts.duplicateUsername"))
      return false
    }
    try {
      const account = await accountManagerUseCases.addAccount(
        selectedStation.id,
        username,
        password,
        notes,
      )
      setAccounts((prev) => [...prev, account])
      setSelectedAccountId(account.id)
      setAddAccountOpen(false)
      return true
    } catch {
      toast.error(t("accountManager.toasts.createAccountFailed"))
      return false
    }
  }

  const handleLogin = async (account: StationAccount) => {
    if (!selectedStation) return
    setOpeningAccountId(account.id)
    try {
      await openLoginWebview(account, selectedStation.website)
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.openLoginFailed"))
      toast.error(info.message)
    } finally {
      setOpeningAccountId((current) => (current === account.id ? null : current))
    }
  }

  const handleSelectStation = (id: string) => {
    useAccountManagerStore.getState().selectStation(id, accounts)
  }

  const handleRefreshAccount = (account: StationAccount) =>
    runAccountRefresh(account.id, async () => {
      try {
        const updated = await accountManagerUseCases.refreshAccount(account.id)
        setAccounts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        markJustRefreshed(updated.id)
        if (updated.status === "fetchFailed") {
          toast.warning(
            t("accountManager.toasts.refreshAccountFetchFailed", { name: updated.username }),
          )
        } else {
          toast.success(
            t("accountManager.toasts.refreshAccountSuccess", { name: updated.username }),
          )
        }
      } catch (error) {
        const info = classifyAccountManagerError(
          error,
          t("accountManager.toasts.refreshAccountFailed"),
        )
        toast.error(t(`accountManager.toasts.${info.kind}`))
      }
    })

  const handleRefreshStation = (stationId: string) => {
    if (!stationId) return
    return runStationRefresh(stationId, async () => {
      try {
        const report = await accountManagerUseCases.refreshStation(stationId)
        const byId = new Map(report.succeeded.map((account) => [account.id, account] as const))
        setAccounts((prev) => prev.map((account) => byId.get(account.id) ?? account))
        report.succeeded.forEach((account) => markJustRefreshed(account.id))
        const failed = report.failed.length
        if (failed > 0) {
          toast.warning(
            t("accountManager.toasts.refreshBatchFetchFailed", {
              failed,
              total: report.total,
            }),
          )
        } else {
          toast.success(
            t("accountManager.toasts.refreshStationSuccess", { count: report.succeeded.length }),
          )
        }
      } catch (error) {
        const info = classifyAccountManagerError(
          error,
          t("accountManager.toasts.refreshStationFailed"),
        )
        toast.error(t(`accountManager.toasts.${info.kind}`))
      }
    })
  }

  const handleRefreshAll = () =>
    runAllRefresh(async () => {
      try {
        const report = await accountManagerUseCases.refreshAll()
        const byId = new Map(report.succeeded.map((account) => [account.id, account] as const))
        setAccounts((prev) => prev.map((account) => byId.get(account.id) ?? account))
        report.succeeded.forEach((account) => markJustRefreshed(account.id))
        const failed = report.failed.length
        if (failed > 0) {
          toast.warning(
            t("accountManager.toasts.refreshBatchFetchFailed", { failed, total: report.total }),
          )
        } else {
          toast.success(
            t("accountManager.toasts.refreshAllSuccess", { count: report.succeeded.length }),
          )
        }
      } catch (error) {
        const info = classifyAccountManagerError(error, t("accountManager.toasts.refreshAllFailed"))
        toast.error(t(`accountManager.toasts.${info.kind}`))
      }
    })

  const handleToggleProxy = (accountId: string, enabled: boolean) =>
    runToggleProxy(accountId, async () => {
      try {
        const updated = await accountManagerUseCases.toggleProxy(accountId, enabled)
        setAccounts((prev) =>
          prev.map((account) => (account.id === updated.id ? updated : account)),
        )
        toast.success(t("accountManager.toasts.updateProxySuccess"))
      } catch {
        toast.error(t("accountManager.toasts.updateProxyFailed"))
      }
    })

  const handleRevealPassword = (accountId: string) =>
    accountManagerUseCases.revealPassword(accountId)

  const handleCopyPassword = (accountId: string) => accountManagerUseCases.copyPassword(accountId)

  const handleProbeStrategyChange = (stationId: string, next: ProbeStrategy | "auto") =>
    runProbeStrategyChange(stationId, async () => {
      try {
        const updated = await accountManagerUseCases.changeProbeStrategy(stationId, next)
        setStations((prev) =>
          prev.map((station) => (station.id === stationId ? { ...station, ...updated } : station)),
        )
      } catch {
        toast.error(t("accountManager.toasts.updateProbeStrategyFailed"))
      }
    })

  const handleExportData = async () => {
    if (exportingData) return
    setExportingData(true)
    try {
      const result = await accountManagerUseCases.exportData()
      if (!result) return
      toast.success(
        t("accountManager.toasts.exportSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        }),
      )
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.exportFailed"))
      toast.error(t(`accountManager.toasts.${info.kind}`, { defaultValue: info.message }))
    } finally {
      setExportingData(false)
    }
  }

  const handleImportData = async () => {
    if (importingData) return
    setImportingData(true)
    try {
      const result = await accountManagerUseCases.importData()
      if (!result) return
      setStations(result.stations)
      setAccounts(result.accounts)
      const { stationId, accountId } = accountManagerUseCases.resolveImportSelection(
        result,
        selectedStationId,
        selectedAccountId,
      )
      setSelectedStationId(stationId)
      setSelectedAccountId(accountId)
      toast.success(
        t("accountManager.toasts.importSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        }),
      )
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.importFailed"))
      toast.error(t(`accountManager.toasts.${info.kind}`, { defaultValue: info.message }))
    } finally {
      setImportingData(false)
    }
  }

  const handleEditStation = async (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings,
  ) => {
    if (!editingStation) return false
    try {
      const updated = await accountManagerUseCases.editStation(
        editingStation,
        remark,
        website,
        sessionSettings,
      )
      setStations((prev) => prev.map((station) => (station.id === updated.id ? updated : station)))
      setEditStationOpen(false)
      setEditingStation(null)
      return true
    } catch {
      toast.error(t("accountManager.toasts.updateStationFailed"))
      return false
    }
  }

  const handleEditAccount = async (
    username: string,
    notes: string,
    password: string | null,
    proxyEnabled: boolean,
  ) => {
    if (!editingAccount) return false
    if (
      accountManagerUseCases.hasDuplicateUsername(
        accounts,
        editingAccount.stationId,
        username,
        editingAccount.id,
      )
    ) {
      toast.error(t("accountManager.toasts.duplicateUsername"))
      return false
    }
    try {
      const result = await accountManagerUseCases.editAccount(
        editingAccount,
        username,
        notes,
        password,
        proxyEnabled,
      )
      setAccounts((prev) =>
        prev.map((account) => (account.id === result.updated.id ? result.updated : account)),
      )
      setEditAccountOpen(false)
      setEditingAccount(null)
      if (result.passwordFailed) {
        toast.error(t("accountManager.toasts.updatePasswordFailed"))
        return false
      }
      if (result.proxyFailed) {
        toast.error(t("accountManager.toasts.updateProxyFailed"))
        return false
      }
      return true
    } catch {
      toast.error(t("accountManager.toasts.updateAccountFailed"))
      return false
    }
  }

  const handleDeleteStation = () =>
    runDeleteStation(async () => {
      if (!deletingStation) return
      const target = deletingStation
      const { wasSelected, newStationId, newAccountId } =
        accountManagerUseCases.buildStationDeleteSelection(
          stations,
          accounts,
          target,
          selectedStationId,
          selectedAccountId,
        )
      try {
        const report = await accountManagerUseCases.deleteStation(target.id)
        if (!report.metadataDeleted) {
          const failed = report.resources.filter((resource) => resource.status === "failed").length
          setDeleteStationOpen(false)
          setDeletingStation(null)
          toast.warning(t("accountManager.toasts.deleteCleanupPartial", { failed }))
          return
        }
        setStations((prev) => prev.filter((station) => station.id !== target.id))
        setAccounts((prev) => prev.filter((account) => account.stationId !== target.id))
        if (wasSelected) {
          setSelectedStationId(newStationId)
          setSelectedAccountId(newAccountId)
        }
        setDeleteStationOpen(false)
        setDeletingStation(null)
        toast.success(t("accountManager.toasts.deleteStationSuccess", { name: target.remark }))
      } catch {
        toast.error(t("accountManager.toasts.deleteStationFailed"))
      }
    })

  const handleDeleteAccount = () =>
    runDeleteAccount(async () => {
      if (!deletingAccount) return
      const target = deletingAccount
      const { wasSelected, nextAccountId } = accountManagerUseCases.buildAccountDeleteSelection(
        accounts,
        target,
        selectedAccountId,
      )
      try {
        const report = await accountManagerUseCases.deleteAccount(target.id)
        if (!report.metadataDeleted) {
          const failed = report.resources.filter((resource) => resource.status === "failed").length
          setDeleteAccountOpen(false)
          setDeletingAccount(null)
          toast.warning(t("accountManager.toasts.deleteCleanupPartial", { failed }))
          return
        }
        setAccounts((prev) => prev.filter((account) => account.id !== target.id))
        if (wasSelected) {
          setSelectedAccountId(nextAccountId)
        }
        setDeleteAccountOpen(false)
        setDeletingAccount(null)
        toast.success(t("accountManager.toasts.deleteAccountSuccess", { name: target.username }))
      } catch {
        toast.error(t("accountManager.toasts.deleteAccountFailed"))
      }
    })

  const handleReorderStations = async (orderedIds: string[]) => {
    const prev = stations
    const { next, mismatch } = accountManagerUseCases.buildOptimisticStationOrder(prev, orderedIds)
    if (mismatch) {
      toast.error(t("accountManager.toasts.reorderMismatch"))
      return
    }
    setStations(next)
    setReorderingStations(true)
    try {
      const server = await accountManagerUseCases.reorderStations(orderedIds)
      setStations(server)
      toast.success(t("accountManager.toasts.reorderStationsSuccess"))
    } catch (error) {
      setStations(prev)
      toast.error(t("accountManager.toasts.reorderStationsFailed"))
      if (isInvalidInput(error)) {
        try {
          setStations(await accountManagerUseCases.loadInitialData().then(([, s]) => s))
        } catch {
          /* ignore */
        }
      }
    } finally {
      setReorderingStations(false)
    }
  }

  const handleReorderAccounts = async (orderedIds: string[]) => {
    if (!selectedStationId) return
    const stationId = selectedStationId
    const prev = accounts
    const built = accountManagerUseCases.buildOptimisticAccountOrder(prev, stationId, orderedIds)
    if (built.mismatch) {
      toast.error(t("accountManager.toasts.reorderMismatch"))
      return
    }
    setAccounts(built.optimistic)
    setReorderingAccounts(true)
    try {
      const serverMine = await accountManagerUseCases.reorderAccounts(stationId, orderedIds)
      let serverIter = 0
      setAccounts((current) =>
        current.map((account) =>
          account.stationId === stationId ? serverMine[serverIter++] : account,
        ),
      )
      toast.success(t("accountManager.toasts.reorderAccountsSuccess"))
    } catch (error) {
      setAccounts(prev)
      toast.error(t("accountManager.toasts.reorderAccountsFailed"))
      if (isInvalidInput(error)) {
        try {
          const [, , loadedAccounts] = await accountManagerUseCases.loadInitialData()
          setAccounts(loadedAccounts)
        } catch {
          /* ignore */
        }
      }
    } finally {
      setReorderingAccounts(false)
    }
  }

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
    refreshingAccountIds,
    refreshingStationIds,
    refreshingAll,
    justRefreshedIds,
    importingData,
    exportingData,
    reorderingStations,
    reorderingAccounts,
    quickLoginPending,
    deletingStationPending,
    deletingAccountPending,
    togglingProxyIds,
    redetectingStationIds,
    settingProbeStrategyIds,
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
    ...authProxy,
    readQuickLoginHistory,
    handleAddStation,
    handleQuickLogin,
    handleRedetectProfile,
    handleAddAccount,
    handleLogin,
    handleSelectStation,
    handleRefreshAccount,
    handleRefreshStation,
    handleRefreshAll,
    handleToggleProxy,
    handleRevealPassword,
    handleCopyPassword,
    handleProbeStrategyChange,
    handleExportData,
    handleImportData,
    handleEditStation,
    handleEditAccount,
    handleDeleteStation,
    handleDeleteAccount,
    handleReorderStations,
    handleReorderAccounts,
  }
}
