/**
 * Controller / 控制器: bind quick launch page state; 连接场景分类、扫描与导出.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useQuickLaunchStore } from "@/features/quick-launch/store"
import { LAUNCH_SCENES } from "@/features/quick-launch/scenes"
import {
  autoClassifyApps,
  applyOverrides,
  exportFullClassification,
} from "@/features/quick-launch/services/quick-launch.use-cases"
import { writeTextFile } from "@/lib/tauri/commands/file-ops"
import { getErrorMessage } from "@/lib/tauri/errors"
import { savePlatformDialog } from "@/platform/dialog"
import { useAppInventoryStore } from "@/shared/app-inventory/store"
import { appInventoryUseCases } from "@/shared/app-inventory/inventory.use-cases"
import { useGuardedAsyncSet } from "@/hooks/useGuardedAsync"
import type { AppInfo } from "@/lib/tauri/types/app-manager"
import type { LaunchSceneKey } from "@/features/quick-launch/types"
import type { OverridePersistenceIssue } from "@/features/quick-launch/store"

/** 合并到「常用应用」Tab 下的场景 key */
export const MERGED_SCENE_KEYS: LaunchSceneKey[] = [
  "ai-ide",
  "ai-claw",
  "ai-assistant",
  "ai-office",
  "ai-model",
  "ai-tool",
  "dev",
  "system",
]

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
}

/** 会话内已弹过通知的持久化异常值，避免重进页面重复弹窗（用户手动关闭后才视为已处理） */
let lastNotifiedIssue: OverridePersistenceIssue = null

