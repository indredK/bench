/**
 * Browser interop dialog / 账号 ↔ 浏览器互通弹窗（互通 I1/I2）。
 *
 * 三条主路径，全部由后端从 RelayStation 读取站点地址，前端不传 URL：
 *  1. 以该账号身份打开     —— injectSession=true，注入会话后导航到站点。
 *  2. 打开站点并手动登录   —— injectSession=false，供浏览器内完成扫码/2FA/SSO。
 *  3. 回采登录态           —— 把浏览器中的会话写回 Bench（冲突需二次确认）。
 * 另有「清空浏览器数据」（destructive，二次确认）供重新登录场景使用。
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Globe, LogIn, RefreshCw, ScanSearch, Trash2 } from "lucide-react"
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
import { DeleteConfirmDialog } from "@/features/account-manager/components/delete-confirm-dialog"
import { sessionOriginLabel } from "@/features/account-manager/hooks/useBrowserInterop"
import type {
  BrowserCaptureOutcome,
  BrowserOpenOutcome,
  BrowserOptionDto,
  BrowserProbeOutcome,
  BrowserStatusOutcome,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

export interface BrowserInteropDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: StationAccount | null
  browsers: BrowserOptionDto[]
  browserId: string | null
  onBrowserIdChange: (browserId: string) => void
  status: BrowserStatusOutcome | null
  busy: "open" | "login" | "capture" | "close" | "clear" | "probe" | null
  conflict: BrowserCaptureOutcome | null
  /** 最近一次「打开」的结果（用于在弹窗内交代实际注入了什么）。 */
  lastOpen: BrowserOpenOutcome | null
  /** 最近一次「检测登录态」的结果。 */
  probe: BrowserProbeOutcome | null
  onOpenBrowser: (injectSession: boolean) => void
  onCapture: (confirmed?: boolean) => void
  onCloseInstance: () => void
  onClearProfile: () => void
  onProbe: () => void
}

export function BrowserInteropDialog({
  open,
  onOpenChange,
  account,
  browsers,
  browserId,
  onBrowserIdChange,
  status,
  busy,
  conflict,
  lastOpen,
  probe,
  onOpenBrowser,
  onCapture,
  onCloseInstance,
  onClearProfile,
  onProbe,
}: BrowserInteropDialogProps) {
  const { t } = useTranslation()
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  const idle = busy === null
  const noBrowser = browsers.length === 0
  const running = !!status?.running
  const runningBrowserName =
    browsers.find((browser) => browser.id === status?.browserId)?.name ?? status?.browserId ?? ""

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{t("accountManager.browserInterop.title")}</DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              {t("accountManager.browserInterop.description", {
                name: account?.username ?? "",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onProbe}
                  disabled={!idle || noBrowser}
                >
                  <ScanSearch size={14} />
                  {t("accountManager.browserInterop.probe")}
                </Button>
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
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                className="w-full justify-start"
                onClick={() => onOpenBrowser(true)}
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

              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => onOpenBrowser(false)}
                disabled={!idle || noBrowser}
              >
                <LogIn size={14} />
                {t("accountManager.browserInterop.openForLogin")}
              </Button>
              <p className="text-muted-foreground text-xs">
                {t("accountManager.browserInterop.openForLoginHint")}
              </p>

              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => onCapture(false)}
                disabled={!idle || noBrowser}
              >
                <RefreshCw size={14} className={busy === "capture" ? "animate-spin" : undefined} />
                {t("accountManager.browserInterop.capture")}
              </Button>
              <p className="text-muted-foreground text-xs">
                {t("accountManager.browserInterop.captureHint")}
              </p>
            </div>

            {lastOpen && (
              <div className="space-y-1 rounded-lg border px-3 py-2 text-xs">
                <div className="font-medium">
                  {t("accountManager.browserInterop.lastOpenTitle")}
                </div>
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

            {probe && (
              <div className="space-y-1 rounded-lg border px-3 py-2 text-xs">
                <div className="font-medium">{t("accountManager.browserInterop.probeTitle")}</div>
                <div className="text-muted-foreground">
                  {!probe.running
                    ? t("accountManager.browserInterop.probeNotRunning")
                    : probe.cookieCount === 0
                      ? t("accountManager.browserInterop.probeNoSession")
                      : t("accountManager.browserInterop.probeFound", {
                          count: probe.cookieCount,
                          hits: probe.fingerprintHits ?? 0,
                          total: probe.fingerprintTotal ?? 0,
                        })}
                </div>
              </div>
            )}

            {conflict && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>{t("accountManager.browserInterop.conflictTitle")}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    {t("accountManager.browserInterop.conflictDesc", {
                      at: formatCapturedAt(conflict.existingCapturedAtTs),
                      origin: sessionOriginLabel(t, conflict.existingOrigin),
                    })}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onCapture(true)}
                    disabled={!idle}
                  >
                    {t("accountManager.browserInterop.conflictOverwrite")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmClearOpen(true)}
              disabled={!idle}
            >
              <Trash2 size={14} />
              {t("accountManager.browserInterop.clearProfile")}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("accountManager.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={confirmClearOpen}
        title={t("accountManager.browserInterop.clearProfileTitle")}
        description={t("accountManager.browserInterop.clearProfileDesc", {
          name: account?.username ?? "",
        })}
        onOpenChange={setConfirmClearOpen}
        onConfirm={() => {
          setConfirmClearOpen(false)
          onClearProfile()
        }}
      />
    </>
  )
}

/** 冲突弹窗里的时间戳展示（UTC 秒 → 本地 YYYY-MM-DD HH:mm）。 */
function formatCapturedAt(ts?: number | null): string {
  if (!ts) return "—"
  const date = new Date(ts * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}
