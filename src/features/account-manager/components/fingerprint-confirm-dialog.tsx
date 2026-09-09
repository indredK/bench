/**
 * Login fingerprint confirm dialog / 登录指纹确认对话框 (F2).
 * 采样成功后弹窗:展示特征计数 + 登出元素佐证,询问用户是否将该账号
 * 当前状态识别为该站点的活跃(已登录)状态。确认后由 controller 调用
 * confirm_login_fingerprint 并把账号置为 Ready。
 */
import { useTranslation } from "react-i18next"
import { ScanSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { LoginFingerprintSummary } from "@/lib/tauri/types/account-manager"

export function FingerprintConfirmDialog({
  open,
  onOpenChange,
  summary,
  username,
  onConfirm,
  confirming,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: LoginFingerprintSummary | null
  /** 采样账号用户名(确认动作的作用对象)。 */
  username: string
  onConfirm: () => void
  confirming: boolean
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(next) => !confirming && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch size={16} />
            {t("accountManager.fingerprint.confirmTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("accountManager.fingerprint.confirmDesc", { username })}
          </DialogDescription>
        </DialogHeader>

        {summary && (
          <div className="bg-muted/30 space-y-2 rounded-lg border px-3 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("accountManager.fingerprint.cookieCount")}
              </span>
              <span className="font-medium">{summary.cookieCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("accountManager.fingerprint.storageKeyCount")}
              </span>
              <span className="font-medium">{summary.storageKeyCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("accountManager.fingerprint.sampledAt")}
              </span>
              <span className="font-medium">{summary.sampledAt}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("accountManager.fingerprint.logoutEvidence")}
              </span>
              <span className="font-medium">
                {summary.hasLogoutEvidence
                  ? t("accountManager.fingerprint.logoutEvidenceYes")
                  : t("accountManager.fingerprint.logoutEvidenceNo")}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("accountManager.fingerprint.cancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={confirming}>
            {confirming
              ? t("accountManager.fingerprint.confirming")
              : t("accountManager.fingerprint.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