export function useQuickLaunchController(active: boolean) {
  const { t, i18n } = useTranslation()
  const { run: runLaunchAction } = useGuardedAsyncSet<string>()

  const inventorySnapshot = useAppInventoryStore((s) => s.snapshot)
  const inventoryStatus = useAppInventoryStore((s) => s.status)
  const inventoryError = useAppInventoryStore((s) => s.error)
  const appManagerApps = inventorySnapshot?.apps ?? []
  const appManagerScanned = inventorySnapshot !== null
  const appManagerLoading = inventoryStatus === "loading" || inventoryStatus === "refreshing"
  const appManagerScanProgress = useAppInventoryStore((s) => s.progress)
  const inventoryMessage = useMemo(() => {
    if (inventoryError) return inventoryError
    if (inventoryStatus !== "partial") return null
    const providers = (inventorySnapshot?.providers ?? [])
      .filter((provider) => provider.state !== "ok")
      .map((provider) => provider.provider)
      .join(", ")
    return t("quickLaunch.scanPartial", { providers })
  }, [inventoryError, inventorySnapshot?.providers, inventoryStatus, t])

  const scenes = useQuickLaunchStore((s) => s.scenes)
  const sceneOrder = useQuickLaunchStore((s) => s.sceneOrder)
  const expandedScenes = useQuickLaunchStore((s) => s.expandedScenes)
  const searchQuery = useQuickLaunchStore((s) => s.searchQuery)
  const loading = useQuickLaunchStore((s) => s.loading)
  const isEditMode = useQuickLaunchStore((s) => s.isEditMode)
  const appOverrides = useQuickLaunchStore((s) => s.appOverrides)
  const overridePersistenceIssue = useQuickLaunchStore((s) => s.overridePersistenceIssue)
  const autoClassified = useQuickLaunchStore((s) => s.autoClassified)

  const setLoading = useQuickLaunchStore((s) => s.setLoading)
  const setSearchQuery = useQuickLaunchStore((s) => s.setSearchQuery)
  const toggleExpandScene = useQuickLaunchStore((s) => s.toggleExpandScene)
  const batchSetScenes = useQuickLaunchStore((s) => s.batchSetScenes)
  const toggleEditMode = useQuickLaunchStore((s) => s.toggleEditMode)
  const loadOverrides = useQuickLaunchStore((s) => s.loadOverrides)
  const resetOverrides = useQuickLaunchStore((s) => s.resetOverrides)
  const moveAppToSceneOverride = useQuickLaunchStore((s) => s.moveAppToSceneOverride)
  const setAutoClassified = useQuickLaunchStore((s) => s.setAutoClassified)

  const [contextMenu, setContextMenu] = useState<{ appId: string; x: number; y: number } | null>(
    null,
  )
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const [exporting, setExporting] = useState(false)

  // 右键菜单边界检测：超出视口时翻转
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const menu = contextMenuRef.current
    const rect = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8

    const style: React.CSSProperties = {}

    if (contextMenu.y + rect.height + margin > vh) {
      style.bottom = `${vh - contextMenu.y}px`
      style.top = "auto"
    } else {
      style.top = `${contextMenu.y}px`
      style.bottom = "auto"
    }
    if (contextMenu.x + rect.width + margin > vw) {
      style.right = `${vw - contextMenu.x}px`
      style.left = "auto"
    } else {
      style.left = `${contextMenu.x}px`
      style.right = "auto"
    }

    setMenuStyle(style)
  }, [contextMenu])

  const inventoryRevisionRef = useRef<number | null>(null)

  // Auto-classify + load overrides whenever the shared inventory revision changes.
  useEffect(() => {
    if (!active) return
    const revision = inventorySnapshot?.revision ?? null
    if (appManagerScanned && revision !== null && inventoryRevisionRef.current !== revision) {
      inventoryRevisionRef.current = revision
      loadOverrides()
      const classified = autoClassifyApps(appManagerApps.filter((app) => app.allowedActions.launch))
      setAutoClassified(classified)
      const overrides = useQuickLaunchStore.getState().appOverrides
      const map = new Map(appManagerApps.map((a) => [a.appId, a]))
      const final = applyOverrides(classified, overrides, map)
      batchSetScenes(final)
    }
  }, [
    active,
    appManagerScanned,
    appManagerApps,
    inventorySnapshot?.revision,
    loadOverrides,
    setAutoClassified,
    batchSetScenes,
  ])

  // Sync loading state from App Manager
  useEffect(() => {
    setLoading(appManagerLoading)
  }, [appManagerLoading, setLoading])

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    return () => {
      window.removeEventListener("click", close)
    }
  }, [contextMenu])

  // 分类持久化异常：以「必须手动关闭」的重要通知呈现，不自动消失。
  // 用会话级守卫避免重进页面重复弹；异常清除后守卫复位，下次再出现会重新提示。
  useEffect(() => {
    if (!overridePersistenceIssue) {
      lastNotifiedIssue = null
      return
    }
    if (lastNotifiedIssue === overridePersistenceIssue) return
    lastNotifiedIssue = overridePersistenceIssue
    const message = t(`common.persistence.${overridePersistenceIssue}`)
    if (overridePersistenceIssue === "recovered") {
      toast.warning(message, { duration: Infinity })
    } else {
      toast.error(message, { duration: Infinity })
    }
  }, [overridePersistenceIssue, t])

  const appMap = useMemo(() => new Map(appManagerApps.map((a) => [a.appId, a])), [appManagerApps])

  const sceneApps = useMemo(() => {
    const result: Record<LaunchSceneKey, AppInfo[]> = {} as Record<LaunchSceneKey, AppInfo[]>
    for (const key of sceneOrder) {
      const ids = scenes[key] || []
      result[key] = ids.map((id) => appMap.get(id)).filter((a): a is AppInfo => !!a)

      if (searchQuery) {
        const q = normalizeSearch(searchQuery.trim())
        const scene = LAUNCH_SCENES.find((candidate) => candidate.key === key)
        const sceneMatches = scene ? normalizeSearch(t(scene.labelKey)).includes(q) : false
        if (!sceneMatches) {
          result[key] = result[key].filter((app) =>
            normalizeSearch(`${app.name} ${app.bundleId} ${app.source}`).includes(q),
          )
        }
      }
    }
    return result
  }, [scenes, sceneOrder, appMap, searchQuery, i18n.resolvedLanguage, t])

  const appIdToScene = useMemo(() => {
    const map: Record<string, LaunchSceneKey> = {}
    for (const key of sceneOrder) {
      for (const id of scenes[key] || []) {
        map[id] = key
      }
    }
    return map
  }, [scenes, sceneOrder])

  const totalApps = useMemo(
    () => Object.values(sceneApps).reduce((sum, apps) => sum + apps.length, 0),
    [sceneApps],
  )

  const sceneCount = useMemo(() => {
    let count = 0
    let mergedHasApps = false
    for (const key of sceneOrder) {
      const has = (sceneApps[key]?.length || 0) > 0
      if (MERGED_SCENE_KEYS.includes(key)) {
        if (has) mergedHasApps = true
      } else if (has) {
        count++
      }
    }
    return count + (mergedHasApps ? 1 : 0)
  }, [sceneOrder, sceneApps])

  const handleLaunch = useCallback(
    async (app: AppInfo) => {
      if (isEditMode) return
      await runLaunchAction(`launch:${app.appId}`, async () => {
        try {
          await appInventoryUseCases.launch(app.appId)
        } catch (error) {
          toast.error(
            t("quickLaunch.toasts.launchFailed", {
              name: app.name,
              defaultValue: getErrorMessage(error),
            }),
          )
        }
      })
    },
    [isEditMode, runLaunchAction, t],
  )

  const handleReveal = useCallback(
    async (app: AppInfo) => {
      await runLaunchAction(`reveal:${app.appId}`, async () => {
        try {
          await appInventoryUseCases.reveal(app.appId)
        } catch (error) {
          toast.error(
            t("quickLaunch.toasts.revealFailed", {
              name: app.name,
              defaultValue: getErrorMessage(error),
            }),
          )
        }
      })
    },
    [runLaunchAction, t],
  )

  const handleContextMenuEdit = useCallback(
    (app: AppInfo, x: number, y: number) => {
      if (appManagerLoading) return
      setContextMenu({ appId: app.appId, x, y })
    },
    [appManagerLoading],
  )

  const handleMoveApp = useCallback(
    (appId: string, sceneKey: LaunchSceneKey) => {
      if (appManagerLoading) return
      moveAppToSceneOverride(appId, sceneKey)
      setContextMenu(null)
    },
    [appManagerLoading, moveAppToSceneOverride],
  )

  const handleResetOverrides = useCallback(() => {
    if (appManagerLoading) return
    resetOverrides()
    const classified = useQuickLaunchStore.getState().autoClassified
    if (Object.keys(classified).length > 0) {
      batchSetScenes(classified)
    }
    toast.success(t("quickLaunch.toasts.resetSuccess"))
  }, [appManagerLoading, resetOverrides, batchSetScenes, t])

  const handleExportOverrides = useCallback(async () => {
    if (appManagerLoading || appManagerApps.length === 0 || exporting) return
    const overrides = useQuickLaunchStore.getState().appOverrides
    const classified = autoClassifyApps(appManagerApps.filter((app) => app.allowedActions.launch))
    const data = exportFullClassification(appManagerApps, classified, overrides)
    if (data.length === 0) return

    const selectedPath = await savePlatformDialog({
      canCreateDirectories: true,
      defaultPath: "quick-launch-classification.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!selectedPath) return

    setExporting(true)
    try {
      await writeTextFile(selectedPath, JSON.stringify(data, null, 2))
      toast.success(t("quickLaunch.toasts.exportSuccess", { count: data.length }))
    } catch (error) {
      toast.error(t("quickLaunch.toasts.exportFailed", { defaultValue: getErrorMessage(error) }))
    } finally {
      setExporting(false)
    }
  }, [appManagerApps, appManagerLoading, exporting, t])

  const handleRescan = useCallback(async () => {
    if (loading) return
    if (appManagerLoading) return
    try {
      setLoading(true)
      await appInventoryUseCases.refresh()
    } catch (error) {
      toast.error(t("quickLaunch.toasts.scanFailed", { defaultValue: getErrorMessage(error) }))
    } finally {
      setLoading(false)
    }
  }, [appManagerLoading, loading, setLoading, t])

  const handleCancelScan = useCallback(async () => {
    try {
      await appInventoryUseCases.cancel()
    } catch (error) {
      toast.error(t("quickLaunch.toasts.cancelFailed", { defaultValue: getErrorMessage(error) }))
    }
  }, [t])

  // Auto-start scan when entering quick launch and no scan has been done yet
  useEffect(() => {
    if (!active) return
    if (appManagerScanned) return
    if (loading || appManagerLoading) return
    handleRescan()
  }, [active, appManagerScanned, loading, appManagerLoading, handleRescan])

  const mergedSceneSet = useMemo(() => new Set(MERGED_SCENE_KEYS), [])
  const firstMergedKey = MERGED_SCENE_KEYS[0]

  return {
    appManagerApps,
    appManagerScanned,
    appManagerLoading,
    appManagerScanProgress,
    inventoryError: inventoryMessage,
    scenes,
    sceneOrder,
    expandedScenes,
    searchQuery,
    loading,
    isEditMode,
    appOverrides,
    overridePersistenceIssue,
    autoClassified,
    setSearchQuery,
    toggleExpandScene,
    toggleEditMode,
    contextMenu,
    contextMenuRef,
    menuStyle,
    exporting,
    sceneApps,
    appIdToScene,
    totalApps,
    sceneCount,
    mergedSceneSet,
    firstMergedKey,
    handleLaunch,
    handleReveal,
    handleContextMenuEdit,
    handleMoveApp,
    handleResetOverrides,
    handleExportOverrides,
    handleRescan,
    handleCancelScan,
  }
}

export type QuickLaunchController = ReturnType<typeof useQuickLaunchController>
