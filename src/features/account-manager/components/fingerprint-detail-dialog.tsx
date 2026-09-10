/**
 * Fingerprint detail dialog / 指纹特征明细二级弹窗 (F2).
 * 从确认弹窗点击「Cookie 特征 / 存储键特征」计数打开,展示采样到的特征列表。
 * 数据边界:仅键名/域名/path/httpOnly/值长度,特征值永不出后端。
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
import type { LoginFingerprintDetail } from "@/lib/tauri/types/account-manager"

function FeatureRow({ label, meta }: { label: string; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="font-mono text-xs break-all">{label}</span>
      <span className="text-muted-foreground shrink-0 text-xs">{meta}</span>
    </div>
  )
}

export function FingerprintDetailDialog({
  open,
  onOpenChange,
  detail,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: LoginFingerprintDetail | null
  loading: boolean
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch size={16} />
            {t("accountManager.fingerprintDetail.title")}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? t("accountManager.fingerprintDetail.description", {
                  sampledAt: detail.sampledAt,
                })
              : t("accountManager.fingerprintDetail.loadingDescription")}
          </DialogDescription>
        </DialogHeader>

        {loading && !detail ? (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-4 text-sm">
            <Loader2 size={14} className="animate-spin" />
            {t("accountManager.fingerprintDetail.loading")}
          </div>
        ) : !detail ? (
          <div className="text-muted-foreground rounded-lg border px-3 py-4 text-sm">
            {t("accountManager.fingerprintDetail.empty")}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-muted/30 rounded-lg border px-3 py-2">
              <div className="text-muted-foreground mb-1 text-xs font-medium">
                {t("accountManager.fingerprintDetail.cookieSection", {
                  count: detail.cookies.length,
                })}
              </div>
              {detail.cookies.length === 0 ? (
                <div className="text-muted-foreground py-1 text-xs">
                  {t("accountManager.fingerprintDetail.noFeatures")}
                </div>
              ) : (
                <div className="divide-y divide-transparent">
                  {detail.cookies.map((c) => (
                    <FeatureRow
                      key={`${c.name}|${c.domain}|${c.path}`}
                      label={c.name}
                      meta={t("accountManager.fingerprintDetail.cookieMeta", {
                        domain: c.domain,
                        httpOnly: c.httpOnly
                          ? t("accountManager.fingerprintDetail.httpOnlyYes")
                          : t("accountManager.fingerprintDetail.httpOnlyNo"),
                        valueLen: c.valueLen,
                      })}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="bg-muted/30 rounded-lg border px-3 py-2">
              <div className="text-muted-foreground mb-1 text-xs font-medium">
                {t("accountManager.fingerprintDetail.storageSection", {
                  count: detail.storageKeys.length,
                })}
              </div>
              {detail.storageKeys.length === 0 ? (
                <div className="text-muted-foreground py-1 text-xs">
                  {t("accountManager.fingerprintDetail.noFeatures")}
                </div>
              ) : (
                <div className="divide-y divide-transparent">
                  {detail.storageKeys.map((s) => (
                    <FeatureRow
                      key={s.key}
                      label={s.key}
                      meta={t("accountManager.fingerprintDetail.storageMeta", {
                        valueLen: s.valueLen,
                      })}
                    />
                  ))}
                </div>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {t("accountManager.fingerprintDetail.privacyHint")}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("accountManager.fingerprintDetail.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
