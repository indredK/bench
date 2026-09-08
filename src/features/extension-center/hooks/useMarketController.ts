/**
 * Controller hook / 控制器: orchestrate market list/prepare/commit; 只做编排.
 *
 * 信任披露（A4-1）：install 分两段 —— `prepare` 下载并完成全部安全校验，
 * 弹窗展示 ACL 权限；用户确认后 `commit` 原子落位。
 */
import { useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  commitMarketInstall,
  listInstalledExtensions,
  listMarketExtensions,
  prepareMarketInstall,
} from "@/lib/tauri/commands/extension-center"
import { parseCommandError, translateError } from "@/lib/tauri/errors"

import { useExtensionCenterStore } from "../store"

export function useMarketController() {
  const { t } = useTranslation()
  const marketListing = useExtensionCenterStore((s) => s.marketListing)
  const marketLoading = useExtensionCenterStore((s) => s.marketLoading)
  const marketError = useExtensionCenterStore((s) => s.marketError)
  const pendingPreview = useExtensionCenterStore((s) => s.pendingPreview)
  const committing = useExtensionCenterStore((s) => s.committing)
  const busyIds = useExtensionCenterStore((s) => s.busyIds)
  const setMarketListing = useExtensionCenterStore((s) => s.setMarketListing)
  const setMarketLoading = useExtensionCenterStore((s) => s.setMarketLoading)
  const setMarketError = useExtensionCenterStore((s) => s.setMarketError)
  const setPendingPreview = useExtensionCenterStore((s) => s.setPendingPreview)
  const setCommitting = useExtensionCenterStore((s) => s.setCommitting)
  const setBusy = useExtensionCenterStore((s) => s.setBusy)
  const setItems = useExtensionCenterStore((s) => s.setItems)
  const fetchingRef = useRef(false)

  const refreshMarket = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setMarketLoading(true)
    setMarketError(null)
    try {
      const listing = await listMarketExtensions()
      setMarketListing(listing)
    } catch (rawError) {
      setMarketError(parseCommandError(rawError))
    } finally {
      setMarketLoading(false)
      fetchingRef.current = false
    }
  }, [setMarketError, setMarketListing, setMarketLoading])

  /** prepare：下载 + 全量校验，成功后弹信任披露。 */
  const prepareInstall = useCallback(
    async (extensionId: string, version: string) => {
      const key = `${extensionId}@${version}`
      setBusy(key, true)
      try {
        const preview = await prepareMarketInstall(extensionId, version)
        setPendingPreview(preview)
      } catch (rawError) {
        toast.error(translateError(t, rawError, t("extensionCenter.market.prepareFailed")))
      } finally {
        setBusy(key, false)
      }
    },
    [setBusy, setPendingPreview, t],
  )

  /** commit：信任确认后落位。 */
  const confirmInstall = useCallback(async () => {
    const preview = useExtensionCenterStore.getState().pendingPreview
    if (!preview || useExtensionCenterStore.getState().committing) return
    setCommitting(true)
    try {
      await commitMarketInstall(preview.id, preview.version)
      toast.success(t("extensionCenter.market.toastInstalled"))
      setPendingPreview(null)
      // 安装后刷新两个列表（installed 状态与 market 徽标都会变化）。
      const [installed, listing] = await Promise.allSettled([
        listInstalledExtensions(),
        listMarketExtensions(),
      ])
      if (installed.status === "fulfilled") setItems(installed.value)
      if (listing.status === "fulfilled") setMarketListing(listing.value)
    } catch (rawError) {
      toast.error(translateError(t, rawError, t("extensionCenter.market.commitFailed")))
    } finally {
      setCommitting(false)
    }
  }, [setCommitting, setItems, setMarketListing, setPendingPreview, t])

  const cancelInstall = useCallback(() => {
    setPendingPreview(null)
  }, [setPendingPreview])

  return {
    marketListing,
    marketLoading,
    marketError,
    pendingPreview,
    committing,
    busyIds,
    refreshMarket,
    prepareInstall,
    confirmInstall,
    cancelInstall,
  }
}
