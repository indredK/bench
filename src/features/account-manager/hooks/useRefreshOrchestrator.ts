/**
 * Refresh orchestration hook / 刷新编排:
 *   单账号 / 单站点 / 全部刷新 + justRefreshed 动效 + 区域错误（A1-1/A1-4）。
 *   partial 失败保留旧数据并写入账号区域错误条，支持区域级重试。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { makeRegionError, type AccountManagerRegion } from "@/features/account-manager/errors"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync"
import type { RefreshReport, StationAccount } from "@/lib/tauri/types/account-manager"
import { parseCommandError, translateError } from "@/lib/tauri/errors"

export function useRefreshOrchestrator() {
  const { t } = useTranslation()
  const setAccounts = useAccountManagerStore((s) => s.setAccounts)
  const { pendingKeys: refreshingAccountIds, run: runAccountRefresh } = useGuardedAsyncSet<string>()
  const { pendingKeys: refreshingStationIds, run: runStationRefresh } = useGuardedAsyncSet<string>()
  const { pending: refreshingAll, run: runAllRefresh } = useGuardedAsync()

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

  const writeRegionError = useCallback(
    (
      region: AccountManagerRegion,
      error: unknown,
      fallbackKey: string,
      options?: { values?: Record<string, unknown>; retry?: () => void },
    ) => {
      const { code } = parseCommandError(error)
      if (code === "INVALID_INPUT") {
        toast.error(translateError(t, error, t(fallbackKey, options?.values)))
        return
      }
      useAccountManagerStore
        .getState()
        .setRegionError(region, makeRegionError(error, fallbackKey, options))
    },
    [t],
  )

  const applyReport = useCallback(
    (report: RefreshReport) => {
      const byId = new Map(report.succeeded.map((account) => [account.id, account] as const))
      setAccounts((prev) => prev.map((account) => byId.get(account.id) ?? account))
      report.succeeded.forEach((account) => markJustRefreshed(account.id))
    },
    [markJustRefreshed, setAccounts],
  )

  function handleRefreshAccount(account: StationAccount) {
    return runAccountRefresh(account.id, async () => {
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
        useAccountManagerStore.getState().setRegionError("account", null)
      } catch (error) {
        writeRegionError("account", error, "accountManager.errors.refreshAccount", {
          retry: () => handleRefreshAccount(account),
        })
      }
    })
  }

  function handleRefreshStation(stationId: string) {
    if (!stationId) return
    return runStationRefresh(stationId, async () => {
      try {
        const report = await accountManagerUseCases.refreshStation(stationId)
        applyReport(report)
        const failed = report.failed.length
        if (failed > 0) {
          useAccountManagerStore.getState().setRegionError(
            "account",
            makeRegionError(
              { code: "PARTIAL_REFRESH", message: "" },
              "accountManager.errors.partialRefresh",
              {
                values: { failed, total: report.total },
                retry: () => handleRefreshStation(stationId),
              },
            ),
          )
        } else {
          toast.success(
            t("accountManager.toasts.refreshStationSuccess", { count: report.succeeded.length }),
          )
          useAccountManagerStore.getState().setRegionError("account", null)
        }
      } catch (error) {
        writeRegionError("account", error, "accountManager.errors.refreshAccounts", {
          retry: () => handleRefreshStation(stationId),
        })
      }
    })
  }

  function handleRefreshAll() {
    return runAllRefresh(async () => {
      try {
        const report = await accountManagerUseCases.refreshAll()
        applyReport(report)
        const failed = report.failed.length
        if (failed > 0) {
          useAccountManagerStore.getState().setRegionError(
            "account",
            makeRegionError(
              { code: "PARTIAL_REFRESH", message: "" },
              "accountManager.errors.partialRefresh",
              {
                values: { failed, total: report.total },
                retry: handleRefreshAll,
              },
            ),
          )
        } else {
          toast.success(
            t("accountManager.toasts.refreshAllSuccess", { count: report.succeeded.length }),
          )
          useAccountManagerStore.getState().setRegionError("account", null)
        }
      } catch (error) {
        writeRegionError("account", error, "accountManager.errors.refreshAccounts", {
          retry: handleRefreshAll,
        })
      }
    })
  }

  return {
    refreshingAccountIds,
    refreshingStationIds,
    refreshingAll,
    justRefreshedIds,
    handleRefreshAccount,
    handleRefreshStation,
    handleRefreshAll,
  }
}
