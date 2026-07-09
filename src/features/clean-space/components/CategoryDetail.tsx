/**
 * Category Detail / 分类详情: drill-down into category items with expandable details,
 * priority badges, risk tooltips, sort/filter toolbar, and batch operation bar.
 * Modeled after clean-space-prototype.html category detail view.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RiskPill } from "@/features/clean-space/components/shared/RiskPill"
import { CleanupConfirmSheet } from "@/features/clean-space/components/shared/CleanupConfirmSheet"
import { useCleanSpaceStore } from "@/features/clean-space/store"
import { canCleanStorageItem, getProtectionReason } from "@/features/clean-space/lib/cleanable"
import { assignPriority } from "@/features/clean-space/lib/priority"
import { executeBatchCleanup } from "@/features/clean-space/services/clean-space.use-cases"
import * as repository from "@/features/clean-space/services/clean-space.repository"
import { cn, formatSize } from "@/lib/utils"
import { getErrorMessage } from "@/lib/tauri/errors"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import type { RiskLevel } from "@/lib/tauri/types/dev-cleaner"
import type { StorageItem, PriorityTier } from "@/lib/tauri/types/clean-space"

type SortMode = "priority" | "size" | "risk"

const RISK_ORDER: Record<RiskLevel, number> = { safe: 0, low: 1, medium: 2, high: 3 }
const RISK_WEIGHT: Record<RiskLevel, number> = { safe: 0, low: 0.33, medium: 0.66, high: 1 }
const RISK_COLOR: Record<RiskLevel, string> = {
  safe: "#34C759",
  low: "#30B0C7",
  medium: "#FF9500",
  high: "#FF3B30",
}

type EnrichedItem = StorageItem & { _score: number; _priority: PriorityTier }

/** Compute score + priority for items via shared lib/priority.ts (mutates priority/score fields). */
function enrichItems(items: StorageItem[]): EnrichedItem[] {
  if (items.length === 0) return []
  const cloned: StorageItem[] = items.map((i) => ({ ...i }))
  assignPriority(cloned)
  return cloned.map((item) => ({
    ...item,
    _score: item.score,
    _priority: item.priority,
  }))
}

