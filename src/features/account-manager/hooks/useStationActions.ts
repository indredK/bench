/**
 * Station actions hook / 站点动作编排: CRUD + 排序 + 探针策略 + AuthProfile 重测.
 * 错误统一经 `parseCommandError` 分类（A1-4）：INVALID_INPUT 走输入级 toast，
 * 系统错误写入站点/详情区域错误条（A1-1）。
 */
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { toast } from "sonner"
import {
  accountManagerUseCases,
  isInvalidInput,
} from "@/features/account-manager/services/account-manager.use-cases"
import { makeRegionError } from "@/features/account-manager/errors"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync"
import type { ProbeStrategy } from "@/lib/tauri/types/account-manager"
import type { SessionSettings } from "@/features/account-manager/model/types"
import { translateError } from "@/lib/tauri/errors"

function translateInvalidInput(t: TFunction, error: unknown, fallbackKey: string): string {
  return translateError(t, error, t(fallbackKey))
}

export function useStationActions({
  loadInitialData,
}: {
  /** 站点区域的重试入口：复用既有全量刷新（重新拉取站点列表）。 */
  loadInitialData: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { pending: deletingStationPending, run: runDeleteStation } = useGuardedAsync()
  const { pendingKeys: redetectingStationIds, run: runRedetectProfile } =
    useGuardedAsyncSet<string>()
  const { pendingKeys: settingProbeStrategyIds, run: runProbeStrategyChange } =
    useGuardedAsyncSet<string>()

  const retryViaReload = () => {
    void loadInitialData()
  }

  function handleAddStation(remark: string, website: string, sessionSettings?: SessionSettings) {
    return (async () => {
      try {
        const station = await accountManagerUseCases.addStation(remark, website, sessionSettings)
        const s = useAccountManagerStore.getState()
        s.setStations((prev) => [...prev, station])
        s.setSelectedStationId(station.id)
        s.setSelectedAccountId("")
        s.setAddStationOpen(false)
        s.setRegionError("station", null)
        return true
      } catch (error) {
        if (isInvalidInput(error)) {
          toast.error(translateInvalidInput(t, error, "accountManager.toasts.createStationFailed"))
        } else {
          useAccountManagerStore.getState().setRegionError(
            "station",
            makeRegionError(error, "accountManager.errors.stationAction", {
              retry: retryViaReload,
            }),
          )
        }
        return false
      }
    })()
  }

  function handleEditStation(remark: string, website: string, sessionSettings?: SessionSettings) {
    return (async () => {
      const editingStation = useAccountManagerStore.getState().editingStation
      if (!editingStation) return false
      try {
        const updated = await accountManagerUseCases.editStation(
          editingStation,
          remark,
          website,
          sessionSettings,
        )
        const s = useAccountManagerStore.getState()
        s.setStations((prev) =>
          prev.map((station) => (station.id === updated.id ? updated : station)),
        )
        s.setEditStationOpen(false)
        s.setEditingStation(null)
        s.setRegionError("station", null)
        return true
      } catch (error) {
        if (isInvalidInput(error)) {
          toast.error(translateInvalidInput(t, error, "accountManager.toasts.updateStationFailed"))
        } else {
          useAccountManagerStore.getState().setRegionError(
            "station",
            makeRegionError(error, "accountManager.errors.stationAction", {
              retry: retryViaReload,
            }),
          )
        }
        return false
      }
    })()
  }

  function handleDeleteStation() {
    return runDeleteStation(async () => {
      const s0 = useAccountManagerStore.getState()
      const target = s0.deletingStation
      if (!target) return
      const { wasSelected, newStationId, newAccountId } =
        accountManagerUseCases.buildStationDeleteSelection(
          s0.stations,
          s0.accounts,
          target,
          s0.selectedStationId,
          s0.selectedAccountId,
        )
      try {
        const report = await accountManagerUseCases.deleteStation(target.id)
        const s = useAccountManagerStore.getState()
        if (!report.metadataDeleted) {
          const failed = report.resources.filter((resource) => resource.status === "failed").length
          s.setDeleteStationOpen(false)
          s.setDeletingStation(null)
          toast.warning(t("accountManager.toasts.deleteCleanupPartial", { failed }))
          return
        }
        s.setStations((prev) => prev.filter((station) => station.id !== target.id))
        s.setAccounts((prev) => prev.filter((account) => account.stationId !== target.id))
        if (wasSelected) {
          s.setSelectedStationId(newStationId)
          s.setSelectedAccountId(newAccountId)
        }
        s.setDeleteStationOpen(false)
        s.setDeletingStation(null)
        s.setRegionError("station", null)
        toast.success(t("accountManager.toasts.deleteStationSuccess", { name: target.remark }))
      } catch (error) {
        if (isInvalidInput(error)) {
          toast.error(translateInvalidInput(t, error, "accountManager.toasts.deleteStationFailed"))
        } else {
          useAccountManagerStore.getState().setRegionError(
            "station",
            makeRegionError(error, "accountManager.errors.stationAction", {
              retry: retryViaReload,
            }),
          )
        }
      }
    })
  }

  function handleReorderStations(orderedIds: string[]) {
    return (async () => {
      const s = useAccountManagerStore.getState()
      const prev = s.stations
      const { next, mismatch } = accountManagerUseCases.buildOptimisticStationOrder(
        prev,
        orderedIds,
      )
      if (mismatch) {
        toast.error(t("accountManager.toasts.reorderMismatch"))
        return
      }
      s.setStations(next)
      s.setReorderingStations(true)
      try {
        const server = await accountManagerUseCases.reorderStations(orderedIds)
        useAccountManagerStore.getState().setStations(server)
        toast.success(t("accountManager.toasts.reorderStationsSuccess"))
        useAccountManagerStore.getState().setRegionError("station", null)
      } catch (error) {
        useAccountManagerStore.getState().setStations(prev)
        if (isInvalidInput(error)) {
          toast.error(t("accountManager.toasts.reorderStationsFailed"))
          try {
            useAccountManagerStore
              .getState()
              .setStations(await accountManagerUseCases.loadInitialData().then(([, st]) => st))
          } catch {
            /* ignore */
          }
        } else {
          useAccountManagerStore.getState().setRegionError(
            "station",
            makeRegionError(error, "accountManager.errors.stationAction", {
              retry: retryViaReload,
            }),
          )
        }
      } finally {
        useAccountManagerStore.getState().setReorderingStations(false)
      }
    })()
  }

  function handleRedetectProfile(stationId: string, accountId?: string) {
    return runRedetectProfile(stationId, async () => {
      try {
        const profile = await accountManagerUseCases.redetectAuthProfile(stationId, accountId)
        useAccountManagerStore
          .getState()
          .setStations((prev) =>
            prev.map((station) =>
              station.id === stationId ? { ...station, authProfile: profile } : station,
            ),
          )
        toast.success(t("accountManager.sessionManager.authProfile.redetectSuccess"))
        useAccountManagerStore.getState().setRegionError("detail", null)
      } catch (error) {
        useAccountManagerStore.getState().setRegionError(
          "detail",
          makeRegionError(error, "accountManager.errors.detailAction", {
            retry: () => handleRedetectProfile(stationId, accountId),
          }),
        )
      }
    })
  }

  function handleProbeStrategyChange(stationId: string, next: ProbeStrategy | "auto") {
    return runProbeStrategyChange(stationId, async () => {
      try {
        const updated = await accountManagerUseCases.changeProbeStrategy(stationId, next)
        useAccountManagerStore
          .getState()
          .setStations((prev) =>
            prev.map((station) =>
              station.id === stationId ? { ...station, ...updated } : station,
            ),
          )
        useAccountManagerStore.getState().setRegionError("detail", null)
      } catch (error) {
        useAccountManagerStore.getState().setRegionError(
          "detail",
          makeRegionError(error, "accountManager.errors.detailAction", {
            retry: () => handleProbeStrategyChange(stationId, next),
          }),
        )
      }
    })
  }

  return {
    deletingStationPending,
    redetectingStationIds,
    settingProbeStrategyIds,
    handleAddStation,
    handleEditStation,
    handleDeleteStation,
    handleReorderStations,
    handleRedetectProfile,
    handleProbeStrategyChange,
  }
}
