/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { getNextDataTableSorting } from "@/components/ui/DataTable"
import { createDevCleanerColumns } from "@/features/dev-cleaner/columns"
import { devCleanerUseCases } from "@/features/dev-cleaner/services/dev-cleaner.use-cases"
import { registerFeatureRefresh } from "@/features/refresh"
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration"
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types"
import { useDevCleanerStore, filterTypeMap } from "@/features/dev-cleaner/store"
import type { ProjectInfo } from "@/lib/tauri/types"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { writeClipboardText } from "@/platform/clipboard"
import { formatSize } from "@/lib/utils"
import { getErrorMessage } from "@/lib/tauri/errors"

export function useDevCleanerController() {
  const { t } = useTranslation()
  const canUsePlatformFeatures = canUseDesktopFeatures()

  const selectedPath = useDevCleanerStore((s) => s.selectedPath)
  const isScanning = useDevCleanerStore((s) => s.isScanning)
  const scanResult = useDevCleanerStore((s) => s.scanResult)
  const selectedProjects = useDevCleanerStore((s) => s.selectedProjects)
  const isCleaningUp = useDevCleanerStore((s) => s.isCleaningUp)
  const cleanupMessage = useDevCleanerStore((s) => s.cleanupMessage)
  const sorting = useDevCleanerStore((s) => s.sorting)
  const filterType = useDevCleanerStore((s) => s.filterType)
  const showConfirm = useDevCleanerStore((s) => s.showConfirm)
  const showFilterOptions = useDevCleanerStore((s) => s.showFilterOptions)

  const setSelectedPath = useDevCleanerStore((s) => s.setSelectedPath)
  const setFilterType = useDevCleanerStore((s) => s.setFilterType)
  const setShowConfirm = useDevCleanerStore((s) => s.setShowConfirm)
  const setShowFilterOptions = useDevCleanerStore((s) => s.setShowFilterOptions)
  const setSorting = useDevCleanerStore((s) => s.setSorting)
  const setSelectedProjects = useDevCleanerStore((s) => s.setSelectedProjects)

  const rescanTimerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (rescanTimerRef.current !== null) {
        window.clearTimeout(rescanTimerRef.current)
        rescanTimerRef.current = null
      }
    }
  }, [])

  const handleSelectPath = useCallback(async () => {
    try {
      const selected = await devCleanerUseCases.selectDirectory()
      if (selected && typeof selected === "string") {
        useDevCleanerStore.setState({ selectedPath: selected })
      }
    } catch (error) {
      useDevCleanerStore.setState({
        cleanupMessage: {
          type: "error",
          text: t("devCleaner.errors.openDirectoryFailed", { error: getErrorMessage(error) }),
        },
      })
    }
  }, [t])

  const handleScan = useCallback(async () => {
    const { selectedPath: currentSelectedPath } = useDevCleanerStore.getState()
    if (!currentSelectedPath) return

    useDevCleanerStore.setState({ isScanning: true, showConfirm: false, showFilterOptions: true })

    if (!devCleanerUseCases.isAvailable()) {
      useDevCleanerStore.setState({
        cleanupMessage: {
          type: "error",
          text: t("devCleaner.errors.desktopOnly"),
        },
        isScanning: false,
      })
      return
    }

    try {
      const result = await devCleanerUseCases.scanProjects(currentSelectedPath)
      useDevCleanerStore.setState({
        scanResult: result,
        selectedProjects: {},
        isScanning: false,
        cleanupMessage: devCleanerUseCases.createScanStoppedMessage(result, t),
      })
    } catch (error) {
      useDevCleanerStore.setState({
        cleanupMessage: {
          type: "error",
          text: t("devCleaner.errors.scanFailed", { error: getErrorMessage(error) }),
        },
        isScanning: false,
      })
    }
  }, [t])

  const handleStopScan = useCallback(async () => {
    try {
      await devCleanerUseCases.stopScan()
    } catch (error) {
      console.error("Failed to stop scan:", error)
    }
  }, [])

  const handleCleanup = useCallback(async () => {
    const { selectedProjects: currentSelectedProjects, scanResult: currentScanResult } =
      useDevCleanerStore.getState()
    const currentSelectedCount = Object.values(currentSelectedProjects).filter(Boolean).length
    if (currentSelectedCount === 0) return

    useDevCleanerStore.setState({ showConfirm: false, isCleaningUp: true, cleanupMessage: null })

    try {
      const projectsToCleanup = devCleanerUseCases.getSelectedProjects(
        currentScanResult,
        currentSelectedProjects,
      )
      const result = await devCleanerUseCases.cleanupProjects(projectsToCleanup)

      if (result.success) {
        useDevCleanerStore.setState({
          cleanupMessage: {
            type: "success",
            text: t("devCleaner.cleanupSuccess", { size: formatSize(result.cleaned_size) }),
          },
          selectedProjects: {},
        })
        // Auto-rescan after the success toast settles. The timer is tracked
        // in a ref so unmount cancels it — otherwise a fire-after-unmount
        // would kick off an orphan scan against torn-down state (#081).
        if (rescanTimerRef.current !== null) {
          window.clearTimeout(rescanTimerRef.current)
        }
        rescanTimerRef.current = window.setTimeout(() => {
          rescanTimerRef.current = null
          void handleScan()
        }, 1000)
      } else {
        useDevCleanerStore.setState({
          cleanupMessage: {
            type: "error",
            text: t("devCleaner.cleanupError", {
              error: result.errors?.join(", ") || t("devCleaner.errors.unknown"),
            }),
          },
        })
      }
    } catch (error) {
      useDevCleanerStore.setState({
        cleanupMessage: {
          type: "error",
          text: t("devCleaner.cleanupError", { error: getErrorMessage(error) }),
        },
      })
    } finally {
      useDevCleanerStore.setState({ isCleaningUp: false })
    }
  }, [handleScan, t])

  const filteredProjects = useMemo(() => {
    if (!scanResult) return []
    let filtered = scanResult.projects
    if (filterType !== "all") {
      filtered = filtered.filter((project) => project.project_type === filterTypeMap[filterType])
    }
    return filtered
  }, [filterType, scanResult])

  const projectsByPath = useMemo(
    () => new Map(scanResult?.projects.map((project) => [project.path, project]) ?? []),
    [scanResult],
  )

  const filteredCleanupSize = useMemo(
    () => filteredProjects.reduce((sum, project) => sum + project.cleanup_potential, 0),
    [filteredProjects],
  )

  const visibleProjectPathSet = useMemo(
    () => new Set(filteredProjects.map((project) => project.path)),
    [filteredProjects],
  )

  const selectedProjectPaths = useMemo(
    () =>
      Object.entries(selectedProjects)
        .filter(([, selected]) => selected)
        .map(([path]) => path),
    [selectedProjects],
  )

  const selectedCount = selectedProjectPaths.length

  const selectedSize = useMemo(
    () =>
      selectedProjectPaths.reduce(
        (sum, path) => sum + (projectsByPath.get(path)?.cleanup_potential || 0),
        0,
      ),
    [projectsByPath, selectedProjectPaths],
  )

  useEffect(() => {
    setSelectedProjects((current) => {
      if (Object.keys(current).length === 0) return current
      const next = Object.fromEntries(
        Object.entries(current).filter(
          ([path, selected]) => selected && visibleProjectPathSet.has(path),
        ),
      )
      if (Object.keys(next).length === Object.keys(current).length) return current
      return next
    })
  }, [visibleProjectPathSet, setSelectedProjects])

  useEffect(() => {
    if (selectedCount === 0 && showConfirm) {
      setShowConfirm(false)
    }
  }, [selectedCount, showConfirm, setShowConfirm])

  useEffect(() => registerFeatureRefresh("dev-cleaner", handleScan), [handleScan])

  const projectColumns = useMemo(() => createDevCleanerColumns(t), [t])

  const updateSorting = useCallback(
    (field: string, sortDescFirst = false) => {
      setSorting((current) => getNextDataTableSorting(current, field, sortDescFirst))
    },
    [setSorting],
  )

  const activeSortId = sorting[0]?.id

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await writeClipboardText(path)
    } catch {
      // clipboard write may fail in some environments
    }
  }, [])

  const getRowAttributes = useCallback(
    (project: ProjectInfo) => ({
      "data-context-type": "dev-cleaner-row",
      "data-row-id": project.path,
    }),
    [],
  )

  const devRegistration = useMemo(
    () =>
      ({
        id: "dev-cleaner-row",
        selector: '[data-context-type="dev-cleaner-row"]',
        resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
        buildMenu: (ctx: unknown): ContextMenuConfig | null => {
          const path = ctx as string
          if (!path) return null
          const project = projectsByPath.get(path)
          if (!project) return null
          return {
            id: "dev-cleaner-menu",
            items: [
              {
                id: "copy-path",
                label: t("devCleaner.copyPath"),
                icon: undefined,
                onClick: () => handleCopyPath(project.path),
              },
            ],
          }
        },
      }) satisfies ContextMenuRegistration,
    [projectsByPath, t, handleCopyPath],
  )

  useContextMenuRegistration(devRegistration)

  return {
    t,
    canUsePlatformFeatures,
    selectedPath,
    isScanning,
    scanResult,
    selectedProjects,
    isCleaningUp,
    cleanupMessage,
    sorting,
    filterType,
    showConfirm,
    showFilterOptions,
    filteredProjects,
    filteredCleanupSize,
    selectedCount,
    selectedSize,
    activeSortId,
    getRowAttributes,
    projectColumns,
    setSelectedPath,
    setFilterType,
    setShowConfirm,
    setShowFilterOptions,
    setSorting,
    setSelectedProjects,
    handleSelectPath,
    handleScan,
    handleStopScan,
    handleCleanup,
    updateSorting,
  }
}

export type DevCleanerController = ReturnType<typeof useDevCleanerController>