export function CategoryDetail() {
  const { t } = useTranslation()
  const overview = useCleanSpaceStore((s) => s.overview)
  const selectedCategoryId = useCleanSpaceStore((s) => s.selectedCategoryId)
  const setSelectedCategoryId = useCleanSpaceStore((s) => s.setSelectedCategoryId)
  const isCleaning = useCleanSpaceStore((s) => s.isCleaning)
  const setCategoryItems = useCleanSpaceStore((s) => s.setCategoryItems)
  const canUsePlatform = canUseDesktopFeatures()

  const [sortMode, setSortMode] = useState<SortMode>("priority")
  const [safeOnly, setSafeOnly] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadingCategoryRef = useRef<string | null>(null)

  const category = useMemo(
    () => overview?.categories.find((c) => c.id === selectedCategoryId),
    [overview, selectedCategoryId],
  )

  const categoryExists = Boolean(category)
  const categoryItemsLength = category?.items.length ?? 0

  // Lazy-load category items when entering a detail view with empty items.
  // Keep the effect independent from overview refresh objects; background
  // total updates must not cancel an in-flight item request.
  useEffect(() => {
    if (!selectedCategoryId || !categoryExists || !canUsePlatform) return
    if (categoryItemsLength > 0) return
    if (loadingCategoryRef.current === selectedCategoryId) return

    const categoryId = selectedCategoryId
    let cancelled = false
    loadingCategoryRef.current = categoryId
    setIsLoadingItems(true)
    setLoadError(null)

    ;(async () => {
      try {
        const items = await repository.getCategoryItems(categoryId)
        if (!cancelled) {
          setCategoryItems(categoryId, items)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(getErrorMessage(err))
        }
      } finally {
        if (loadingCategoryRef.current === categoryId) {
          loadingCategoryRef.current = null
        }
        if (!cancelled) setIsLoadingItems(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedCategoryId, categoryExists, categoryItemsLength, canUsePlatform, setCategoryItems])

  const enrichedItems = useMemo(() => enrichItems(category?.items ?? []), [category])

  const sortedItems = useMemo(() => {
    let items = enrichedItems
    if (safeOnly) {
      items = items.filter((i) => i.risk_level === "safe" || i.risk_level === "low")
    }
    return [...items].sort((a, b) => {
      switch (sortMode) {
        case "size":
          return b.size_bytes - a.size_bytes
        case "risk":
          return RISK_ORDER[b.risk_level] - RISK_ORDER[a.risk_level] || b._score - a._score
        case "priority":
        default: {
          const pOrder = { P1: 0, P2: 1, P3: 2 }
          return (
            (pOrder[a._priority as "P1" | "P2" | "P3"] ?? 1) -
              (pOrder[b._priority as "P1" | "P2" | "P3"] ?? 1) || b._score - a._score
          )
        }
      }
    })
  }, [enrichedItems, sortMode, safeOnly])

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllSafe = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      enrichedItems.forEach((i) => {
        if (i.risk_level === "safe" && canCleanStorageItem(i)) next.add(i.id)
      })
      return next
    })
  }, [enrichedItems])

  const excludeHigh = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      enrichedItems.forEach((i) => {
        if (i.risk_level === "high") next.delete(i.id)
      })
      return next
    })
  }, [enrichedItems])

  const handleCleanup = useCallback(async () => {
    if (selected.size === 0 || !category) return

    const selectedItems = category.items.filter((i) => selected.has(i.id) && canCleanStorageItem(i))
    if (selectedItems.length === 0) {
      toast.error(t("cleanSpace.detail.notCleanable"))
      setSelected(new Set())
      return
    }

    const totalBytes = selectedItems.reduce((sum, i) => sum + i.size_bytes, 0)

    try {
      await executeBatchCleanup(category, selectedItems)
      setConfirmOpen(false)
      setSelected(new Set())
      toast.success(
        t("cleanSpace.toast.cleanupSuccess", {
          count: selectedItems.length,
          size: formatSize(totalBytes),
        }),
      )
    } catch (err) {
      toast.error(t("cleanSpace.toast.cleanupFailed"))
    }
  }, [selected, category, t])

  if (!selectedCategoryId || !category) return null

  const selectedItems = enrichedItems.filter((i) => selected.has(i.id) && canCleanStorageItem(i))
  const selectedSize = selectedItems.reduce((sum, i) => sum + i.size_bytes, 0)
  const totalSize = enrichedItems.reduce((sum, i) => sum + i.size_bytes, 0)

  return (
    <div className="flex flex-col gap-3">
      {/* Breadcrumb */}
      <div className="flex shrink-0 items-center gap-1.5 text-sm">
        <button
          onClick={() => {
            setSelectedCategoryId(null)
            setSelected(new Set())
            setExpandedItems(new Set())
          }}
          className="text-primary flex items-center gap-1 transition-colors hover:underline"
        >
          <ChevronLeft size={14} />
          {t("cleanSpace.overview.title")}
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">
          {t(`cleanSpace.categories.${category.id}`, category.name)}
        </span>
        <span className="text-muted-foreground ml-1 text-xs">
          {formatSize(category.total_bytes)}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{t("cleanSpace.category.sortLabel")}</span>
        <div className="bg-muted inline-flex rounded-md border p-0.5">
          {(["priority", "size", "risk"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              className={cn(
                "rounded-[5px] px-3 py-1 text-xs transition-colors",
                sortMode === mode
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setSortMode(mode)}
            >
              {t(`cleanSpace.category.sort.${mode}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={safeOnly}
          onClick={() => setSafeOnly(!safeOnly)}
          className="flex cursor-pointer items-center gap-1.5 text-xs"
        >
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
              safeOnly ? "border-primary bg-primary" : "border-border bg-background",
            )}
          >
            {safeOnly && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="#fff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          {t("cleanSpace.category.safeOnly")}
        </button>
        <div className="flex-1" />
        <span className="text-muted-foreground text-xs">
          {t("cleanSpace.category.totalItems")} {enrichedItems.length}{" "}
          {t("cleanSpace.category.itemsUnit")} · {t("cleanSpace.category.availableFree")}{" "}
          <b>{formatSize(totalSize)}</b>
        </span>
      </div>

      {/* Item list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
        {isLoadingItems ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 py-12 text-sm">
            <Loader2 size={16} className="animate-spin" />
            {t("cleanSpace.overview.scanning")}
          </div>
        ) : loadError ? (
          <div className="text-destructive flex flex-1 items-center justify-center py-12 text-sm">
            {loadError}
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center py-12 text-sm">
            {t("cleanSpace.emptyState")}
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {sortedItems.map((item) => {
              const isSelected = selected.has(item.id)
              const isExpanded = expandedItems.has(item.id)
              const priority = item._priority
              const score = item._score
              const isCleanable = canCleanStorageItem(item)
              const protectionReason = getProtectionReason(item)
              const notCleanableTitle = protectionReason || t("cleanSpace.detail.notCleanable")
              return (
                <div
                  key={item.id}
                  className={cn("group transition-colors", isExpanded && "bg-muted/30")}
                >
                  {/* Main row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    onClick={() => toggleExpand(item.id)}
                  >
                    {/* Checkbox */}
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isCleanable
                          ? isSelected
                            ? "border-primary bg-primary cursor-pointer"
                            : "border-border bg-background cursor-pointer"
                          : "border-border bg-muted cursor-not-allowed opacity-40",
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isCleanable) toggleItem(item.id)
                      }}
                      title={isCleanable ? undefined : notCleanableTitle}
                    >
                      {isSelected && isCleanable && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 13l4 4L19 7"
                            stroke="#fff"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>

                    {/* Name + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{item.name}</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                        {item.path}
                        {item.files ? ` · ${item.files}` : ""}
                      </div>
                    </div>

                    {/* Tags: priority badge + risk pill */}
                    <div className="flex shrink-0 items-center gap-2">
                      <PriorityBadge priority={priority} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <RiskPill level={item.risk_level} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: RISK_COLOR[item.risk_level] }}
                            />
                            {t(`cleanSpace.risk.${item.risk_level}`)}
                            {t("cleanSpace.risk.level")}
                          </div>
                          <div className="text-muted-foreground mt-1">
                            {t(`cleanSpace.risk.def.${item.risk_level}`)}
                          </div>
                          {item.reason && (
                            <div className="text-muted-foreground border-border/20 mt-1.5 border-t pt-1.5">
                              <b className="text-foreground">{t("cleanSpace.detail.hitReason")}</b>
                              {item.reason}
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Size */}
                    <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatSize(item.size_bytes)}
                    </div>

                    {/* Expand chevron */}
                    <ChevronRight
                      size={16}
                      className={cn(
                        "text-muted-foreground shrink-0 transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                  </div>

                  {/* Expandable detail */}
                  {isExpanded && (
                    <div className="bg-muted/20 mx-4 mb-3 rounded-lg p-3 text-xs">
                      <div className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">{t("cleanSpace.detail.path")}</span>
                        <span className="text-foreground font-mono">{item.path}</span>
                        <span className="text-muted-foreground">
                          {t("cleanSpace.detail.files")}
                        </span>
                        <span className="text-foreground font-mono">{item.files || "—"}</span>
                        <span className="text-muted-foreground">{t("cleanSpace.detail.risk")}</span>
                        <span className="text-foreground font-mono">
                          {t(`cleanSpace.risk.${item.risk_level}`)}{" "}
                          {t("cleanSpace.detail.weightValue", {
                            weight: RISK_WEIGHT[item.risk_level],
                          })}
                        </span>
                        <span className="text-muted-foreground">
                          {t("cleanSpace.detail.score")}
                        </span>
                        <span className="text-foreground font-mono">
                          {(score * 100).toFixed(1)}
                        </span>
                      </div>
                      {item.command && (
                        <div
                          className="border-border/30 bg-muted/40 mt-2.5 rounded-md border px-2.5 py-2 font-mono text-xs"
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: RISK_COLOR[item.risk_level],
                          }}
                        >
                          $ {item.command}
                        </div>
                      )}
                      {(item.reason || (!isCleanable && protectionReason)) && (
                        <div className="bg-muted/20 mt-2 rounded-md px-2.5 py-2">
                          <b>{t("cleanSpace.detail.riskReason")}</b>
                          {getProtectionReason(item)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Batch operation bar */}
      {canUsePlatform && (
        <div className="bg-background/80 sticky bottom-0 flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 shadow-md backdrop-blur-xl backdrop-saturate-[180%]">
          <Button variant="ghost" size="xs" onClick={selectAllSafe}>
            {t("cleanSpace.batch.selectAllSafe")}
          </Button>
          <Button variant="ghost" size="xs" onClick={excludeHigh}>
            {t("cleanSpace.batch.excludeHigh")}
          </Button>
          <div className="flex-1" />
          <span className="text-muted-foreground text-xs">
            {t("cleanSpace.batch.selected")}{" "}
            <b className="text-foreground tabular-nums">{selectedItems.length}</b>{" "}
            {t("cleanSpace.batch.itemsUnit")} · {t("cleanSpace.batch.free")}{" "}
            <b className="text-foreground tabular-nums">{formatSize(selectedSize)}</b>
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={selectedItems.length === 0 || isCleaning}
          >
            {isCleaning ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Trash2 size={14} className="mr-1.5" />
            )}
            {t("cleanSpace.batch.cleanSelected")}
          </Button>
        </div>
      )}

      {/* Glass Sheet confirm dialog */}
      <CleanupConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        items={selectedItems}
        onConfirm={handleCleanup}
        loading={isCleaning}
      />
    </div>
  )
}

/** Priority badge component */
function PriorityBadge({ priority }: { priority: "P1" | "P2" | "P3" }) {
  const config = {
    P1: "bg-primary/15 text-primary",
    P2: "bg-muted text-muted-foreground border border-border/50",
    P3: "bg-muted/50 text-muted-foreground/70 border border-border/30",
  }
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1.5 text-[10px] font-bold",
        config[priority],
      )}
    >
      {priority}
    </span>
  )
}
