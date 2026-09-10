/**
 * Browser interop dialog / 账号 ↔ 浏览器互通弹窗（出向：把 Bench 里的登录态同步到浏览器）。
 *
 * 与「站点维度互通」（手动登录 + 回采）不同，本弹窗是**出向**入口：把该账号在 Bench
 * 中的登录态写进浏览器。两个目标由用户显式选择：
 *
 *  - **Bench 隔离实例**：Bench 拉起「用户选的浏览器 + Bench 专属档案」的独立进程，
 *    会话经 CDP 直接注入，点一次即可用。
 *  - **日常浏览器**：在用户自己的浏览器实例里打开站点；写入由 Bench Companion 扩展
 *    完成（浏览器不允许 Bench 直接写日常 profile 的 Cookie），扩展未安装时只会打开站点。
 *
 * 「清空浏览器数据」已于 2026-09-10 移除：账号档案本就是隔离目录，删账号时会整体
 * 清理，单按钮收益低于认知成本。
 *
 * 后端从 RelayStation 读取站点地址，前端不传 URL。
 */
import { useTranslation } from "react-i18next"
import { AlertTriangle, Globe } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BrowserInteropTarget } from "@/features/account-manager/hooks/useBrowserInterop"
import { describeSyncReason } from "@/features/account-manager/model/browser-interop"
import type {
  BrowserDailySyncOutcome,
  BrowserOpenOutcome,
  BrowserOptionDto,
  BrowserStatusOutcome,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

export interface BrowserInteropDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: StationAccount | null
  /** 账号所属站点名：同名账号会跨站点重复，弹窗必须交代「这是哪个站点的账号」。 */
  stationName: string
  browsers: BrowserOptionDto[]
  browserId: string | null
  onBrowserIdChange: (browserId: string) => void
  /** 同步目标：Bench 隔离实例 / 用户日常浏览器。 */
  target: BrowserInteropTarget
  onTargetChange: (target: BrowserInteropTarget) => void
  status: BrowserStatusOutcome | null
  busy: "open" | "close" | null
  /** 最近一次「同步到隔离实例」的结果（用于在弹窗内交代实际注入了什么）。 */
  lastOpen: BrowserOpenOutcome | null
  /** 最近一次「同步到日常浏览器」的结果。 */
  lastDaily: BrowserDailySyncOutcome | null
  /** 把该账号的登录态同步到所选目标。 */
  onSync: () => void
  onCloseInstance: () => void
}

export function BrowserInteropDialog({
  open,
  onOpenChange,
  account,
  stationName,
  browsers,
  browserId,
  onBrowserIdChange,
  target,
  onTargetChange,
  status,
  busy,
  lastOpen,
  lastDaily,
  onSync,
  onCloseInstance,
}: BrowserInteropDialogProps) {
  const { t } = useTranslation()

  const idle = busy === null
  const noBrowser = browsers.length === 0
  const running = !!status?.running
  const runningBrowserName =
    browsers.find((browser) => browser.id === status?.browserId)?.name ?? status?.browserId ?? ""
  const isolated = target === "isolated"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t("accountManager.browserInterop.title")}</DialogTitle>
          <DialogDescription className="pt-2 text-sm">
            {t("accountManager.browserInterop.description", {
              name: account?.username ?? "",
              station: stationName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {noBrowser ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{t("accountManager.browserInterop.noBrowserTitle")}</AlertTitle>
              <AlertDescription>
                {t("accountManager.browserInterop.noBrowserDesc")}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="am-browser-interop-browser">
                {t("accountManager.browserInterop.browserLabel")}
              </Label>
              <Select
                value={browserId ?? undefined}
                onValueChange={onBrowserIdChange}
                disabled={!idle}
              >
                <SelectTrigger id="am-browser-interop-browser" className="w-full">
                  <SelectValue
                    placeholder={t("accountManager.browserInterop.browserPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {browsers.map((browser) => (
                    <SelectItem key={browser.id} value={browser.id}>
                      {browser.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="am-browser-interop-target">
              {t("accountManager.browserInterop.targetLabel")}
            </Label>
            <Select
              value={target}
              onValueChange={(value) => onTargetChange(value as BrowserInteropTarget)}
              disabled={!idle}
            >
              <SelectTrigger id="am-browser-interop-target" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="isolated">
                  {t("accountManager.browserInterop.targetIsolated")}
                </SelectItem>
                <SelectItem value="daily">
                  {t("accountManager.browserInterop.targetDaily")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {isolated
                ? t("accountManager.browserInterop.targetIsolatedHint")
                : t("accountManager.browserInterop.targetDailyHint")}
            </p>
          </div>

          {isolated && (
            <div className="bg-muted/20 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="text-muted-foreground text-xs">
                {running
                  ? t("accountManager.browserInterop.instanceRunning", {
                      browser: runningBrowserName,
                    })
                  : t("accountManager.browserInterop.instanceStopped")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCloseInstance}
                disabled={!idle || !running}
              >
                {t("accountManager.browserInterop.closeInstance")}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Button
              type="button"
              className="w-full justify-start"
              onClick={onSync}
              disabled={!idle || noBrowser}
            >
              <Globe size={14} />
              {t("accountManager.browserInterop.sync")}
              <span className="text-primary-foreground/70 ml-auto text-xs font-normal">
                {isolated
                  ? t("accountManager.browserInterop.injectBadge")
                  : t("accountManager.browserInterop.syncBadge")}
              </span>
            </Button>
            {!isolated && (
              <p className="text-muted-foreground text-xs">
                {t("accountManager.browserInterop.dailyExtensionHint")}
              </p>
            )}
          </div>

          {lastOpen && (
            <div className="min-w-0 space-y-1 rounded-lg border px-3 py-2 text-xs">
              <div className="font-medium">{t("accountManager.browserInterop.lastOpenTitle")}</div>
              {lastOpen.hasStoredSession ? (
                <div className="text-muted-foreground">
                  {t("accountManager.browserInterop.lastOpenCounts", {
                    injected: lastOpen.injectedCookies,
                    skipped: lastOpen.skippedPartitioned,
                    rejected: lastOpen.rejectedCookies,
                    origins: lastOpen.storageOrigins,
                  })}
                </div>
              ) : (
                <div className="text-destructive">
                  {t("accountManager.browserInterop.lastOpenNoSession", {
                    reason: describeSyncReason(t, lastOpen.recoveryReason),
                  })}
                </div>
              )}
            </div>
          )}

          {lastDaily && (
            <div className="min-w-0 space-y-1 rounded-lg border px-3 py-2 text-xs">
              <div className="font-medium">{t("accountManager.browserInterop.lastDailyTitle")}</div>
              {lastDaily.outcome === "noSession" ? (
                <div className="text-destructive">
                  {t("accountManager.browserInterop.lastOpenNoSession", {
                    reason: describeSyncReason(t, lastDaily.recoveryReason),
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground space-y-1">
                  <div>
                    {t("accountManager.browserInterop.lastDailyReady", {
                      count: lastDaily.cookieCount,
                      origins: lastDaily.storageOrigins,
                    })}
                  </div>
                  {lastDaily.storageOrigins > 0 && (
                    <div className="text-amber-600">
                      {t("accountManager.browserInterop.lastDailyStorage", {
                        origins: lastDaily.storageOrigins,
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("accountManager.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
