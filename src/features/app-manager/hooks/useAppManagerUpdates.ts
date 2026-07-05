import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAppManagerStore } from "@/features/app-manager/store"
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases"
import { useInstallEvents } from "@/features/app-manager/hooks/useInstallEvents"
import { installAppUpdate } from "@/lib/tauri/commands/app-manager"
import { getErrorMessage } from "@/lib/tauri/errors"
import type { UpdateInfo, UpdateSource } from "@/lib/tauri/types/app-manager"
import type { LocalizedError } from "@/lib/errors"
import { createBatchProgress, createBatchErrorPatch, createBatchSuccessPatch } from "@/features/app-manager/model/operations"

function isInstallerUpdateSource(source: UpdateSource): boolean {
  return source === "sparkle" || source === "electron" || source === "squirrel"
}

export function useAppManagerUpdates(
  onScanApps: () => Promise<void>,
  toLocalizedError: (key: string, fallback?: string, values?: Record<string, unknown>) => LocalizedError,
  scheduleTimeout: (callback: () => void, delayMs: number) => number,
) {
  const { t } = useTranslation()
  const setInstallFinished = useAppManagerStore((s) => s.setInstallFinished)
  const clearInstallProgress = useAppManagerStore((s) => s.clearInstallProgress)
  const clearInstallFinished = useAppManagerStore((s) => s.clearInstallFinished)
  const setUpdates = useAppManagerStore((s) => s.setUpdates)
  const setUpdatesLoading = useAppManagerStore((s) => s.setUpdatesLoading)
  const setUpdatesError = useAppManagerStore((s) => s.setUpdatesError)
  const setUpdatesScanned = useAppManagerStore((s) => s.setUpdatesScanned)
  const setUpdateOperationStatus = useAppManagerStore((s) => s.setUpdateOperationStatus)

  const [inProgressUpdate, setInProgressUpdate] = useState<UpdateInfo | null>(null)
  const pendingInstallerUpdatesRef = useRef<UpdateInfo[]>([])
  const activeInstallerAppIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeInstallerAppIdRef.current = inProgressUpdate?.appId ?? null
  }, [inProgressUpdate])

  useInstallEvents()

  const refreshUpdates = useCallback(async () => {
    const { apps: currentApps } = useAppManagerStore.getState()
    try {
      const updatableSet = await appManagerUseCases.findManagedAppUpdates(currentApps)
      if (updatableSet.size === 0) return
      useAppManagerStore.setState((state) => ({
        apps: state.apps.map((app) => ({
          ...app,
          upgradeAvailable: updatableSet.has(app.appId),
        })),
      }))
    } catch (updateError) {
      console.warn("[AppManager] Failed to check updates:", updateError)
    }
  }, [])

  const checkAllUpdates = useCallback(
    async (forceRefresh = false) => {
      if (!appManagerUseCases.isAvailable()) return
      const { updatesLoading: currentLoading } = useAppManagerStore.getState()
      if (currentLoading) return

      setUpdatesLoading(true)
      setUpdatesError(null)
      try {
        const { updates: result, error } = await appManagerUseCases.checkAllAppUpdates(forceRefresh)
        if (error) {
          setUpdatesError(toLocalizedError("appManager.errors.updateCheckFailed", error))
        }
        setUpdates(result)
        setUpdatesScanned(true)
      } catch (err) {
        setUpdatesError(
          toLocalizedError("appManager.errors.updateCheckFailed", getErrorMessage(err) || undefined),
        )
        setUpdatesScanned(true)
      } finally {
        setUpdatesLoading(false)
      }
    },
    [setUpdates, setUpdatesError, setUpdatesLoading, setUpdatesScanned, toLocalizedError],
  )

  const handleUpdateAction = useCallback(
    async (update: UpdateInfo) => {
      const { updateOperations: ops } = useAppManagerStore.getState()
      if (isOperationRunning(ops, update.appId)) return

      if (update.source === "macAppStore") {
        if (!update.adamId) {
          setUpdateOperationStatus(update.appId, "error", t("appManager.errors.missingMacAppStoreId"))
          return
        }
        setUpdateOperationStatus(update.appId, "running", t("appManager.softwareUpdate.status.openingAppStore"))
        try {
          await appManagerUseCases.openInMacAppStore(update.adamId)
          setUpdateOperationStatus(update.appId, "success")
        } catch (err) {
          setUpdateOperationStatus(update.appId, "error", String(err))
        }
        return
      }

      if (update.source === "homebrew") {
        setUpdateOperationStatus(update.appId, "running", t("appManager.softwareUpdate.status.upgradingHomebrew"))
        const outcome = await appManagerUseCases.runAppOperation({
          appId: update.appId,
          kind: "upgrade",
        })
        if (outcome) {
          setUpdateOperationStatus(
            update.appId,
            outcome.result.success ? "success" : "error",
            outcome.result.message,
          )
          if (outcome.shouldRescan) {
            void checkAllUpdates(true)
            void onScanApps()
          }
        }
        return
      }

      if (isInstallerUpdateSource(update.source)) {
        const activeInstallerAppId = activeInstallerAppIdRef.current
        if (activeInstallerAppId && activeInstallerAppId !== update.appId) return
        clearInstallProgress(update.appId)
        clearInstallFinished(update.appId)
        setInProgressUpdate(update)
        setUpdateOperationStatus(update.appId, "running", t("appManager.softwareUpdate.status.installingUpdate"))
        try {
          await installAppUpdate(update)
        } catch (err) {
          setInstallFinished(update.appId, {
            appId: update.appId,
            success: false,
            message: String(err),
            errorCode: "SU_INSTALL_FAIL",
          })
        }
        return
      }

      const url = update.downloadUrl ?? update.releaseNotesUrl ?? update.feedUrl
      if (!url) {
        setUpdateOperationStatus(update.appId, "error", t("appManager.errors.noDownloadUrl"))
        return
      }
      try {
        await appManagerUseCases.openExternal(url)
        setUpdateOperationStatus(update.appId, "success")
      } catch (err) {
        setUpdateOperationStatus(update.appId, "error", String(err))
      }
    },
    [
      checkAllUpdates,
      onScanApps,
      setUpdateOperationStatus,
      clearInstallProgress,
      clearInstallFinished,
      setInstallFinished,
      t,
    ],
  )

  const handleUpdateSourceAction = useCallback(
    async (source: UpdateSource, sourceUpdates: UpdateInfo[]) => {
      const { updateOperations: ops } = useAppManagerStore.getState()
      const availableUpdates = sourceUpdates.filter(
        (update) => !isOperationRunning(ops, update.appId),
      )
      if (availableUpdates.length === 0) return

      if (source === "macAppStore") {
        pendingInstallerUpdatesRef.current = []
        try {
          await appManagerUseCases.openMacAppStoreUpdates()
        } catch (error) {
          setUpdatesError(
            toLocalizedError("appManager.errors.updateCheckFailed", getErrorMessage(error) || undefined),
          )
        }
        return
      }

      if (isInstallerUpdateSource(source)) {
        if (activeInstallerAppIdRef.current || pendingInstallerUpdatesRef.current.length > 0) {
          return
        }
        const [firstUpdate, ...restUpdates] = availableUpdates
        if (!firstUpdate) return
        pendingInstallerUpdatesRef.current = restUpdates
        await handleUpdateAction(firstUpdate)
        return
      }

      pendingInstallerUpdatesRef.current = []
      for (const update of availableUpdates) {
        await handleUpdateAction(update)
      }
    },
    [handleUpdateAction, setUpdatesError, toLocalizedError],
  )

  const handleCloseInstallDialog = useCallback(() => {
    const update = inProgressUpdate
    if (!update) return
    const { installFinished: finishedMap } = useAppManagerStore.getState()
    const finished = finishedMap[update.appId]
    const nextQueuedUpdate =
      finished?.success && pendingInstallerUpdatesRef.current.length > 0
        ? (pendingInstallerUpdatesRef.current.shift() ?? null)
        : null

    if (finished) {
      setUpdateOperationStatus(update.appId, finished.success ? "success" : "error", finished.message)
      if (finished.success) {
        void checkAllUpdates(true)
        void onScanApps()
      }
    } else {
      pendingInstallerUpdatesRef.current = []
      setUpdateOperationStatus(update.appId, "idle")
    }

    if (finished && !finished.success) {
      pendingInstallerUpdatesRef.current = []
    }

    clearInstallProgress(update.appId)
    clearInstallFinished(update.appId)
    setInProgressUpdate(null)

    if (nextQueuedUpdate) {
      scheduleTimeout(() => {
        void handleUpdateAction(nextQueuedUpdate)
      }, 0)
    }
  }, [
    inProgressUpdate,
    checkAllUpdates,
    onScanApps,
    clearInstallFinished,
    clearInstallProgress,
    handleUpdateAction,
    scheduleTimeout,
    setUpdateOperationStatus,
  ])

  const runBatchOperation = useCallback(
    async (kind: "upgrade" | "uninstall", ids: string[]) => {
      if (ids.length === 0) return
      if (useAppManagerStore.getState().batchProgress?.running) return

      useAppManagerStore.setState({
        batchProgress: createBatchProgress(ids.length),
        batchResults: null,
      })
      const outcome = await appManagerUseCases.runBatchOperation(kind, ids)
      if (!outcome) return

      useAppManagerStore.setState(
        outcome.result
          ? createBatchSuccessPatch(outcome.result)
          : createBatchErrorPatch(outcome.error),
      )
      void onScanApps()
    },
    [onScanApps],
  )

  return {
    inProgressUpdate,
    refreshUpdates,
    checkAllUpdates,
    handleUpdateAction,
    handleUpdateSourceAction,
    handleCloseInstallDialog,
    runBatchOperation,
  }
}

function isOperationRunning(
  ops: Record<string, { status: string }>,
  appId: string,
): boolean {
  return ops[appId]?.status === "running"
}
