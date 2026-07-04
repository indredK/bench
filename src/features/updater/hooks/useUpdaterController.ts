/**
 * Controller / 控制器: bind updater shell actions; 连接更新检查、下载与重启流程.
 */
import { useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  cancelAppUpdateDownload,
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  getCurrentAppVersion,
  restartAfterUpdate,
} from "@/lib/tauri/commands/updater"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import type { AppUpdateDownloadEvent } from "@/lib/tauri/types/updater"
import { listenToPlatformEvent } from "@/platform/events"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { openExternal } from "@/platform/shell"
import {
  classifyUpdaterError,
  createDesktopOnlyUpdaterError,
} from "@/features/updater/error-classifier"
import { getErrorMessage } from "@/lib/tauri/errors"
import { useUpdaterStore } from "@/features/updater/store"

const GITHUB_RELEASES_URL = "https://github.com/indredK/bench/releases"

export function useUpdaterController() {
  const { t } = useTranslation()
  const canUsePlatformFeatures = canUseDesktopFeatures()

  const open = useUpdaterStore((s) => s.open)
  const status = useUpdaterStore((s) => s.status)
  const currentVersion = useUpdaterStore((s) => s.currentVersion)
  const updateInfo = useUpdaterStore((s) => s.updateInfo)
  const error = useUpdaterStore((s) => s.error)
  const errorInfo = useUpdaterStore((s) => s.errorInfo)
  const downloadedBytes = useUpdaterStore((s) => s.downloadedBytes)
  const totalBytes = useUpdaterStore((s) => s.totalBytes)
  const lastCheckedAt = useUpdaterStore((s) => s.lastCheckedAt)

  const setOpen = useUpdaterStore((s) => s.setOpen)
  const resetTransientState = useUpdaterStore((s) => s.resetTransientState)

  const loadCurrentVersion = useCallback(async () => {
    if (!canUsePlatformFeatures) return
    try {
      const version = await getCurrentAppVersion()
      useUpdaterStore.setState({ currentVersion: version })
    } catch {
      /* ignore version bootstrap failures */
    }
  }, [canUsePlatformFeatures])

  const checkUpdates = useCallback(async () => {
    if (!canUsePlatformFeatures) {
      useUpdaterStore.setState({
        open: true,
        status: "error",
        error: t("updater.desktopOnly"),
        errorInfo: createDesktopOnlyUpdaterError(t("updater.desktopOnly")),
      })
      return
    }

    useUpdaterStore.setState({
      open: true,
      status: "checking",
      error: "",
      errorInfo: null,
      updateInfo: null,
      downloadedBytes: 0,
      totalBytes: null,
    })

    try {
      const result = await checkForAppUpdate()
      useUpdaterStore.setState({
        currentVersion: result.currentVersion,
        updateInfo: result,
        status: result.available ? "available" : "upToDate",
        lastCheckedAt: Date.now(),
        error: "",
        errorInfo: null,
      })
    } catch (error) {
      const errorInfo = classifyUpdaterError(error, "check", t("updater.errors.checkFailed"))
      useUpdaterStore.setState({
        status: "error",
        error: errorInfo.message,
        errorInfo,
      })
    }
  }, [canUsePlatformFeatures, t])

  const downloadAndInstall = useCallback(async () => {
    useUpdaterStore.setState({
      status: "downloading",
      error: "",
      errorInfo: null,
      downloadedBytes: 0,
      totalBytes: null,
    })

    try {
      await downloadAndInstallAppUpdate()
      useUpdaterStore.setState({ status: "readyToRestart", error: "", errorInfo: null })
    } catch (error) {
      const message = getErrorMessage(error)
      // User-initiated cancel: backend rejects with "update download cancelled".
      // Don't surface as an error — return to the available state so they can retry.
      if (message.toLowerCase().includes("cancelled")) {
        useUpdaterStore.setState((state) => ({
          status: state.updateInfo?.available ? "available" : "idle",
          downloadedBytes: 0,
          totalBytes: null,
          error: "",
          errorInfo: null,
        }))
        return
      }
      const errorInfo = classifyUpdaterError(error, "install", t("updater.errors.installFailed"))
      useUpdaterStore.setState({
        status: "error",
        error: errorInfo.message,
        errorInfo,
      })
    }
  }, [t])

  const cancelDownload = useCallback(async () => {
    try {
      await cancelAppUpdateDownload()
    } catch {
      /* ignore — the in-flight install promise will reject and surface its own state */
    }
  }, [])

  const openReleasesPage = useCallback(() => {
    void openExternal(GITHUB_RELEASES_URL)
  }, [])

  const restartNow = useCallback(async () => {
    await restartAfterUpdate()
  }, [])

  const closeDialog = useCallback(() => {
    if (status === "downloading" || status === "installing") {
      return
    }
    setOpen(false)
  }, [setOpen, status])

  const dismissDialog = useCallback(() => {
    if (status === "downloading" || status === "installing") return
    resetTransientState()
    setOpen(false)
  }, [resetTransientState, setOpen, status])

  useEffect(() => {
    void loadCurrentVersion()
  }, [loadCurrentVersion])

  useEffect(() => {
    if (!canUsePlatformFeatures) return

    // `listenToPlatformEvent` is async — if the component unmounts before the
    // promise resolves the original cleanup was a no-op while the listener
    // ended up registered (leak). Use a `cancelled` flag so a late-arriving
    // unlisten is invoked immediately (#104).
    let cancelled = false
    let unlisten: (() => void) | undefined

    void listenToPlatformEvent<AppUpdateDownloadEvent>(TAURI_EVENTS.updater.download, (event) => {
      const payload = event.payload
      if (payload.event === "started") {
        useUpdaterStore.setState({
          status: "downloading",
          downloadedBytes: 0,
          totalBytes: payload.contentLength,
        })
        return
      }
      if (payload.event === "progress") {
        useUpdaterStore.setState({
          status: "downloading",
          downloadedBytes: payload.downloadedBytes,
          totalBytes: payload.contentLength,
        })
        return
      }
      if (payload.event === "cancelled") {
        useUpdaterStore.setState({
          downloadedBytes: 0,
          totalBytes: null,
        })
        return
      }
      if (payload.event === "failed") {
        return
      }
      useUpdaterStore.setState({ status: "installing" })
    }).then((fn) => {
      if (cancelled) {
        fn()
      } else {
        unlisten = fn
      }
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [canUsePlatformFeatures])

  return {
    open,
    status,
    currentVersion,
    updateInfo,
    error,
    errorInfo,
    downloadedBytes,
    totalBytes,
    lastCheckedAt,
    checkUpdates,
    downloadAndInstall,
    cancelDownload,
    openReleasesPage,
    restartNow,
    closeDialog,
    dismissDialog,
  }
}

export type UpdaterController = ReturnType<typeof useUpdaterController>
