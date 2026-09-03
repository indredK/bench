/**
 * KeyboardHelpDialog / 快捷键帮助.
 * 对齐 Python `triage.html` helpModal 的快捷键表。
 */
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

const SHORTCUT_ROWS = [
  ["k1", "v1"],
  ["k2", "v2"],
  ["k3", "v3"],
  ["k4", "v4"],
  ["k5", "v5"],
  ["k6", "v6"],
  ["k7", "v7"],
  ["k8", "v8"],
  ["k9", "v9"],
  ["k10", "v10"],
  ["k11", "v11"],
  ["k12", "v12"],
  ["k13", "v13"],
  ["k14", "v14"],
  ["k15", "v15"],
] as const

export function KeyboardHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("photoTriage.helpTitle")}</DialogTitle>
          <DialogDescription>{t("photoTriage.keyboard")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUT_ROWS.map(([key, value], idx) => (
                <tr key={key} className={idx % 2 ? "bg-muted/30" : undefined}>
                  <td className="text-muted-foreground w-40 px-2 py-1.5 align-top whitespace-nowrap">
                    <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[11px]">
                      {t(`photoTriage.${key}`)}
                    </kbd>
                  </td>
                  <td className="px-2 py-1.5">{t(`photoTriage.${value}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("photoTriage.helpOk")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
