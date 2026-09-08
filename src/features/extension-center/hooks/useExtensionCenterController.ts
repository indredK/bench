/**
 * Controller hook / 控制器: orchestrate list/open/toggle; 只做编排，不碰 invoke 细节.
 */
import { useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  listInstalledExtensions,
  openExtension,
  setExtensionEnabled,
  type ExtensionSummary,
} from "@/lib/tauri/commands/extension-center"
import { parseCommandError, translateError } from "@/lib/tauri/errors"

import { useExtensionCenterStore } from "../store"

export function useExtensionCenterController() {
  const { t } = useTranslation()
  const items = useExtensionCenterStore((s) => s.items)
  const loading = useExtensionCenterStore((s) => s.loading)
  const error = useExtensionCenterStore((s) => s.error)
  const busyIds = useExtensionCenterStore((s) => s.busyIds)
  const setItems = useExtensionCenterStore((s) => s.setItems)
  const setLoading = useExtensionCenterStore((s) => s.setLoading)
  const setError = useExtensionCenterStore((s) => s.setError)
  const setBusy = useExtensionCenterStore((s) => s.setBusy)
  const refreshingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const list = await listInstalledExtensions()
      setItems(list)
    } catch (rawError) {
      setError(parseCommandError(rawError))
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [setItems, setLoading, setError])

  const open = useCallback(
    async (id: string) => {
      setBusy(id, true)
      try {
        await openExtension(id)
      } catch (rawError) {
        toast.error(translateError(t, rawError, t("extensionCenter.openFailed")))
      } finally {
        setBusy(id, false)
      }
    },
    [setBusy, t],
  )

  const toggleEnabled = useCallback(
    async (item: ExtensionSummary) => {
      setBusy(item.id, true)
      try {
        const enabled = await setExtensionEnabled(item.id, !item.enabled)
        setItems(items.map((entry) => (entry.id === item.id ? { ...entry, enabled } : entry)))
        toast.success(
          enabled ? t("extensionCenter.toastEnabled") : t("extensionCenter.toastDisabled"),
        )
      } catch (rawError) {
        toast.error(translateError(t, rawError, t("extensionCenter.toggleFailed")))
      } finally {
        setBusy(item.id, false)
      }
    },
    [items, setBusy, setItems, t],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { items, loading, error, busyIds, refresh, open, toggleEnabled }
}
