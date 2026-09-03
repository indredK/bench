/**
 * TriageHeader / 顶部统计行 + 批量操作.
 * 对齐 Python `triage.html` header：共/留/删/未处理/已删 计数，
 * 全部留/全部删、导出 selection.json、? 快捷键、移入废纸篓（含计数）。
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Download, HelpCircle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useGuardedAsync } from "@/hooks/useGuardedAsync"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"
import type { PhotoItem } from "@/lib/tauri/types/photo-triage"

export function TriageHeader({
  controller,
  onConfirmTrash,
  onOpenHelp,
}: {
  controller: PhotoTriageController
  onConfirmTrash: (items: PhotoItem[]) => void
  onOpenHelp: () => void
}) {
  const { t } = useTranslation()
  const { stats, deletedSet } = controller
  const { run } = useGuardedAsync()
  const [confirmMark, setConfirmMark] = useState<"keep" | "drop" | null>(null)

  const dropItems = useMemo(
    () =>
      controller.items.filter((it) => controller.sel[it.id] === "drop" && !deletedSet.has(it.id)),
    [controller.items, controller.sel, deletedSet],
  )

  const handleMarkAll = (mark: "keep" | "drop") => {
    const total = stats.total - stats.deleted
    if (total <= 0) return
    uc.markAll(mark)
    toast(
      mark === "keep"
        ? t("photoTriage.markAllKeep", { count: total })
        : t("photoTriage.markAllDrop", { count: total }),
    )
  }

  const handleExport = () =>
    run(async () => {
      let res: { keeps: number; drops: number } | null
      try {
        res = uc.exportSelectionJson()
      } catch {
        toast(t("photoTriage.exportFailed"))
        return
      }
      if (res) {
        toast(t("photoTriage.exported", { keeps: res.keeps, drops: res.drops }))
      } else {
        toast(t("photoTriage.exportEmpty"))
      }
    })

  return (
    <div className="bg-background flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-xs">
      <h1 className="text-sm font-semibold">{t("photoTriage.title")}</h1>
      <span className="text-muted-foreground">
        {t("photoTriage.total")} <b className="text-foreground">{stats.total}</b>
      </span>
      <span className="text-muted-foreground">
        {t("photoTriage.keep")} <b className="text-emerald-500">{stats.keep}</b>
      </span>
      <span className="text-muted-foreground">
        {t("photoTriage.drop")} <b className="text-red-500">{stats.drop}</b>
      </span>
      <span className="text-muted-foreground">
        {t("photoTriage.todo")} <b>{stats.todo}</b>
      </span>
      <span className="text-muted-foreground">
        {t("photoTriage.deleted")} <b className="text-muted-foreground">{stats.deleted}</b>
      </span>

      <span className="flex-1" />

      <Button variant="ghost" size="sm" onClick={() => handleMarkAll("keep")}>
        {t("photoTriage.markAllKeep")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => handleMarkAll("drop")}>
        {t("photoTriage.markAllDrop")}
      </Button>
      <Button variant="ghost" size="sm" onClick={handleExport} title={t("photoTriage.exportHint")}>
        <Download size={13} className="mr-1" />
        {t("photoTriage.export")}
      </Button>
      <Button variant="ghost" size="sm" onClick={onOpenHelp}>
        <HelpCircle size={13} className="mr-1" />
        {t("photoTriage.helpShortcuts")}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={dropItems.length === 0}
        onClick={() => onConfirmTrash(dropItems)}
        title={t("photoTriage.trashEmpty")}
      >
        <Trash2 size={13} className="mr-1" />
        {dropItems.length
          ? t("photoTriage.trashCount", { count: dropItems.length })
          : t("photoTriage.trash")}
      </Button>
      <Dialog open={confirmMark !== null} onOpenChange={() => setConfirmMark(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmMark === "keep"
                ? t("photoTriage.markAllKeepConfirm", { count: stats.total - stats.deleted })
                : t("photoTriage.markAllDropConfirm", { count: stats.total - stats.deleted })}
            </DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMark(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={confirmMark === "keep" ? "outline" : "destructive"}
              onClick={() => {
                if (confirmMark) handleMarkAll(confirmMark)
                setConfirmMark(null)
              }}
            >
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
