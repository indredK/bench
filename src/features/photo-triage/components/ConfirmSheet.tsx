/**
 * ConfirmSheet / 危险操作二次确认（对齐 clean-space 的 DestructiveConfirmDialog）.
 * 移入废纸篓前展示条目与文件路径，逐条核对；对齐 Python `triage.html` 的二次确认弹窗。
 */
import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PhotoItem } from "@/lib/tauri/types/photo-triage"
import { prettyPath } from "@/features/photo-triage/hooks/usePhotoTriageController"

export function ConfirmSheet({
  open,
  onOpenChange,
  items,
  onConfirm,
  busy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PhotoItem[]
  onConfirm: () => void | Promise<void>
  busy?: boolean
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)

  const { itemCount, fileCount } = useMemo(() => {
    let files = 0
    for (const it of items) {
      files += [it.image, it.video].filter(Boolean).length
    }
    return { itemCount: items.length, fileCount: files }
  }, [items])

  const handleConfirm = async () => {
    if (pending) return
    setPending(true)
    try {
      await onConfirm()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy || pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("photoTriage.trashConfirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("photoTriage.trashConfirmSub", { count: itemCount, count2: fileCount })}
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/40 max-h-[48vh] space-y-2 overflow-auto rounded-md border p-3">
          {items.map((it) => (
            <div key={it.id} className="text-sm">
              <b>[{it.type}]</b> {it.stem}
              <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-5">
                {[it.image, it.video].filter(Boolean).map((p) => (
                  <li key={p} className="break-all">
                    {prettyPath(p!)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy || pending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" disabled={busy || pending} onClick={handleConfirm}>
            {busy || pending ? (
              <>
                <Loader2 size={14} className="mr-1 animate-spin" />
                {t("photoTriage.trashProcessing")}
              </>
            ) : (
              t("photoTriage.trashConfirmOk")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
