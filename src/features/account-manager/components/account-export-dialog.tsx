/**
 * Account export dialog / 账号快照导出弹窗:
 * 展示导出范围(Cookie / 站点存储 / 登录指纹 / 账号信息 / 明文密码)与安全警示,
 * 快照生成完成后提供「复制到剪贴板」与「导出为 JSON」两个出口。
 */
import { useTranslation } from "react-i18next"
import { Check, Copy, FileDown, Loader2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function AccountExportDialog({
  open,
  onOpenChange,
  accountName,
  stationName,
  loading,
  saving,
  ready,
  onCopy,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountName: string
  stationName: string
  loading: boolean
  saving: boolean
  ready: boolean
  onCopy: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown size={16} />
            {t("accountManager.exportSnapshot.title")}
          </DialogTitle>
          <DialogDescription>
            {t("accountManager.exportSnapshot.description", {
              account: accountName,
              station: stationName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-muted/30 space-y-1.5 rounded-lg border px-3 py-2.5">
            <p className="text-xs font-medium">
              {t("accountManager.exportSnapshot.includesTitle")}
            </p>
            <ul className="text-muted-foreground space-y-1 text-xs">
              <li className="flex items-start gap-1.5">
                <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{t("accountManager.exportSnapshot.includes.cookies")}</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{t("accountManager.exportSnapshot.includes.storage")}</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{t("accountManager.exportSnapshot.includes.fingerprint")}</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{t("accountManager.exportSnapshot.includes.account")}</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{t("accountManager.exportSnapshot.includes.password")}</span>
              </li>
            </ul>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-600">{t("accountManager.exportSnapshot.warning")}</p>
          </div>
          {loading && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 size={12} className="animate-spin" />
              {t("accountManager.exportSnapshot.loading")}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={!ready || saving}
          >
            <Copy size={13} />
            {t("accountManager.exportSnapshot.copyButton")}
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={!ready || loading || saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            {t("accountManager.exportSnapshot.saveButton")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("accountManager.exportSnapshot.closeButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
