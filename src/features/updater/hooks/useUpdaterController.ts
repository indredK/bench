/**
 * Controller / 控制器: bind updater shell actions; 连接更新检查、下载与重启流程.
 */
import { useCallback, useEffect, useRef } from "react"
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
import {
  readUpdaterPolicy,
  writeUpdaterPolicy,
  type UpdaterPolicy,
} from "@/features/updater/services/updater-policy.repository"
import {
  AUTO_CHECK_STARTUP_DELAY_MS,
  getNextAutoCheckDelay,
  shouldDeferAutoCheckForConnection,
} from "@/features/updater/services/updater-policy"

const GITHUB_RELEASES_URL = "https://github.com/indredK/bench/releases"

export function useUpdaterController() {
  const { t } = useTranslation()
  const canUsePlatformFeatures = canUseDesktopFeatures()
  const mountedAtRef = useRef(Date.now())

  const open = useUpdaterStore((s) => s.open)
  const status = useUpdaterStore((s) => s.status)
  const currentVersion = useUpdaterStore((s) => s.currentVersion)
  const updateInfo = useUpdaterStore((s) => s.updateInfo)
  const error = useUpdaterStore((s) => s.error)
  const errorInfo = useUpdaterStore((s) => s.errorInfo)
  const downloadedBytes = useUpdaterStore((s) => s.downloadedBytes)
  const totalBytes = useUpdaterStore((s) => s.totalBytes)
  const lastCheckedAt = useUpdaterStore((s) => s.lastCheckedAt)
  const autoCheckEnabled = useUpdaterStore((s) => s.autoCheckEnabled)
  const autoCheckFailureCount = useUpdaterStore((s) => s.autoCheckFailureCount)
  const lastAutoCheckFailureAt = useUpdaterStore((s) => s.lastAutoCheckFailureAt)
  const policyHydrated = useUpdaterStore((s) => s.policyHydrated)

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

  const persistPolicy = useCallback((overrides: Partial<UpdaterPolicy> = {}) => {
    const state = useUpdaterStore.getState()
    writeUpdaterPolicy({
      autoCheckEnabled: state.autoCheckEnabled,
      lastSuccessfulCheckAt: state.lastCheckedAt,
      lastFailureAt: state.lastAutoCheckFailureAt,
      failureCount: state.autoCheckFailureCount,
      ...overrides,
    })
  }, [])

  const runUpdateCheck = useCallback(
    async (interactive: boolean) => {
      const { status: currentStatus } = useUpdaterStore.getState()
      if (
        currentStatus === "checking" ||
        currentStatus === "downloading" ||
        currentStatus === "cancelling" ||
        currentStatus === "installing" ||
        currentStatus === "readyToRestart"
      ) {
        return
      }

      if (!canUsePlatformFeatures) {
        if (!interactive) return
        useUpdaterStore.setState({
          open: true,
          status: "error",
          error: t("updater.desktopOnly"),
          errorInfo: createDesktopOnlyUpdaterError(t("updater.desktopOnly")),
        })
        return
      }

      if (!interactive && typeof navigator !== "undefined") {
        const connection = (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string }
          }
        ).connection
        if (navigator.onLine === false || shouldDeferAutoCheckForConnection(connection)) return
      }

      useUpdaterStore.setState({
        open: interactive ? true : useUpdaterStore.getState().open,
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
          open: interactive || result.available,
          lastCheckedAt: Date.now(),
          autoCheckFailureCount: 0,
          lastAutoCheckFailureAt: 0,
          error: "",
          errorInfo: null,
        })
        persistPolicy({
          lastSuccessfulCheckAt: useUpdaterStore.getState().lastCheckedAt,
          lastFailureAt: 0,
          failureCount: 0,
        })
      } catch (error) {
        const errorInfo = classifyUpdaterError(error, "check", t("updater.errors.checkFailed"))
        const failedAt = Date.now()
        const failureCount = Math.min(16, useUpdaterStore.getState().autoCheckFailureCount + 1)
        useUpdaterStore.setState(
          interactive
            ? {
                status: "error",
                error: errorInfo.message,
                errorInfo,
                autoCheckFailureCount: failureCount,
                lastAutoCheckFailureAt: failedAt,
              }
            : {
                status: "idle",
                error: "",
                errorInfo: null,
                autoCheckFailureCount: failureCount,
                lastAutoCheckFailureAt: failedAt,
              },
        )
        persistPolicy({ lastFailureAt: failedAt, failureCount })
      }
    },
    [canUsePlatformFeatures, persistPolicy, t],
  )

  const checkUpdates = useCallback(() => runUpdateCheck(true), [runUpdateCheck])

  const setAutoCheckEnabled = useCallback(
    (enabled: boolean) => {
      useUpdaterStore.setState({ autoCheckEnabled: enabled })
      persistPolicy({ autoCheckEnabled: enabled })
    },
    [persistPolicy],
  )

  const downloadAndInstall = useCallback(async () => {
    const { status: dlStatus } = useUpdaterStore.getState()
    if (dlStatus === "downloading" || dlStatus === "cancelling" || dlStatus === "installing") return

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
    const { status: currentStatus } = useUpdaterStore.getState()
    if (currentStatus !== "downloading") return
    useUpdaterStore.setState({ status: "cancelling" })
    try {
      await cancelAppUpdateDownload()
    } catch (error) {
      const errorInfo = classifyUpdaterError(error, "install", t("updater.errors.installFailed"))
      useUpdaterStore.setState({ status: "error", error: errorInfo.message, errorInfo })
    }
  }, [t])

  const openReleasesPage = useCallback(() => {
    void openExternal(GITHUB_RELEASES_URL)
  }, [])

  const restartNow = useCallback(async () => {
    await restartAfterUpdate()
  }, [])

  const closeDialog = useCallback(() => {
    if (status === "downloading" || status === "cancelling" || status === "installing") {
      return
    }
    setOpen(false)
  }, [setOpen, status])

  const dismissDialog = useCallback(() => {
    if (status === "downloading" || status === "cancelling" || status === "installing") return
    resetTransientState()
    setOpen(false)
  }, [resetTransientState, setOpen, status])

  useEffect(() => {
    void loadCurrentVersion()
  }, [loadCurrentVersion])

  useEffect(() => {
    const policy = readUpdaterPolicy()
    useUpdaterStore.setState({
      autoCheckEnabled: policy.autoCheckEnabled,
      lastCheckedAt: policy.lastSuccessfulCheckAt,
      autoCheckFailureCount: policy.failureCount,
      lastAutoCheckFailureAt: policy.lastFailureAt,
      policyHydrated: true,
    })
  }, [])

  useEffect(() => {
    if (!canUsePlatformFeatures || !policyHydrated || !autoCheckEnabled) return undefined

    let timer: number | undefined
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      if (typeof navigator !== "undefined") {
        const connection = (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string }
          }
        ).connection
        if (navigator.onLine === false || shouldDeferAutoCheckForConnection(connection)) return
      }

      const now = Date.now()
      const policyDelay = getNextAutoCheckDelay(
        {
          autoCheckEnabled,
          lastSuccessfulCheckAt: lastCheckedAt,
          lastFailureAt: lastAutoCheckFailureAt,
          failureCount: autoCheckFailureCount,
        },
        now,
      )
      if (policyDelay === null) return
      const startupDelay = Math.max(0, mountedAtRef.current + AUTO_CHECK_STARTUP_DELAY_MS - now)
      timer = window.setTimeout(
        () => void runUpdateCheck(false),
        Math.max(startupDelay, policyDelay),
      )
    }

    schedule()
    window.addEventListener("online", schedule)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener("online", schedule)
    }
  }, [
    autoCheckEnabled,
    autoCheckFailureCount,
    canUsePlatformFeatures,
    lastAutoCheckFailureAt,
    lastCheckedAt,
    policyHydrated,
    runUpdateCheck,
  ])

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
          status: useUpdaterStore.getState().updateInfo?.available ? "available" : "idle",
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
    autoCheckEnabled,
    checkUpdates,
    setAutoCheckEnabled,
    downloadAndInstall,
    cancelDownload,
    openReleasesPage,
    restartNow,
    closeDialog,
    dismissDialog,
  }
}

export type UpdaterController = ReturnType<typeof useUpdaterController>
