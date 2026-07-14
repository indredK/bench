/**
 * Custom Folder Cleaner Tool / 自定义文件夹清理工具.
 * Compact layout: toolbar row + scrollable results list.
 */
import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { FolderOpen, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RiskPill } from "@/features/clean-space/components/shared/RiskPill"
import { scanCustomFolder } from "@/features/clean-space/services/clean-space.repository"
import { formatSize } from "@/lib/utils"
import { getErrorMessage } from "@/lib/tauri/errors"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { openPlatformDialog } from "@/platform/dialog"
import type { FolderScanResult } from "@/lib/tauri/types/clean-space"

export function CustomFolderCleanerTool() {
  const { t } = useTranslation()
  const canUsePlatform = canUseDesktopFeatures()

  const [folder, setFolder] = useState("")
  const [mtimeDays, setMtimeDays] = useState(30)
  const [includeSubfolders, setIncludeSubfolders] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [result, setResult] = useState<FolderScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleBrowse = useCallback(async () => {
    const picked = await openPlatformDialog({ directory: true, multiple: false })
    if (typeof picked === "string" && picked.length > 0) {
      setFolder(picked)
    }
  }, [])

  const handleScan = useCallback(async () => {
    if (!folder.trim()) return
    setIsScanning(true)
    setError(null)
    setResult(null)
    try {
      const res = await scanCustomFolder(folder, mtimeDays, includeSubfolders)
      setResult(res)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsScanning(false)
    }
  }, [folder, mtimeDays, includeSubfolders])

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar row: folder + rules + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder={t("cleanSpace.customFolder.folderPlaceholder")}
          className="h-8 min-w-0 flex-1 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={handleBrowse}
          disabled={!canUsePlatform}
        >
          <FolderOpen size={13} className="mr-1" />
          {t("cleanSpace.customFolder.browse")}
        </Button>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">{t("cleanSpace.customFolder.mtimeDays")}:</span>
          <Input
            type="number"
            value={mtimeDays}
            onChange={(e) => setMtimeDays(Number(e.target.value) || 30)}
            className="h-7 w-14 text-xs"
            min={1}
          />
        </div>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={includeSubfolders}
            onChange={(e) => setIncludeSubfolders(e.target.checked)}
            className="accent-primary h-3.5 w-3.5"
          />
          <span className="text-muted-foreground whitespace-nowrap">
            {t("cleanSpace.customFolder.includeSubfolders")}
          </span>
        </label>
        <Button
          onClick={handleScan}
          disabled={!folder.trim() || isScanning || !canUsePlatform}
          size="sm"
          className="h-8"
        >
          {isScanning ? (
            <Loader2 size={13} className="mr-1 animate-spin" />
          ) : (
            <Trash2 size={13} className="mr-1" />
          )}
          {t("cleanSpace.customFolder.scan")}
        </Button>
      </div>

      {error && (
        <div className="text-destructive text-xs">
          {t("cleanSpace.scanFailed")}: {error}
        </div>
      )}

      {/* Results summary bar */}
      {result && (
        <div className="flex flex-wrap items-center gap-x-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t("cleanSpace.customFolder.foundItems")}</span>
            <span className="font-semibold">{result.item_count}</span>
          </div>
          <div className="bg-border h-3 w-px" />
          <div className="flex items-center gap-1.5">
            <span className="text-green-700 dark:text-green-300">
              {t("cleanSpace.customFolder.estFreed")}
            </span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {formatSize(result.freed_bytes)}
            </span>
          </div>
        </div>
      )}

      {/* Scrollable results list */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {result?.items.length === 0 && (
          <div className="text-muted-foreground flex flex-1 items-center justify-center py-8 text-sm">
            {t("cleanSpace.emptyState")}
          </div>
        )}
        {result?.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{item.name}</span>
                <RiskPill level={item.risk_level} />
              </div>
              <div className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
                {item.path}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs font-semibold">
              {formatSize(item.size_bytes)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
