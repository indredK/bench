/**
 * Controller / 控制器: orchestrate command market list/install/uninstall; 只做编排.
 *
 * 「卸载」= 删除带市场来源标记的本地卡片；「更新」= 重新安装更高版本（后端版本单调，
 * 拒绝降级）。目录拉取失败不清空上一份快照，避免刷新抖动把已有内容闪没。
 */
import { useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useCommandCenterStore } from "@/features/command-center/store"
import { commandCenterUseCases } from "@/features/command-center/services/command-center.use-cases"
import { getErrorMessage } from "@/lib/tauri/errors"
import type { MarketCommandSummary } from "@/lib/tauri/types/command-center"

export function useCommandMarketController({ onCardsChanged }: { onCardsChanged: () => void }) {
  const { t } = useTranslation()
  const market = useCommandCenterStore((s) => s.market)
  const loading = useCommandCenterStore((s) => s.marketLoading)
  const error = useCommandCenterStore((s) => s.marketError)
  const busyId = useCommandCenterStore((s) => s.marketBusyId)
  const setMarket = useCommandCenterStore((s) => s.setMarket)
  const setLoading = useCommandCenterStore((s) => s.setMarketLoading)
  const setError = useCommandCenterStore((s) => s.setMarketError)
  const setBusyId = useCommandCenterStore((s) => s.setMarketBusyId)
  const fetchingRef = useRef(false)
  const actingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (fetchingRef.current || !commandCenterUseCases.isAvailable()) return
    fetchingRef.current = true
    setLoading(true)
    setError(null)
    try {
      setMarket(await commandCenterUseCases.listMarket())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [setError, setLoading, setMarket])

  const install = useCallback(
    async (summary: MarketCommandSummary) => {
      if (actingRef.current) return
      actingRef.current = true
      setBusyId(summary.id)
      try {
        await commandCenterUseCases.installMarketCommand(summary.id)
        toast.success(
          summary.installed
            ? t("commandCenter.market.toastUpdated", { title: summary.title })
            : t("commandCenter.market.toastInstalled", { title: summary.title }),
        )
        onCardsChanged()
        await refresh()
      } catch (err) {
        toast.error(getErrorMessage(err) || t("commandCenter.market.installFailed"))
      } finally {
        actingRef.current = false
        setBusyId(null)
      }
    },
    [onCardsChanged, refresh, setBusyId, t],
  )

  const uninstall = useCallback(
    async (summary: MarketCommandSummary) => {
      if (actingRef.current) return false
      actingRef.current = true
      setBusyId(summary.id)
      try {
        await commandCenterUseCases.deleteCard(summary.id)
        toast.success(t("commandCenter.market.toastUninstalled", { title: summary.title }))
        onCardsChanged()
        await refresh()
        return true
      } catch (err) {
        toast.error(getErrorMessage(err) || t("commandCenter.market.uninstallFailed"))
        return false
      } finally {
        actingRef.current = false
        setBusyId(null)
      }
    },
    [onCardsChanged, refresh, setBusyId, t],
  )

  const upgradableCount = market?.commands.filter((entry) => entry.upgradable).length ?? 0

  return { market, loading, error, busyId, upgradableCount, refresh, install, uninstall }
}
