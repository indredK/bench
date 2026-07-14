/**
 * Storage Overview / 存储总览: compact header + stacked bar + donut chart + category list.
 * Donut, bar, legend, and category list all cross-highlight on hover.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCleanSpaceStore } from "@/features/clean-space/store"
import { loadOverview } from "@/features/clean-space/services/clean-space.use-cases"
import * as repository from "@/features/clean-space/services/clean-space.repository"
import { cn, formatSize } from "@/lib/utils"
import { getErrorMessage } from "@/lib/tauri/errors"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import type { StorageCategory } from "@/lib/tauri/types/clean-space"

function resolveChartColor(color: string | undefined): string {
  if (!color) return "hsl(var(--chart-1))"
  if (color.startsWith("var(")) return `hsl(${color})`
  return color
}

/** SVG Donut Chart — fills a square parent via viewBox scaling */
function DonutChart({
  categories,
  totalUsed,
  freeBytes,
  diskTotal,
  hoveredId,
  onHover,
  className,
}: {
  categories: StorageCategory[]
  totalUsed: number
  freeBytes: number
  diskTotal: number
  hoveredId: string | null
  onHover: (id: string | null) => void
  className?: string
}) {
  const { t } = useTranslation()
  const r = 78
  const cx = 100
  const cy = 100
  const circumference = 2 * Math.PI * r
  let offset = 0

  const segments = categories
    .filter((cat) => cat.total_bytes > 0)
    .map((cat) => {
      const frac = totalUsed > 0 ? cat.total_bytes / totalUsed : 0
      const len = frac * circumference
      const seg = { cat, len, offset }
      offset += len
      return seg
    })

  return (
    <svg
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid meet"
      className={cn("size-full", className)}
      aria-hidden
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="22" />
      {segments.map(({ cat, len, offset: off }) => {
        const isDimmed = hoveredId !== null && hoveredId !== cat.id
        const isHot = hoveredId === cat.id
        return (
          <circle
            key={cat.id}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={resolveChartColor(cat.color)}
            strokeWidth={isHot ? 26 : 22}
            strokeDasharray={`${len} ${circumference - len}`}
            strokeDashoffset={-off}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="cursor-pointer transition-all duration-150"
            style={{ opacity: isDimmed ? 0.3 : 1 }}
            onMouseEnter={() => onHover(cat.id)}
            onMouseLeave={() => onHover(null)}
          />
        )
      })}
      <text
        x="100"
        y="94"
        textAnchor="middle"
        className="fill-foreground font-semibold"
        fontSize="22"
      >
        {formatSize(freeBytes)}
      </text>
      <text x="100" y="112" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
        {t("cleanSpace.overview.freeOfTotal", { total: formatSize(diskTotal) })}
      </text>
    </svg>
  )
}

