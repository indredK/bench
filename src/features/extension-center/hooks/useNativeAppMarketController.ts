import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  installNativeMarketApp,
  listNativeMarketApps,
  openNativeMarketApp,
  uninstallNativeMarketApp,
} from "@/lib/tauri/commands/extension-center"
import { parseCommandError, translateError } from "@/lib/tauri/errors"
import type { NativeAppMarketItem } from "@/lib/tauri/types/extension-center"

type NativeAppAction = "install" | "open" | "uninstall"

const runNativeAppAction = {
  install: installNativeMarketApp,
  open: openNativeMarketApp,
  uninstall: uninstallNativeMarketApp,
} satisfies Record<NativeAppAction, (appId: NativeAppMarketItem["id"]) => Promise<unknown>>

export function useNativeAppMarketController() {
  const { t } = useTranslation()
  const [apps, setApps] = useState<NativeAppMarketItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [busyIds, setBusyIds] = useState<string[]>([])
  const fetchingRef = useRef(false)
  const actionsInFlightRef = useRef(new Set<string>())

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    try {
      setApps(await listNativeMarketApps())
      setError(null)
    } catch (rawError) {
      setError(parseCommandError(rawError))
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runAction = useCallback(
    async (appId: NativeAppMarketItem["id"], action: NativeAppAction) => {
      if (actionsInFlightRef.current.has(appId)) return
      actionsInFlightRef.current.add(appId)
      setBusyIds((current) => [...new Set([...current, appId])])
      try {
        const result = await runNativeAppAction[action](appId)
        if (!result.success) {
          toast.error(t(`extensionCenter.nativeApps.${action}Failed`), {
            description: result.message,
          })
          return
        }
        toast.success(t(`extensionCenter.nativeApps.${action}Success`))
        await refresh()
      } catch (rawError) {
        toast.error(translateError(t, rawError, t(`extensionCenter.nativeApps.${action}Failed`)))
      } finally {
        actionsInFlightRef.current.delete(appId)
        setBusyIds((current) => current.filter((value) => value !== appId))
      }
    },
    [refresh, t],
  )

  return { apps, loading, error, busyIds, refresh, runAction }
}
