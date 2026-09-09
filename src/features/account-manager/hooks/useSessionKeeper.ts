/**
 * Session Keeper hook / 会话保活编排: 保存刷新计划 + 加载账号日志 + URL 站点匹配.
 * 保存防重入(useGuardedAsyncSet);错误走 toast(设置失败)或由对话框自行展示(日志加载).
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useGuardedAsyncSet } from "@/hooks/useGuardedAsync"
import type {
  AccountLogsResponse,
  RefreshSchedule,
  StationAccount,
  StationUrlMatch,
} from "@/lib/tauri/types/account-manager"
import { translateError } from "@/lib/tauri/errors"

export function useSessionKeeper() {
  const { t } = useTranslation()
  const { pendingKeys: savingScheduleIds, run: runSaveSchedule } = useGuardedAsyncSet<string>()
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logs, setLogs] = useState<AccountLogsResponse | null>(null)

  const isAccountLogOpen = useAccountManagerStore((s) => s.isAccountLogOpen)
  const accountLogTarget = useAccountManagerStore((s) => s.accountLogTarget)

  const loadLogs = useCallback(
    async (accountId: string) => {
      setLogsLoading(true)
      setLogsError(null)
      try {
        const response = await accountManagerUseCases.loadAccountLogs(accountId)
        setLogs(response)
      } catch (error) {
        setLogs(null)
        setLogsError(translateError(t, error, t("accountManager.accountLog.loadFailed")))
      } finally {
        setLogsLoading(false)
      }
    },
    [t],
  )

  // 日志对话框打开时加载目标账号日志。
  useEffect(() => {
    if (!isAccountLogOpen || !accountLogTarget) return
    void loadLogs(accountLogTarget.accountId)
  }, [isAccountLogOpen, accountLogTarget, loadLogs])

  const handleOpenAccountLogs = useCallback((account: StationAccount) => {
    const s = useAccountManagerStore.getState()
    s.setAccountLogTarget({ accountId: account.id, accountName: account.username })
    s.setAccountLogOpen(true)
  }, [])

  const handleScheduleChange = useCallback(
    (accountId: string, schedule: RefreshSchedule | null) => {
      return runSaveSchedule(accountId, async () => {
        try {
          const updated = await accountManagerUseCases.saveRefreshSchedule(accountId, schedule)
          useAccountManagerStore
            .getState()
            .setAccounts((prev) =>
              prev.map((account) => (account.id === updated.id ? updated : account)),
            )
          toast.success(t("accountManager.sessionKeeper.saveSuccess"))
        } catch (error) {
          toast.error(translateError(t, error, t("accountManager.sessionKeeper.saveFailed")))
        }
      })
    },
    [runSaveSchedule, t],
  )

  /** URL → 站点匹配(快速登录对话框防抖调用)。 */
  const matchStations = useCallback((url: string) => {
    return accountManagerUseCases.matchStations(url)
  }, [])

  return {
    savingScheduleIds,
    handleScheduleChange,
    handleOpenAccountLogs,
    logs,
    logsLoading,
    logsError,
    reloadLogs: loadLogs,
    matchStations,
  }
}

export type SessionKeeperController = ReturnType<typeof useSessionKeeper>
export type { StationUrlMatch }
