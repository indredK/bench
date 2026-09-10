/**
 * Browser interop dialog / 账号 ↔ 浏览器互通弹窗（互通 I1 出向，仅注入）。
 *
 * 收敛说明：自站点维度互通（useStationBrowserInterop）上线后，本弹窗只保留
 * 「以该账号身份打开（注入会话）」与实例管理（关闭）。「手动登录 + 回采登录态」
 * 整体属于站点维度，故此处不再含回采 / 冲突 / 只读预检。
 *
 * 「清空浏览器数据」已于 2026-09-10 移除：账号档案本就是隔离目录，删账号时会整体
 * 清理，单按钮收益低于认知成本；站点级清理若确有需要，将来走 CDP
 * `Storage.clearDataForOrigin`（按 origin 精确清理）而不是删整个档案。
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
import type {
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
  status: BrowserStatusOutcome | null
  busy: "open" | "close" | null
  /** 最近一次「打开」的结果（用于在弹窗内交代实际注入了什么）。 */
  lastOpen: BrowserOpenOutcome | null
  /** 以该账号身份打开（注入会话）。 */
  onOpenBrowser: () => void
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
  status,
  busy,
  lastOpen,
  onOpenBrowser,
  onCloseInstance,
}: BrowserInteropDialogProps) {
  const { t } = useTranslation()

  const idle = busy === null
  const noBrowser = browsers.length === 0
  const running = !!status?.running
  const runningBrowserName =
    browsers.find((browser) => browser.id === status?.browserId)?.name ?? status?.browserId ?? ""

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

          <div className="space-y-2">
            <Button
              type="button"
              className="w-full justify-start"
              onClick={onOpenBrowser}
              disabled={!idle || noBrowser}
            >
              <Globe size={14} />
              {t("accountManager.browserInterop.openWithSession")}
              <span className="text-primary-foreground/70 ml-auto text-xs font-normal">
                {t("accountManager.browserInterop.injectBadge")}
              </span>
            </Button>
            <p className="text-muted-foreground text-xs">
              {t("accountManager.browserInterop.openWithSessionHint")}
            </p>
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
                  {t("accountManager.browserInterop.lastOpenNoSession")}
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
