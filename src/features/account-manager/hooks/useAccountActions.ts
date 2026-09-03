/**
 * Account actions hook / 账号动作编排: CRUD + 登录 + 代理开关 + 快速登录.
 * 错误统一经 `parseCommandError` 分类（A1-4）：INVALID_INPUT 走输入级 toast，
 * 系统错误写入账号区域错误条（A1-1）。
 */
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  accountManagerUseCases,
  isInvalidInput,
  openLoginWebview,
} from "@/features/account-manager/services/account-manager.use-cases"
import { makeRegionError } from "@/features/account-manager/errors"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useQuickLoginHistory } from "@/features/account-manager/hooks/useQuickLoginHistory"
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync"
import type { StationAccount } from "@/lib/tauri/types/account-manager"
import { translateError } from "@/lib/tauri/errors"

function translateInvalidInput(
  t: ReturnType<typeof useTranslation>["t"],
  error: unknown,
  fallbackKey: string,
): string {
  return translateError(t, error, t(fallbackKey))
}

export function useAccountActions({
  loadInitialData,
}: {
  /** 账号区域 CRUD 失败后的重试入口：复用既有全量刷新。 */
  loadInitialData: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { pending: quickLoginPending, run: runQuickLogin } = useGuardedAsync()
  const { pending: deletingAccountPending, run: runDeleteAccount } = useGuardedAsync()
  const { pendingKeys: togglingProxyIds, run: runToggleProxy } = useGuardedAsyncSet<string>()
  const { pushQuickLoginHistory } = useQuickLoginHistory()

  const retryViaReload = () => {
    void loadInitialData()
  }

  function handleQuickLogin(
    url: string,
    username: string,
    destroyOnClose: boolean,
    stationId?: string | null,
  ) {
    return runQuickLogin(async () => {
      if (!url.trim() || !username.trim()) return
      try {
        const { account, normalized } = await accountManagerUseCases.quickLogin(
          url,
          username,
          stationId,
        )
        const s = useAccountManagerStore.getState()
        s.setAccounts((prev) => [...prev, account])
        pushQuickLoginHistory(normalized)
        s.setQuickLoginOpen(false)

        if (destroyOnClose) {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow")
          const ww = await WebviewWindow.getByLabel(`relay-login-${account.id}`)
          if (ww) {
            const unlisten = await ww.onCloseRequested(async () => {
              unlisten()
              s.setAccounts((prev) => prev.filter((a) => a.id !== account.id))
              try {
                await accountManagerUseCases.deleteAccount(account.id)
              } catch {
                /* ignore */
              }
            })
          }
        }

        toast.success(t("accountManager.sessionManager.quickLogin.startedToast"))
      } catch (error) {
        toast.error(
          translateError(t, error, t("accountManager.sessionManager.quickLogin.failedToast")),
        )
      }
    })
  }

  function handleAddAccount(username: string, password: string, notes: string) {
    return (async () => {
      const s = useAccountManagerStore.getState()
      const station = s.stations.find((item) => item.id === s.selectedStationId)
      if (!station) return false
      if (accountManagerUseCases.hasDuplicateUsername(s.accounts, station.id, username)) {
        toast.error(t("accountManager.toasts.duplicateUsername"))
        return false
      }
      try {
        const account = await accountManagerUseCases.addAccount(
          station.id,
          username,
          password,
          notes,
        )
        const current = useAccountManagerStore.getState()
        current.setAccounts((prev) => [...prev, account])
        current.setSelectedAccountId(account.id)
        current.setAddAccountOpen(false)
        current.setRegionError("account", null)
        return true
      } catch (error) {
        if (isInvalidInput(error)) {
          toast.error(translateInvalidInput(t, error, "accountManager.toasts.createAccountFailed"))
        } else {
          useAccountManagerStore.getState().setRegionError(
            "account",
            makeRegionError(error, "accountManager.errors.accountAction", {
              retry: retryViaReload,
            }),
          )
        }
        return false
      }
    })()
  }

  function handleEditAccount(
    username: string,
    notes: string,
    password: string | null,
    proxyEnabled: boolean,
  ) {
    return (async () => {
      const s = useAccountManagerStore.getState()
      const editingAccount = s.editingAccount
      if (!editingAccount) return false
      if (
        accountManagerUseCases.hasDuplicateUsername(
          s.accounts,
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
        const current = useAccountManagerStore.getState()
        current.setAccounts((prev) =>
          prev.map((account) => (account.id === result.updated.id ? result.updated : account)),
        )
        current.setEditAccountOpen(false)
        current.setEditingAccount(null)
        if (result.passwordFailed) {
          toast.error(t("accountManager.toasts.updatePasswordFailed"))
          return false
        }
        if (result.proxyFailed) {
          toast.error(t("accountManager.toasts.updateProxyFailed"))
          return false
        }
        current.setRegionError("account", null)
        return true
      } catch (error) {
        if (isInvalidInput(error)) {
          toast.error(translateInvalidInput(t, error, "accountManager.toasts.updateAccountFailed"))
        } else {
          useAccountManagerStore.getState().setRegionError(
            "account",
            makeRegionError(error, "accountManager.errors.accountAction", {
              retry: retryViaReload,
            }),
          )
        }
        return false
      }
    })()
  }

  function handleDeleteAccount() {
    return runDeleteAccount(async () => {
      const s0 = useAccountManagerStore.getState()
      const target = s0.deletingAccount
      if (!target) return
      const { wasSelected, nextAccountId } = accountManagerUseCases.buildAccountDeleteSelection(
        s0.accounts,
        target,
        s0.selectedAccountId,
      )
      try {
        const report = await accountManagerUseCases.deleteAccount(target.id)
        const s = useAccountManagerStore.getState()
        if (!report.metadataDeleted) {
          const failed = report.resources.filter((resource) => resource.status === "failed").length
          s.setDeleteAccountOpen(false)
          s.setDeletingAccount(null)
          toast.warning(t("accountManager.toasts.deleteCleanupPartial", { failed }))
          return
        }
        s.setAccounts((prev) => prev.filter((account) => account.id !== target.id))
        if (wasSelected) {
          s.setSelectedAccountId(nextAccountId)
        }
        s.setDeleteAccountOpen(false)
        s.setDeletingAccount(null)
        s.setRegionError("account", null)
        toast.success(t("accountManager.toasts.deleteAccountSuccess", { name: target.username }))
      } catch (error) {
        if (isInvalidInput(error)) {
          toast.error(translateInvalidInput(t, error, "accountManager.toasts.deleteAccountFailed"))
        } else {
          useAccountManagerStore.getState().setRegionError(
            "account",
            makeRegionError(error, "accountManager.errors.accountAction", {
              retry: retryViaReload,
            }),
          )
        }
      }
    })
  }

  function handleLogin(account: StationAccount) {
    return (async () => {
      const station = useAccountManagerStore
        .getState()
        .stations.find((item) => item.id === account.stationId)
      if (!station) return
      const setOpeningAccountId = useAccountManagerStore.getState().setOpeningAccountId
      setOpeningAccountId(account.id)
      try {
        await openLoginWebview(account, station.website)
      } catch (error) {
        toast.error(translateError(t, error, t("accountManager.toasts.openLoginFailed")))
      } finally {
        setOpeningAccountId((current) => (current === account.id ? null : current))
      }
    })()
  }

  function handleToggleProxy(accountId: string, enabled: boolean) {
    return runToggleProxy(accountId, async () => {
      try {
        const updated = await accountManagerUseCases.toggleProxy(accountId, enabled)
        useAccountManagerStore
          .getState()
          .setAccounts((prev) =>
            prev.map((account) => (account.id === updated.id ? updated : account)),
          )
        toast.success(t("accountManager.toasts.updateProxySuccess"))
        useAccountManagerStore.getState().setRegionError("account", null)
      } catch (error) {
        useAccountManagerStore.getState().setRegionError(
          "account",
          makeRegionError(error, "accountManager.errors.accountAction", {
            retry: () => handleToggleProxy(accountId, enabled),
          }),
        )
      }
    })
  }

  function handleReorderAccounts(orderedIds: string[]) {
    return (async () => {
      const s = useAccountManagerStore.getState()
      const stationId = s.selectedStationId
      if (!stationId) return
      const prev = s.accounts
      const built = accountManagerUseCases.buildOptimisticAccountOrder(prev, stationId, orderedIds)
      if (built.mismatch) {
        toast.error(t("accountManager.toasts.reorderMismatch"))
        return
      }
      s.setAccounts(built.optimistic)
      s.setReorderingAccounts(true)
      try {
        const serverMine = await accountManagerUseCases.reorderAccounts(stationId, orderedIds)
        let serverIter = 0
        useAccountManagerStore
          .getState()
          .setAccounts((current) =>
            current.map((account) =>
              account.stationId === stationId ? serverMine[serverIter++] : account,
            ),
          )
        toast.success(t("accountManager.toasts.reorderAccountsSuccess"))
        useAccountManagerStore.getState().setRegionError("account", null)
      } catch (error) {
        useAccountManagerStore.getState().setAccounts(prev)
        if (isInvalidInput(error)) {
          toast.error(t("accountManager.toasts.reorderAccountsFailed"))
          try {
            const [, , loadedAccounts] = await accountManagerUseCases.loadInitialData()
            useAccountManagerStore.getState().setAccounts(loadedAccounts)
          } catch {
            /* ignore */
          }
        } else {
          useAccountManagerStore.getState().setRegionError(
            "account",
            makeRegionError(error, "accountManager.errors.accountAction", {
              retry: retryViaReload,
            }),
          )
        }
      } finally {
        useAccountManagerStore.getState().setReorderingAccounts(false)
      }
    })()
  }

  const handleRevealPassword = (accountId: string) =>
    accountManagerUseCases.revealPassword(accountId)

  const handleCopyPassword = (accountId: string) => accountManagerUseCases.copyPassword(accountId)

  return {
    quickLoginPending,
    deletingAccountPending,
    togglingProxyIds,
    handleQuickLogin,
    handleAddAccount,
    handleEditAccount,
    handleDeleteAccount,
    handleLogin,
    handleToggleProxy,
    handleRevealPassword,
    handleCopyPassword,
    handleReorderAccounts,
  }
}
