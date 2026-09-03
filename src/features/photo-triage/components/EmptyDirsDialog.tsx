/**
 * EmptyDirsDialog / 清理空文件夹.
 * 对齐 Python `triage.html` edModal：列出相册下完全为空（含隐藏文件不算空）的文件夹，
 * 勾选 → 二次武装确认（首次点击进入待确认，3 秒内再点才执行）→ 删除后重新扫描
 * （删掉子空文件夹后父目录可能也空了）。
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"
import { prettyPath } from "@/features/photo-triage/hooks/usePhotoTriageController"

export function EmptyDirsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [dirs, setDirs] = useState<string[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [armed, setArmed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setArmed(false)
    void uc.listEmptyDirs().then((list) => {
      if (list === null) {
        // 加载失败：保留旧列表并提示（失败不等同于空）
        toast(t("photoTriage.emptyDirsLoadFailed"))
        setLoading(false)
        return
      }
      setDirs(list)
      setChecked(new Set(list))
      setLoading(false)
    })
  }, [open, t])

  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 8000)
    return () => window.clearTimeout(id)
  }, [armed])

  const toggleAll = (next: boolean) => {
    setChecked(next ? new Set(dirs) : new Set())
    setArmed(false)
  }

  const handleConfirm = async () => {
    const paths = [...checked]
    if (deleting) return
    if (!armed) {
      if (!paths.length) {
        toast(t("photoTriage.emptyDirsSelectFirst"))
        return
      }
      setArmed(true)
      return
    }
    setDeleting(true)
    try {
      const res = await uc.deleteEmptyDirs(paths)
      toast(t("photoTriage.emptyDirsDeleted", { count: res.count }))
      if (res.errorCount > 0)
        console.warn("[photo-triage] empty dirs delete failed:", res.errorCount)
      // 删掉子空文件夹后父目录可能也空了，重新扫描
      const list = await uc.listEmptyDirs()
      if (list !== null) {
        setDirs(list)
        setChecked(new Set(list))
      }
    } finally {
      setDeleting(false)
      setArmed(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("photoTriage.emptyDirs")}</DialogTitle>
          <DialogDescription>
            {dirs.length
              ? t("photoTriage.emptyDirsCount", { count: dirs.length })
              : t("photoTriage.emptyDirsNone")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[46vh] space-y-0.5 overflow-y-auto">
          {loading ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("photoTriage.emptyDirsLoading")}
            </p>
          ) : dirs.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("photoTriage.emptyDirsNone")}
            </p>
          ) : (
            dirs.map((dir) => (
              <label
                key={dir}
                className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked.has(dir)}
                  onChange={(e) => {
                    const copy = new Set(checked)
                    if (e.target.checked) copy.add(dir)
                    else copy.delete(dir)
                    setChecked(copy)
                    setArmed(false)
                  }}
                  className="accent-primary size-4"
                />
                <span className="min-w-0 flex-1 truncate" title={dir}>
                  {prettyPath(dir)}
                </span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={dirs.length > 0 && checked.size === dirs.length}
                disabled={dirs.length === 0}
                onChange={(e) => toggleAll(e.target.checked)}
                className="accent-primary size-4"
              />
              {t("photoTriage.emptyDirsAll")}
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
                {t("common.close")}
              </Button>
              <Button
                variant={armed ? "destructive" : "default"}
                disabled={deleting || checked.size === 0}
                onClick={handleConfirm}
              >
                {armed
                  ? t("photoTriage.emptyDirsArm", { count: checked.size })
                  : t("photoTriage.emptyDirsDelete")}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
