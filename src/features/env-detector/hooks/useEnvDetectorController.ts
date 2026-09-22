/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import i18n from "@/i18n/config"
import type { FilterGroup } from "@/shared/compare/FilterBar"
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration"
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types"
import { createEnvDetectorColumns } from "@/features/env-detector/columns"
import { envDetectorUseCases } from "@/features/env-detector/services/env-detector.use-cases"
import { buildEnvSnapshot } from "@/features/env-detector/services/env-snapshot"
import { renderCiEnvManifest } from "@/features/env-detector/services/env-ci"
import { diffEnvTools } from "@/features/env-detector/services/env-diff"
import { EnvScanTimeoutError } from "@/features/env-detector/services/env-detector.repository"
import { useEnvDetectorStore } from "@/features/env-detector/store"
import { registerFeatureRefresh } from "@/features/refresh"
import type { EnvTool } from "@/lib/tauri/types"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { writeClipboardText } from "@/platform/clipboard"

type EnvFilterKey = "category" | "source" | "kind" | "status"

interface EnvFilterRow {
  id: string
  model: string
  category: string
  source: string
  kind: string
  status: string
}

function formatEnvFilterValue(key: EnvFilterKey, value: string): string {
  return i18n.t(`envDetector.filterValues.${key}.${value}`)
}

function isDeveloperSignal(tool: EnvTool): boolean {
  return !(tool.detector === "path-scan" && tool.category === "other")
}

