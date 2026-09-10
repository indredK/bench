/**
 * Station-dimension browser interop dialog / 站点维度浏览器互通弹窗。
 *
 * 两个视图（由父级 hook 的状态切换，同一组件渲染）：
 *  - confirm 视图：流程说明确认 + 选择浏览器 + 「开始」。
 *  - main 视图：实时登录态预览（cookie 名称 / 计数 / 存储 / UA / 指纹）+「刷新获取」
 *    +「信息回采」(目标账号可选新建或已有，冲突二次确认) + 实例管理。
 */
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Globe, RefreshCw } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TFunction } from "i18next"
import type {
  BrowserOptionDto,
  BrowserSessionPreview,
  BrowserStationCaptureOutcome,
  BrowserStatusOutcome,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"
import type { BrowserExtensionStatus } from "@/lib/tauri/types/browser-ext"
import type { StationInteropBusy } from "@/features/account-manager/hooks/useStationBrowserInterop"

export interface StationBrowserInteropDialogProps {
  confirming: boolean
  open: boolean
  station: RelayStation | null
  accounts: StationAccount[]
  browsers: BrowserOptionDto[]
  browserId: string | null
  onBrowserIdChange: (id: string) => void
  status: BrowserStatusOutcome | null
  preview: BrowserSessionPreview | null
  busy: StationInteropBusy
  conflict: BrowserStationCaptureOutcome | null
  targetMode: "new" | "existing"
  onTargetModeChange: (mode: "new" | "existing") => void
  targetAccountId: string | null
  onTargetAccountIdChange: (id: string | null) => void
  newUsername: string
  onNewUsernameChange: (value: string) => void
  onConfirm: () => void
  onCancelConfirm: () => void
  onOpenChange: (open: boolean) => void
  onRefreshPreview: () => void
  onCapture: (force?: boolean) => void
  onCloseInstance: () => void
  onReopen: () => void
  /** 扩展通道状态（I3 读日常浏览器）。 */
  extensionStatus: BrowserExtensionStatus | null
  extensionBusy: boolean
  onExportExtension: (browserId?: string | null) => void
}

export function StationBrowserInteropDialog({
  confirming,
  open,
  station,
  accounts,
  browsers,
  browserId,
  onBrowserIdChange,
  status,
  preview,
  busy,
  conflict,
  targetMode,
  onTargetModeChange,
  targetAccountId,
  onTargetAccountIdChange,
  newUsername,
  onNewUsernameChange,
  onConfirm,
  onCancelConfirm,
  onOpenChange,
  onRefreshPreview,
  onCapture,
  onCloseInstance,
  onReopen,
  extensionStatus,
  extensionBusy,
  onExportExtension,
}: StationBrowserInteropDialogProps) {
  const { t } = useTranslation()
  const idle = busy === null
  const noBrowser = browsers.length === 0
  const running = !!status?.running
  const runningBrowserName =
    browsers.find((browser) => browser.id === status?.browserId)?.name ?? status?.browserId ?? ""

  if (confirming) {
    return (
      <Dialog open={confirming} onOpenChange={(next) => !next && onCancelConfirm()}>
        <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{t("accountManager.stationInterop.confirmTitle")}</DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              {t("accountManager.stationInterop.confirmDesc", {
                name: station?.remark ?? "",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-4">
            <ExtensionSection
              t={t}
              status={extensionStatus}
              busy={extensionBusy}
              browserId={browserId}
              onExport={onExportExtension}
            />

            <p className="text-muted-foreground text-xs">
              {t("accountManager.stationInterop.confirmSteps")}
            </p>

            <Alert>
              <AlertTriangle />
              <AlertTitle>{t("accountManager.stationInterop.isolatedNoticeTitle")}</AlertTitle>
              <AlertDescription>
                {t("accountManager.stationInterop.isolatedNoticeDesc")}
              </AlertDescription>
            </Alert>

            {noBrowser ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>{t("accountManager.stationInterop.noBrowserTitle")}</AlertTitle>
                <AlertDescription>
                  {t("accountManager.stationInterop.noBrowserDesc")}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="am-station-interop-browser">
                  {t("accountManager.stationInterop.browserLabel")}
                </Label>
                <Select
                  value={browserId ?? undefined}
                  onValueChange={onBrowserIdChange}
                  disabled={!idle}
                >
                  <SelectTrigger id="am-station-interop-browser" className="w-full">
                    <SelectValue
                      placeholder={t("accountManager.stationInterop.browserPlaceholder")}
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
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={onCancelConfirm}>
              {t("accountManager.stationInterop.confirmCancel")}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={noBrowser}>
              {t("accountManager.stationInterop.confirmProceed")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("accountManager.stationInterop.title")}</DialogTitle>
          <DialogDescription className="pt-2 text-sm">
            {t("accountManager.stationInterop.description", {
              name: station?.remark ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="bg-muted/20 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span className="text-muted-foreground text-xs">
              {running
                ? t("accountManager.stationInterop.instanceRunning", {
                    browser: runningBrowserName,
                  })
                : t("accountManager.stationInterop.instanceStopped")}
            </span>
            <div className="flex items-center gap-2">
              {!running && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onReopen}
                  disabled={!idle || noBrowser}
                >
                  <Globe size={14} />
                  {t("accountManager.stationInterop.openBrowser")}
                </Button>
              )}
              {running && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onCloseInstance}
                  disabled={!idle}
                >
                  {t("accountManager.stationInterop.closeInstance")}
                </Button>
              )}
            </div>
          </div>

          <SessionPreviewPanel t={t} preview={preview} running={running} />

          <CaptureSection
            t={t}
            accounts={accounts}
            targetMode={targetMode}
            onTargetModeChange={onTargetModeChange}
            targetAccountId={targetAccountId}
            onTargetAccountIdChange={onTargetAccountIdChange}
            newUsername={newUsername}
            onNewUsernameChange={onNewUsernameChange}
            busy={busy}
            onRefreshPreview={onRefreshPreview}
            onCapture={onCapture}
          />

          {conflict && <ConflictSection t={t} conflict={conflict} onCapture={onCapture} />}
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

/**
 * 「从日常浏览器读取」引导区（互通 I3，扩展通道）。
 *
 * 为什么需要它：站点登录态本来就在用户**日常浏览器**里，再开一个隔离实例等于
 * 让他们重新登录一次 —— 那与「新增账号 + 在新实例里登录」没有区别，采样入口
 * 就失去了意义。扩展通道直接读日常浏览器，因此这里要做的只是「把扩展装好」。
 *
 * 局限必须写清楚（见 `docs/explanation/browser-session-extension-plan.md` §3.2）：
 * Chrome 137 起已无法把扩展自动装进用户日常浏览器，只能手动加载一次；且
 * `chrome.cookies` 之外没有本地存储的直读 API，故扩展通道 v1 只搬 Cookie。
 */
function ExtensionSection({
  t,
  status,
  busy,
  browserId,
  onExport,
}: {
  t: TFunction
  status: BrowserExtensionStatus | null
  busy: boolean
  browserId: string | null
  onExport: (browserId?: string | null) => void
}) {
  const nmRegistered = (status?.nmRegistrations ?? []).some((item) => item.registered)
  const stateKey = !status
    ? "unknown"
    : !status.exported
      ? "notExported"
      : !status.hostBinFound
        ? "noHost"
        : !status.bridgeReady
          ? "bridgeDown"
          : !nmRegistered
            ? "nmMissing"
            : "ready"

  return (
    <div className="min-w-0 space-y-2 rounded-lg border px-3 py-3 text-xs">
      <div className="font-medium">{t("accountManager.stationInterop.extensionTitle")}</div>
      <p className="text-muted-foreground">{t("accountManager.stationInterop.extensionDesc")}</p>
      <p className="text-muted-foreground">{t("accountManager.stationInterop.extensionSteps")}</p>
      {/* 「加载已解压的扩展程序」需要用户自己选文件夹 —— 必须把路径直接给出来，
          否则这一步无从完成。路径在状态里恒有（无需先导出）。 */}
      {status?.extensionDir && (
        <div className="min-w-0">
          <div className="text-muted-foreground">
            {t("accountManager.stationInterop.extensionDirLabel")}
          </div>
          <code className="bg-muted/40 mt-0.5 block min-w-0 rounded border px-2 py-1 break-all select-all">
            {status.extensionDir}
          </code>
        </div>
      )}
      <div className="text-muted-foreground flex items-center justify-between gap-2">
        <span>
          {t(`accountManager.stationInterop.extensionStatus.${stateKey}`, {
            port: status?.bridgePort ?? 0,
          })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onExport(browserId)}
        >
          {busy
            ? t("accountManager.stationInterop.extensionExporting")
            : status?.exported
              ? t("accountManager.stationInterop.extensionReexport")
              : t("accountManager.stationInterop.extensionExport")}
        </Button>
      </div>
    </div>
  )
}

/** 实时登录态预览面板。 */
function SessionPreviewPanel({
  t,
  preview,
  running,
}: {
  t: TFunction
  preview: BrowserSessionPreview | null
  running: boolean
}) {
  if (!running) {
    return (
      <div className="min-w-0 rounded-lg border px-3 py-3 text-xs">
        <div className="font-medium">{t("accountManager.stationInterop.previewTitle")}</div>
        <p className="text-muted-foreground mt-1">
          {t("accountManager.stationInterop.previewStopped")}
        </p>
      </div>
    )
  }

  if (!preview || preview.cookieCount === 0) {
    return (
      <div className="min-w-0 rounded-lg border px-3 py-3 text-xs">
        <div className="font-medium">{t("accountManager.stationInterop.previewTitle")}</div>
        <p className="text-muted-foreground mt-1">
          {t("accountManager.stationInterop.previewEmpty")}
        </p>
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-2 rounded-lg border px-3 py-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-medium">{t("accountManager.stationInterop.previewTitle")}</div>
        <span className="text-muted-foreground">
          {t("accountManager.stationInterop.previewRunning")}
        </span>
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>
          {t("accountManager.stationInterop.cookieCount", { count: preview.cookieCount })}
        </span>
        <span>
          {t("accountManager.stationInterop.storageOrigins", { origins: preview.storageOrigins })}
        </span>
        {preview.fingerprintHits != null && preview.fingerprintTotal != null && (
          <span>
            {t("accountManager.stationInterop.fingerprint", {
              hits: preview.fingerprintHits,
              total: preview.fingerprintTotal,
            })}
          </span>
        )}
      </div>
      {/* UA 是一段很长的不可断 token：用 break-all 而不是 truncate —— truncate 的
          nowrap 会把 min-content 撑成整串宽度，进而把 grid 弹窗顶宽。 */}
      <div className="text-muted-foreground min-w-0 break-all">
        <span className="font-medium">{t("accountManager.stationInterop.userAgent")}：</span>
        {preview.userAgent}
      </div>
      <div className="text-muted-foreground">
        <span className="font-medium">{t("accountManager.stationInterop.indexedDb")}：</span>
        {indexedDbStatusLabel(t, preview.indexedDbStatus)}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-muted-foreground font-medium">
          {t("accountManager.stationInterop.cookieNames")}
        </div>
        <div className="bg-muted/40 max-h-32 min-w-0 overflow-y-auto rounded border px-2 py-1.5">
          {preview.cookieNames.map((name) => (
            <div key={name} className="py-0.5 break-all">
              {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 信息回采区：目标账号选择 + 刷新 + 回采按钮。 */
function CaptureSection({
  t,
  accounts,
  targetMode,
  onTargetModeChange,
  targetAccountId,
  onTargetAccountIdChange,
  newUsername,
  onNewUsernameChange,
  busy,
  onRefreshPreview,
  onCapture,
}: {
  t: TFunction
  accounts: StationAccount[]
  targetMode: "new" | "existing"
  onTargetModeChange: (mode: "new" | "existing") => void
  targetAccountId: string | null
  onTargetAccountIdChange: (id: string | null) => void
  newUsername: string
  onNewUsernameChange: (value: string) => void
  busy: StationInteropBusy
  onRefreshPreview: () => void
  onCapture: (force?: boolean) => void
}) {
  const idle = busy === null
  const existingSelectedInvalid = targetMode === "existing" && !targetAccountId
  const newNameInvalid = targetMode === "new" && newUsername.trim().length === 0
  const captureDisabled = !idle || existingSelectedInvalid || newNameInvalid

  // 切到「写入已有账号」时，默认选中列表首个账号，避免用户多一步操作。
  useEffect(() => {
    if (targetMode === "existing" && !targetAccountId && accounts.length > 0) {
      onTargetAccountIdChange(accounts[0].id)
    }
  }, [targetMode, targetAccountId, accounts, onTargetAccountIdChange])

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground text-xs">
          {t("accountManager.stationInterop.targetLabel")}
        </Label>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={targetMode === "new" ? "secondary" : "outline"}
            onClick={() => onTargetModeChange("new")}
          >
            {t("accountManager.stationInterop.targetNew")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={targetMode === "existing" ? "secondary" : "outline"}
            onClick={() => onTargetModeChange("existing")}
            disabled={accounts.length === 0}
          >
            {t("accountManager.stationInterop.targetExisting")}
          </Button>
        </div>
      </div>

      {targetMode === "new" ? (
        <div className="space-y-1">
          <Label htmlFor="am-station-interop-new-username">
            {t("accountManager.stationInterop.newUsernameLabel")}
          </Label>
          <Input
            id="am-station-interop-new-username"
            value={newUsername}
            onChange={(event) => onNewUsernameChange(event.target.value)}
            placeholder={t("accountManager.stationInterop.newUsernamePlaceholder")}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <Select
            value={targetAccountId ?? undefined}
            onValueChange={(value) => onTargetAccountIdChange(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t("accountManager.stationInterop.targetSelectPlaceholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefreshPreview}
          disabled={!idle}
        >
          <RefreshCw size={14} />
          {t("accountManager.stationInterop.refreshPreview")}
        </Button>
        <Button
          type="button"
          className="ml-auto"
          onClick={() => onCapture(false)}
          disabled={captureDisabled}
        >
          <RefreshCw size={14} className={busy === "capture" ? "animate-spin" : undefined} />
          {t("accountManager.stationInterop.capture")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("accountManager.stationInterop.captureHint")}
      </p>
    </div>
  )
}

/** 冲突二次确认区（Bench 已有更新会话）。 */
function ConflictSection({
  t,
  conflict,
  onCapture,
}: {
  t: TFunction
  conflict: BrowserStationCaptureOutcome
  onCapture: (force?: boolean) => void
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{t("accountManager.stationInterop.conflictTitle")}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {t("accountManager.stationInterop.conflictDesc", {
            at: formatCapturedAt(conflict.existingCapturedAtTs),
            origin: sessionOriginLabel(t, conflict.existingOrigin),
          })}
        </p>
        <Button type="button" size="sm" variant="destructive" onClick={() => onCapture(true)}>
          {t("accountManager.stationInterop.conflictOverwrite")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** IndexedDB 采集状态 → 本地化文案（后端给原始字符串，前端映射）。 */
function indexedDbStatusLabel(t: TFunction, status?: string | null): string {
  if (!status) return "—"
  const key = `accountManager.indexedDbStatus.${status}`
  const label = t(key)
  return label === key ? status : label
}

/** SessionOrigin → 本地化展示文案（与账号维度互通共用映射逻辑）。 */
function sessionOriginLabel(t: TFunction, origin?: string | null): string {
  const key = `accountManager.sessionOrigin.${origin ?? "unknown"}`
  const label = t(key)
  return label === key ? t("accountManager.sessionOrigin.unknown") : label
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