/** Category list row */
function CategoryRow({
  cat,
  diskTotal,
  hoveredId,
  onHover,
  onClick,
  catName,
  isScanning,
  maxCategoryBytes,
}: {
  cat: StorageCategory
  diskTotal: number
  hoveredId: string | null
  onHover: (id: string | null) => void
  onClick: () => void
  catName: string
  isScanning?: boolean
  maxCategoryBytes: number
}) {
  const pct = diskTotal > 0 ? (cat.total_bytes / diskTotal) * 100 : 0
  const barPct = maxCategoryBytes > 0 ? (cat.total_bytes / maxCategoryBytes) * 100 : 0
  const isHot = hoveredId === cat.id
  const isDimmed = hoveredId !== null && hoveredId !== cat.id

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 transition-all @[280px]/list:flex-row @[280px]/list:items-center @[280px]/list:gap-2.5",
        "cursor-pointer",
        isHot && "bg-primary/10",
        isDimmed && "opacity-40",
        !isHot && !isDimmed && "hover:bg-accent/50",
      )}
      onMouseEnter={() => onHover(cat.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="h-2 w-2 shrink-0 rounded-sm"
          style={{ backgroundColor: resolveChartColor(cat.color) }}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={catName}>
          {catName}
        </span>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums @[280px]/list:hidden">
          {formatSize(cat.total_bytes)}
        </span>
        {isScanning ? (
          <Loader2 size={13} className="text-muted-foreground shrink-0 animate-spin" />
        ) : (
          <ChevronRight size={13} className="text-muted-foreground shrink-0" />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 pl-4 @[280px]/list:flex-1 @[280px]/list:justify-end @[280px]/list:pl-0">
        <span className="text-muted-foreground hidden shrink-0 text-[11px] tabular-nums @[280px]/list:inline">
          {formatSize(cat.total_bytes)}
        </span>
        <div className="bg-muted h-1 min-w-0 flex-1 overflow-hidden rounded-full @[280px]/list:max-w-16 @[280px]/list:flex-none">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(barPct, 100)}%`,
              backgroundColor: resolveChartColor(cat.color),
            }}
          />
        </div>
        <span className="text-muted-foreground w-9 shrink-0 text-right text-[11px] tabular-nums">
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

/** Square chart — height of the chart row drives size; always 1:1, capped at 420px */
function ChartFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 shrink-0 items-center self-stretch">
      <div className="bg-muted/35 box-border aspect-square h-full max-h-[420px] min-h-0 w-auto max-w-[420px] rounded-lg p-2 sm:p-3">
        {children}
      </div>
    </div>
  )
}

export function StorageOverview({ className }: { className?: string }) {
  const { t } = useTranslation()
  const overview = useCleanSpaceStore((s) => s.overview)
  const isScanning = useCleanSpaceStore((s) => s.isScanning)
  const scanError = useCleanSpaceStore((s) => s.scanError)
  const setSelectedCategoryId = useCleanSpaceStore((s) => s.setSelectedCategoryId)
  const canUsePlatform = canUseDesktopFeatures()

  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Auto-scan on mount
  useEffect(() => {
    if (!overview && !isScanning && canUsePlatform) {
      loadOverview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleScan = () => {
    loadOverview()
  }

  const handleOpenSettings = async () => {
    try {
      await repository.openSystemStorageSettings()
    } catch (err) {
      console.warn("[clean-space] openSystemStorageSettings failed:", getErrorMessage(err))
    }
  }

  const categories = overview?.categories ?? []
  const diskTotal = overview?.disk_total_bytes ?? 0

  const usedBytes = useMemo(
    () => categories.reduce((sum, c) => sum + c.total_bytes, 0),
    [categories],
  )
  const freeBytes = diskTotal > usedBytes ? diskTotal - usedBytes : 0
  const displayCategories = useMemo(
    () => [...categories].sort((a, b) => b.total_bytes - a.total_bytes),
    [categories],
  )
  const topCategory = displayCategories.find((category) => category.total_bytes > 0) ?? null
  const maxCategoryBytes = topCategory?.total_bytes ?? 0

  const suggestionStats = useMemo(() => {
    const systemData = categories.find((c) => c.id === "system_data")?.total_bytes ?? 0
    const downloads = categories.find((c) => c.id === "downloads")?.total_bytes ?? 0
    const safeBytes = systemData + downloads

    const nonMacOS = categories.filter((c) => c.id !== "macos" && c.id !== "other_users")
    const totalCleanable = nonMacOS.reduce((s, c) => s + c.total_bytes, 0)

    // High-risk estimate: developer category (Docker, Xcode archives, etc.)
    const developerBytes = categories.find((c) => c.id === "developer")?.total_bytes ?? 0
    const highCount = developerBytes > 0 ? 1 : 0

    return { safeBytes, totalCleanable, highCount }
  }, [categories])

  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      {/* Compact header */}
      <CardHeader className="flex shrink-0 flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm">{t("cleanSpace.overview.title")}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          {canUsePlatform && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleOpenSettings}>
                  <ExternalLink size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("cleanSpace.openInSystemSettings")}</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={handleScan}
            disabled={isScanning || !canUsePlatform}
          >
            {isScanning ? (
              <Loader2 size={12} className="mr-1 animate-spin" />
            ) : (
              <RefreshCw size={12} className="mr-1" />
            )}
            {t("cleanSpace.overview.scan")}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pb-4">
        {scanError && (
          <div className="text-destructive text-xs">
            {t("cleanSpace.scanFailed")}: {scanError}
          </div>
        )}

        {/* Rescan progress indicator */}
        {isScanning && overview && (
          <div className="bg-primary/30 h-0.5 w-full animate-pulse rounded-full" />
        )}

        {/* Skeleton: first scan, no data yet — mirrors real layout */}
        {isScanning && !overview && (
          <div className="flex animate-pulse flex-col gap-4">
            {/* Disk summary */}
            <div className="flex gap-4">
              <div className="bg-muted h-5 w-28 rounded" />
              <div className="bg-muted h-5 w-20 rounded" />
            </div>
            {/* Donut chart + category list */}
            <div className="flex min-w-0 shrink-0 flex-col rounded-xl border p-3 sm:p-4">
              <div className="bg-muted mb-3 h-4 w-20 rounded" />
              <div className="flex gap-2 sm:gap-3">
                <div className="bg-muted/35 aspect-square h-40 max-h-[420px] w-auto max-w-[420px] shrink-0 rounded-lg sm:h-48" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex min-w-0 flex-col gap-1.5 rounded-md px-2.5 py-2 sm:flex-row sm:items-center sm:gap-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="bg-muted h-2.5 w-2.5 shrink-0 rounded-sm" />
                        <div className="bg-muted h-3.5 min-w-0 flex-1 rounded" />
                        <div className="bg-muted h-3 w-11 rounded sm:hidden" />
                        <div className="bg-muted h-3.5 w-3.5 rounded" />
                      </div>
                      <div className="flex min-w-0 items-center gap-2 pl-[18px] sm:flex-1 sm:pl-0">
                        <div className="bg-muted hidden h-3 w-16 rounded sm:block" />
                        <div className="bg-muted h-1.5 min-w-0 flex-1 rounded-full sm:max-w-20 sm:flex-none" />
                        <div className="bg-muted h-3 w-11 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Suggestion card */}
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:gap-3.5 sm:p-4">
              <div className="bg-muted h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="bg-muted h-4 w-20 rounded" />
                <div className="bg-muted h-3 w-full rounded" />
                <div className="bg-muted h-3 w-3/4 rounded" />
                <div className="flex gap-5 pt-1">
                  <div className="bg-muted h-8 w-12 rounded" />
                  <div className="bg-muted h-8 w-16 rounded" />
                  <div className="bg-muted h-8 w-10 rounded" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Streaming indicator: scan in progress with partial data */}
        {isScanning && overview && categories.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 size={16} className="text-primary animate-spin" />
            <span className="text-muted-foreground text-xs">
              {t("cleanSpace.overview.scanning")}
            </span>
          </div>
        )}

        {/* Empty state: not scanning, no data */}
        {!overview && !isScanning && (
          <div className="text-muted-foreground py-8 text-center text-xs">
            {t("cleanSpace.overview.clickToScan")}
          </div>
        )}

        {/* Real data */}
        {overview && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden transition-opacity">
            {/* Disk summary */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{t("cleanSpace.overview.totalDisk")}</span>
                <span className="font-semibold">{formatSize(diskTotal)}</span>
              </div>
              <div className="bg-border hidden h-3 w-px sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-green-700 dark:text-green-300">
                  {t("cleanSpace.overview.free")}
                </span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {formatSize(freeBytes)}
                </span>
              </div>
            </div>

            {/* Donut Chart + Category List — flex-1, only the list scrolls internally */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border p-3 sm:p-4">
              <h3 className="mb-2 shrink-0 text-sm font-semibold">
                {t("cleanSpace.overview.categoryDetail")}
              </h3>
              <div className="flex min-h-0 flex-1 items-stretch gap-2 sm:gap-3">
                <ChartFrame>
                  <DonutChart
                    categories={displayCategories}
                    totalUsed={usedBytes}
                    freeBytes={freeBytes}
                    diskTotal={diskTotal}
                    hoveredId={hoveredId}
                    onHover={setHoveredId}
                  />
                </ChartFrame>
                <div className="@container/list flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto">
                  {displayCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      cat={cat}
                      diskTotal={diskTotal}
                      hoveredId={hoveredId}
                      onHover={setHoveredId}
                      onClick={() => setSelectedCategoryId(cat.id)}
                      catName={t(`cleanSpace.categories.${cat.id}`, cat.name)}
                      isScanning={isScanning}
                      maxCategoryBytes={maxCategoryBytes}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Suggestion card — always pinned at bottom */}
            <div className="flex shrink-0 flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:gap-3 sm:p-3">
              <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.8 7.2 17l.9-5.4L4.2 7.7l5.4-.8L12 2z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">
                  {t("cleanSpace.overview.suggestionTitle")}
                </h3>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                  {t("cleanSpace.overview.suggestionDesc", {
                    size: formatSize(suggestionStats.safeBytes),
                  })}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:gap-4">
                  <div className="min-w-0">
                    <div className="text-primary text-base font-semibold tabular-nums sm:text-lg">
                      {formatSize(suggestionStats.safeBytes)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t("cleanSpace.overview.safeItems")}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-primary text-base font-semibold tabular-nums sm:text-lg">
                      {formatSize(suggestionStats.totalCleanable)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t("cleanSpace.overview.totalCleanable")}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "text-base font-semibold tabular-nums sm:text-lg",
                        suggestionStats.highCount > 0 ? "text-red-500" : "text-foreground",
                      )}
                    >
                      {suggestionStats.highCount}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t("cleanSpace.overview.highRiskItems")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
