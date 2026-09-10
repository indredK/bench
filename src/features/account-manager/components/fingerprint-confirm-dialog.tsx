/**
 * Login fingerprint confirm dialog / 登录指纹确认对话框 (F2).
 * 采样成功后弹窗:展示特征计数(可点开二级明细弹窗),询问用户是否将该账号
 * 当前状态识别为该站点的活跃(已登录)状态。确认后由 controller 调用
 * confirm_login_fingerprint 并把账号置为 Ready。
 */
import { useTranslation } from "react-i18next"
import { Loader2, ScanSearch } from "lucide-react"
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
  onViewDetail,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: LoginFingerprintSummary | null
  /** 采样账号用户名(确认动作的作用对象)。 */
  username: string
  onConfirm: () => void
  confirming: boolean
  /** 点击「Cookie 特征 / 存储键特征」计数 → 打开特征明细二级弹窗。 */
  onViewDetail: () => void
}) {
  const { t } = useTranslation()

  // summary 为 null 表示采样进行中(点击采样按钮后立即弹窗,后台采样)。
  const sampling = open && summary === null && !confirming

  return (
    <Dialog open={open} onOpenChange={(next) => !confirming && !sampling && onOpenChange(next)}>
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

        {sampling ? (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-4 text-sm">
            <Loader2 size={14} className="animate-spin" />
            {t("accountManager.fingerprint.sampling")}
          </div>
        ) : (
          summary && (
            <div className="bg-muted/30 space-y-2 rounded-lg border px-3 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("accountManager.fingerprint.cookieCount")}
                </span>
                <button
                  type="button"
                  className="font-medium underline decoration-dashed underline-offset-4 hover:opacity-80"
                  onClick={onViewDetail}
                  title={t("accountManager.fingerprint.viewDetailTitle")}
                >
                  {summary.cookieCount}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("accountManager.fingerprint.storageKeyCount")}
                </span>
                <button
                  type="button"
                  className="font-medium underline decoration-dashed underline-offset-4 hover:opacity-80"
                  onClick={onViewDetail}
                  title={t("accountManager.fingerprint.viewDetailTitle")}
                >
                  {summary.storageKeyCount}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("accountManager.fingerprint.sampledAt")}
                </span>
                <span className="font-medium">{summary.sampledAt}</span>
              </div>
            </div>
          )
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("accountManager.fingerprint.cancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={confirming || sampling}>
            {sampling
              ? t("accountManager.fingerprint.sampling")
              : confirming
                ? t("accountManager.fingerprint.confirming")
                : t("accountManager.fingerprint.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
