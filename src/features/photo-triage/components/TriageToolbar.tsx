/**
 * TriageToolbar / 筛选栏：全部/未处理/留/删/已删 + 分组开关 + 批量操作.
 * 对齐 Python `triage.html` 的 toolbar 与 header 行为。
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { FolderCog, FolderOpen, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"
import { prettyPath } from "@/features/photo-triage/hooks/usePhotoTriageController"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"
import { usePhotoTriageStore, type TriageFilter } from "@/features/photo-triage/store"

const FILTERS: TriageFilter[] = ["all", "todo", "keep", "drop", "deleted"]

function filterKey(filter: TriageFilter): string {
  return `photoTriage.${filter === "all" ? "all" : filter}`
}

export function TriageToolbar({ controller }: { controller: PhotoTriageController }) {
  const { t } = useTranslation()
  const {
    filter,
    setFilter,
    groupBy,
    toggleGroup,
    groupCount,
    autoNext,
    toggleAutoNext,
    stats,
    source,
    scanning,
    scanStatus,
    current,
  } = controller
  const [pruning, setPruning] = useState(false)

  const counts: Record<TriageFilter, number> = useMemo(
    () => ({
      all: stats.total,
      todo: stats.todo,
      keep: stats.keep,
      drop: stats.drop,
      deleted: stats.deleted,
    }),
    [stats],
  )

  const handlePrune = async () => {
    if (pruning) return
    setPruning(true)
    try {
      const res = await uc.pruneManifest()
      if (res) {
        toast(
          t("photoTriage.pruneDone", {
            removed: res.removed,
            kept: res.kept,
          }),
        )
        if (res.removed > 0 && current) {
          // 失效条目已从后端清单移除；本地过滤后按需刷新由页面重新 openAlbum 触发
          void uc.openAlbum(source).then(() => {
            // 清除已失效 currentId
            const s = usePhotoTriageStore.getState()
            if (s.currentId && !s.items.some((it) => it.id === s.currentId)) {
              s.setCurrent(null)
            }
            void uc.persistState()
          })
        }
      }
    } finally {
      setPruning(false)
    }
  }

  return (
    <div className="bg-background/95 flex flex-wrap items-center gap-2 border-b p-2">
      <span className="text-muted-foreground pl-1 text-xs">{t("photoTriage.filter")}</span>
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {t(filterKey(f))} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="bg-border mx-1 h-5 w-px" />

      <Button
        variant="outline"
        size="sm"
        onClick={toggleGroup}
        title={t("photoTriage.v10")}
        aria-pressed={groupBy}
      >
        <FolderCog size={14} className="mr-1" />
        {groupBy
          ? t("photoTriage.groupCount", { count: groupCount })
          : t("photoTriage.groupBy", { state: t("photoTriage.off") })}
      </Button>
      <Button variant="outline" size="sm" onClick={toggleAutoNext}>
        {t("photoTriage.autoNext", { state: t(autoNext ? "photoTriage.on" : "photoTriage.off") })}
      </Button>

      <div className="bg-border mx-1 h-5 w-px" />

      <Button
        variant="ghost"
        size="sm"
        onClick={handlePrune}
        disabled={pruning}
        title={t("photoTriage.pruneTitle")}
      >
        <RefreshCw size={14} className={cn("mr-1", pruning && "animate-spin")} />
        {t("photoTriage.resetCache")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => usePhotoTriageStore.getState().setEmptyDirsOpen(true)}
        title={t("photoTriage.emptyDirs")}
      >
        <FolderOpen size={14} className="mr-1" />
        {t("photoTriage.emptyDirs")}
      </Button>

      {scanning || scanStatus?.running ? (
        <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
          <RefreshCw size={12} className="animate-spin" />
          {scanStatus?.phase === "list"
            ? t("photoTriage.scanning")
            : t("photoTriage.scanGenerating", {
                done: scanStatus?.done ?? 0,
                total: scanStatus?.total || "…",
              })}
        </span>
      ) : scanStatus && !scanStatus.running && scanStatus.phase === "done" ? (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-emerald-500"
          onClick={() => void uc.openAlbum(source)}
          title={t("photoTriage.scanDone", { count: scanStatus.total })}
        >
          ✓ {t("photoTriage.scanDone", { count: scanStatus.total })}
        </Button>
      ) : null}

      {source ? (
        <span className="text-muted-foreground ml-auto max-w-[40%] truncate text-xs" title={source}>
          {t("photoTriage.source")}
          <b className="text-foreground">{prettyPath(source)}</b>
        </span>
      ) : null}
    </div>
  )
}
