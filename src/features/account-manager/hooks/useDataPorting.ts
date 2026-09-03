/**
 * Data porting hook / 导入导出编排. (拆分自 useAccountManagerController — A1-3)
 * INVALID_INPUT（如非法导入文件）走输入级 toast，系统错误写入账号区域错误条。
 */
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { makeRegionError } from "@/features/account-manager/errors"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { translateError } from "@/lib/tauri/errors"
import { parseCommandError } from "@/lib/tauri/errors"

export function useDataPorting() {
  const { t } = useTranslation()

  function handleExportData() {
    return (async () => {
      const s = useAccountManagerStore.getState()
      if (s.exportingData) return
      s.setExportingData(true)
      try {
        const result = await accountManagerUseCases.exportData()
        if (!result) return
        toast.success(
          t("accountManager.toasts.exportSuccess", {
            stations: result.stationCount,
            accounts: result.accountCount,
          }),
        )
        s.setRegionError("account", null)
      } catch (error) {
        const { code } = parseCommandError(error)
        if (code === "INVALID_INPUT") {
          toast.error(translateError(t, error, t("accountManager.toasts.exportFailed")))
        } else {
          useAccountManagerStore
            .getState()
            .setRegionError("account", makeRegionError(error, "accountManager.toasts.exportFailed"))
        }
      } finally {
        useAccountManagerStore.getState().setExportingData(false)
      }
    })()
  }

  function handleImportData() {
    return (async () => {
      const s = useAccountManagerStore.getState()
      if (s.importingData) return
      s.setImportingData(true)
      try {
        const result = await accountManagerUseCases.importData()
        if (!result) return
        const current = useAccountManagerStore.getState()
        current.setStations(result.stations)
        current.setAccounts(result.accounts)
        const { stationId, accountId } = accountManagerUseCases.resolveImportSelection(
          result,
          s.selectedStationId,
          s.selectedAccountId,
        )
        current.setSelectedStationId(stationId)
        current.setSelectedAccountId(accountId)
        current.clearRegionErrors()
        toast.success(
          t("accountManager.toasts.importSuccess", {
            stations: result.stationCount,
            accounts: result.accountCount,
          }),
        )
      } catch (error) {
        const { code } = parseCommandError(error)
        if (code === "INVALID_INPUT") {
          toast.error(translateError(t, error, t("accountManager.toasts.importFailed")))
        } else {
          useAccountManagerStore
            .getState()
            .setRegionError("account", makeRegionError(error, "accountManager.toasts.importFailed"))
        }
      } finally {
        useAccountManagerStore.getState().setImportingData(false)
      }
    })()
  }

  return { handleExportData, handleImportData }
}