export function useEnvDetectorController(active: boolean) {
  const { t } = useTranslation()
  const canUsePlatformFeatures = canUseDesktopFeatures()

  const tools = useEnvDetectorStore((s) => s.tools)
  const previousTools = useEnvDetectorStore((s) => s.previousTools)
  const loading = useEnvDetectorStore((s) => s.loading)
  const scanning = useEnvDetectorStore((s) => s.scanning)
  const error = useEnvDetectorStore((s) => s.error)
  const searchQuery = useEnvDetectorStore((s) => s.searchQuery)
  const filters = useEnvDetectorStore((s) => s.filters)
  const sorting = useEnvDetectorStore((s) => s.sorting)
  const scanned = useEnvDetectorStore((s) => s.scanned)
  const showAllCommands = useEnvDetectorStore((s) => s.showAllCommands)
  const viewMode = useEnvDetectorStore((s) => s.viewMode)

  const setSearchQuery = useEnvDetectorStore((s) => s.setSearchQuery)
  const setFilters = useEnvDetectorStore((s) => s.setFilters)
  const clearFilters = useEnvDetectorStore((s) => s.clearFilters)
  const setSorting = useEnvDetectorStore((s) => s.setSorting)
  const setShowAllCommands = useEnvDetectorStore((s) => s.setShowAllCommands)
  const setViewMode = useEnvDetectorStore((s) => s.setViewMode)

  const loadTools = useCallback(async () => {
    const { scanning: currentScanning, tools: prevTools } = useEnvDetectorStore.getState()
    if (currentScanning) return

    useEnvDetectorStore.setState({ loading: true, scanning: true, error: "", tools: [] })

    if (!envDetectorUseCases.isAvailable()) {
      useEnvDetectorStore.setState({ scanned: true, loading: false, scanning: false })
      return
    }

    try {
      const payload = await envDetectorUseCases.scanEnvTools()
      useEnvDetectorStore.setState({
        tools: [...payload.tools, ...payload.unavailable],
        // 保留本次扫描前的快照，供「较上次扫描」差异对比；仅在成功扫描时更新，
        // 失败（tools 清空）不动它，避免把失败误报成「全部移除」。
        previousTools: prevTools,
        loading: false,
        scanning: false,
        scanned: true,
      })
    } catch (error) {
      console.warn("[EnvDetector] Failed to detect tools:", error)
      const errorKey =
        error instanceof EnvScanTimeoutError ? "envDetector.scanTimedOut" : "envDetector.loadFailed"
      useEnvDetectorStore.setState({
        tools: [],
        error: i18n.t(errorKey),
        loading: false,
        scanning: false,
        scanned: true,
      })
    }
  }, [])

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setFilters((current) => {
        if (current[key] === value) {
          const next = { ...current }
          delete next[key]
          return next
        }
        return { ...current, [key]: value }
      })
    },
    [setFilters],
  )

  const handleCopyToClipboard = useCallback(async (text: string) => {
    try {
      await writeClipboardText(text)
    } catch {
      /* clipboard may be unavailable */
    }
  }, [])

  // 导出当前扫描到的环境清单到剪贴板；路径已脱敏（用户主目录 → <HOME>），不含凭据。
  const handleExportSnapshot = useCallback(async () => {
    const snapshot = buildEnvSnapshot(tools)
    if (!snapshot) {
      toast.info(t("envDetector.exportEmpty"))
      return
    }
    try {
      await writeClipboardText(`${t("envDetector.exportTitle")}\n\n${snapshot}`)
      toast.success(t("envDetector.exportCopied"))
    } catch {
      toast.error(t("envDetector.exportFailed"))
    }
  }, [tools, t])

  // 生成 CI 版本清单（asdf .tool-versions 风格），带所选目标平台标题，复制到剪贴板。
  const [ciPlatform, setCiPlatform] = useState("macos")
  const handleExportCiTemplate = useCallback(async () => {
    const body = renderCiEnvManifest(tools)
    if (!body) {
      toast.info(t("envDetector.exportEmpty"))
      return
    }
    const platformLabel =
      ciPlatform === "windows"
        ? t("envDetector.platformWindows")
        : ciPlatform === "linux"
          ? t("envDetector.platformLinux")
          : t("envDetector.platformMacos")
    const header = `${t("envDetector.ciHeader")} · ${t("envDetector.ciTargetPlatform")} ${platformLabel}`
    try {
      await writeClipboardText(`${header}\n${body}`)
      toast.success(t("envDetector.exportCopied"))
    } catch {
      toast.error(t("envDetector.exportFailed"))
    }
  }, [tools, ciPlatform, t])

  const getRowAttributes = useCallback(
    (tool: EnvTool) => ({
      "data-context-type": "env-detector-row",
      "data-row-id": tool.path || tool.name,
    }),
    [],
  )

  const envRegistration = useMemo(
    () =>
      ({
        id: "env-detector-row",
        selector: '[data-context-type="env-detector-row"]',
        resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
        buildMenu: (ctx: unknown): ContextMenuConfig | null => {
          const key = ctx as string
          if (!key) return null
          const tool = tools.find((item) => (item.path || item.name) === key)
          if (!tool) return null
          const items: ContextMenuConfig["items"] = [
            {
              id: "copy-path",
              label: t("envDetector.copyPath"),
              icon: undefined,
              onClick: () => handleCopyToClipboard(tool.path || tool.name),
            },
          ]
          if (tool.version) {
            items.push({
              id: "copy-version",
              label: t("envDetector.copyVersion"),
              icon: undefined,
              onClick: () => handleCopyToClipboard(tool.version),
            })
          }
          return { id: "env-detector-menu", items }
        },
      }) satisfies ContextMenuRegistration,
    [tools, t, handleCopyToClipboard],
  )

  useContextMenuRegistration(envRegistration)

  useEffect(() => {
    if (active && canUsePlatformFeatures && !scanned) {
      void loadTools()
    }
  }, [active, canUsePlatformFeatures, loadTools, scanned])

  useEffect(() => registerFeatureRefresh("env-detector", loadTools), [loadTools])

  const filterGroups = useMemo<FilterGroup<EnvFilterRow>[]>(
    () => [
      {
        key: "category",
        label: "envDetector.filterGroups.category",
        format: (value) => formatEnvFilterValue("category", String(value)),
      },
      {
        key: "source",
        label: "envDetector.filterGroups.source",
        format: (value) => formatEnvFilterValue("source", String(value)),
      },
      {
        key: "kind",
        label: "envDetector.filterGroups.kind",
        format: (value) => formatEnvFilterValue("kind", String(value)),
      },
      {
        key: "status",
        label: "envDetector.filterGroups.status",
        format: (value) => formatEnvFilterValue("status", String(value)),
      },
    ],
    [],
  )

  const statusCounts = useMemo(
    () => ({
      total: tools.length,
      available: tools.filter((tool) => tool.available).length,
      unavailable: tools.filter((tool) => !tool.available).length,
    }),
    [tools],
  )

  const filterRows = useMemo<EnvFilterRow[]>(
    () =>
      tools.map((tool) => ({
        id: tool.name,
        model: tool.name,
        category: tool.category,
        source: tool.source,
        kind: tool.kind,
        status: tool.status,
      })),
    [tools],
  )

  const matchingTools = useMemo(
    () =>
      tools.filter((tool) => {
        const matchesSearch =
          !searchQuery ||
          tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.detector.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesFilters = Object.entries(filters).every(
          ([key, value]) => !value || String(tool[key as EnvFilterKey]) === value,
        )

        return matchesSearch && matchesFilters
      }),
    [filters, searchQuery, tools],
  )

  const missingTools = useMemo(
    () => matchingTools.filter((tool) => !tool.available),
    [matchingTools],
  )

  const displayedTools = useMemo(
    () =>
      matchingTools.filter((tool) => {
        if (!tool.available) return false
        return showAllCommands || isDeveloperSignal(tool)
      }),
    [matchingTools, showAllCommands],
  )

  const hasActiveResultFilter = searchQuery.trim().length > 0 || Object.keys(filters).length > 0

  const tableColumns = useMemo(() => createEnvDetectorColumns(t), [t])

  // 「较上次扫描」差异：仅在有两次成功扫描结果时非空（diffEnvTools 内含空侧短路）。
  const scanDiff = useMemo(() => diffEnvTools(previousTools, tools), [previousTools, tools])

  return {
    t,
    canUsePlatformFeatures,
    tools,
    loading,
    scanning,
    error,
    searchQuery,
    filters,
    sorting,
    scanned,
    showAllCommands,
    viewMode,
    filterGroups,
    statusCounts,
    filterRows,
    missingTools,
    displayedTools,
    hasActiveResultFilter,
    scanDiff,
    tableColumns,
    setSearchQuery,
    setSorting,
    setShowAllCommands,
    setViewMode,
    handleFilterChange,
    clearFilters,
    loadTools,
    handleExportSnapshot,
    ciPlatform,
    setCiPlatform,
    handleExportCiTemplate,
    getRowAttributes,
  }
}

export type EnvDetectorController = ReturnType<typeof useEnvDetectorController>
