/**
 * Controller hook / 控制器: 浏览器扩展导出状态 + MCP 客户端写入; 只做编排，不碰 invoke 细节.
 *
 * 二者共用本机 bench-host 二进制（能力出口）。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  exportBrowserExtension,
  getBrowserExtensionStatus,
  getMcpTargetsStatus,
  installMcpClients,
  openBrowserExtensionsPage,
} from "@/lib/tauri/commands/browser-ext"
import { parseCommandError, type AppErrorShape } from "@/lib/tauri/errors"
import type {
  BrowserExtensionExport,
  BrowserExtensionStatus,
  McpTargetStatus,
} from "@/lib/tauri/types/browser-ext"

export function useBridgeController() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<BrowserExtensionStatus | null>(null)
  const [exportResult, setExportResult] = useState<BrowserExtensionExport | null>(null)
  const [mcpTargets, setMcpTargets] = useState<McpTargetStatus[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<AppErrorShape | null>(null)
  const refreshingRef = useRef(false)
  const exportingRef = useRef(false)
  const installingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setLoading(true)
    try {
      const [nextStatus, nextTargets] = await Promise.all([
        getBrowserExtensionStatus(),
        getMcpTargetsStatus(),
      ])
      setStatus(nextStatus)
      setMcpTargets(nextTargets)
      // 默认勾选「疑似已安装但未配置」的客户端
      setSelectedClients(
        nextTargets.filter((c) => c.installedHint && !c.benchConfigured).map((c) => c.id),
      )
      setError(null)
    } catch (rawError) {
      setError(parseCommandError(rawError))
    } finally {
      setLoading(false)
      refreshingRef.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const exportExtension = useCallback(async () => {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    try {
      const result = await exportBrowserExtension()
      // 用户取消选位置：什么都没发生，不要报成功，也不要跳扩展页。
      if (!result) return
      setExportResult(result)
      await refresh()
      toast.success(
        result.extensionVersion
          ? t("integrations.browser.exportedVersion", { version: result.extensionVersion })
          : t("integrations.browser.exported"),
      )
    } catch (rawError) {
      const parsed = parseCommandError(rawError)
      setError(parsed)
      toast.error(parsed.message)
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }, [refresh, t])

  const openExtensionsPage = useCallback(async (browserId: string) => {
    try {
      await openBrowserExtensionsPage(browserId)
    } catch (rawError) {
      toast.error(parseCommandError(rawError).message)
    }
  }, [])

  const toggleClient = useCallback((id: string, checked: boolean) => {
    setSelectedClients((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    )
  }, [])

  const writeMcp = useCallback(async () => {
    if (selectedClients.length === 0 || installingRef.current) return
    installingRef.current = true
    setInstalling(true)
    try {
      const results = await installMcpClients(selectedClients)
      const failed = results.filter((r) => !r.installed)
      if (failed.length > 0) {
        toast.error(`${t("integrations.mcp.failed")}: ${failed.map((f) => f.targetId).join(", ")}`)
      } else {
        toast.success(t("integrations.mcp.done"))
      }
      await refresh()
    } catch (rawError) {
      toast.error(parseCommandError(rawError).message)
    } finally {
      installingRef.current = false
      setInstalling(false)
    }
  }, [refresh, selectedClients, t])

  return {
    status,
    exportResult,
    mcpTargets,
    selectedClients,
    loading,
    exporting,
    installing,
    error,
    refresh,
    exportExtension,
    openExtensionsPage,
    toggleClient,
    writeMcp,
  }
}
