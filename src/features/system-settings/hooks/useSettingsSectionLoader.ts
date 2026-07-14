import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { translateError } from "@/lib/tauri/errors"
import { canUseTauriWindow } from "@/platform/capabilities"

export type SettingsSectionLoadStatus = "loading" | "ready" | "error"

export function useSettingsSectionLoader(load: () => Promise<void>) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SettingsSectionLoadStatus>("loading")
  const [error, setError] = useState("")
  const mountedRef = useRef(true)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const reload = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current

    const task = (async () => {
      if (mountedRef.current) {
        setStatus("loading")
        setError("")
      }
      try {
        await load()
        if (mountedRef.current) setStatus("ready")
      } catch (loadError) {
        if (mountedRef.current) {
          setError(translateError(t, loadError, t("systemSettings.loadFailedTitle")))
          setStatus("error")
        }
      }
    })()

    inFlightRef.current = task
    void task.finally(() => {
      if (inFlightRef.current === task) inFlightRef.current = null
    })
    return task
  }, [load, t])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void reload()

    if (!canUseTauriWindow()) return undefined

    let cancelled = false
    let unlisten: (() => void) | undefined
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) void reload()
        }),
      )
      .then((nextUnlisten) => {
        if (cancelled) nextUnlisten()
        else unlisten = nextUnlisten
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [reload])

  return { status, error, reload }
}
