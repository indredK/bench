/**
 * Common UI / 通用 UI: render app update dialog only; 只放应用更新相关界面.
 */
import { RefreshCcw, Download, RotateCw, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UpdaterController } from "@/features/updater/hooks/useUpdaterController";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function UpdateDialog({
  open,
  status,
  currentVersion,
  updateInfo,
  error,
  downloadedBytes,
  totalBytes,
  lastCheckedAt,
  checkUpdates,
  downloadAndInstall,
  restartNow,
  closeDialog,
  dismissDialog,
}: UpdaterController) {
  const { t } = useTranslation();

  const latestVersion = updateInfo?.version || currentVersion || "-";
  const progressPercent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null;
  const checking = status === "checking";
  const busy = status === "downloading" || status === "installing";
  const canInstall = status === "available";
  const canRestart = status === "readyToRestart";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("updater.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("updater.currentVersion")}</span>
              <span className="font-mono">{currentVersion || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("updater.latestVersion")}</span>
              <span className="font-mono">{latestVersion}</span>
            </div>
            {lastCheckedAt > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("updater.lastChecked")}</span>
                <span>{new Date(lastCheckedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {status === "upToDate" && (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>{t("updater.upToDateTitle")}</AlertTitle>
              <AlertDescription>{t("updater.upToDateDescription")}</AlertDescription>
            </Alert>
          )}

          {status === "available" && (
            <Alert>
              <Download className="size-4" />
              <AlertTitle>{t("updater.availableTitle", { version: latestVersion })}</AlertTitle>
              <AlertDescription>{t("updater.availableDescription")}</AlertDescription>
            </Alert>
          )}

          {busy && (
            <Alert>
              <RotateCw className="size-4 animate-spin" />
              <AlertTitle>
                {status === "downloading" ? t("updater.downloading") : t("updater.installing")}
              </AlertTitle>
              <AlertDescription>
                {status === "downloading"
                  ? t("updater.downloadDescription")
                  : t("updater.installDescription")}
              </AlertDescription>
            </Alert>
          )}

          {canRestart && (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>{t("updater.readyToRestartTitle")}</AlertTitle>
              <AlertDescription>{t("updater.readyToRestartDescription")}</AlertDescription>
            </Alert>
          )}

          {status === "error" && (
            <Alert variant="destructive">
              <AlertTitle>{t("updater.errorTitle")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(busy || canRestart) && (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progressPercent ?? (canRestart ? 100 : 8)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {status === "downloading"
                    ? t("updater.progressLabel", {
                        downloaded: formatBytes(downloadedBytes),
                        total: totalBytes ? formatBytes(totalBytes) : t("updater.unknownSize"),
                      })
                    : t("updater.progressDone")}
                </span>
                <span>{progressPercent ?? (canRestart ? 100 : 0)}%</span>
              </div>
            </div>
          )}

          {updateInfo?.body && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("updater.releaseNotes")}</h4>
              <div className="max-h-52 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {updateInfo.body}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={dismissDialog} disabled={busy}>
              {canRestart ? t("updater.later") : t("updater.close")}
            </Button>

            {canInstall && (
              <Button onClick={() => void downloadAndInstall()}>
                <Download className="size-4" />
                {t("updater.installNow")}
              </Button>
            )}

            {canRestart && (
              <Button onClick={() => void restartNow()}>
                <RotateCw className="size-4" />
                {t("updater.restartNow")}
              </Button>
            )}

            {!canInstall && !canRestart && (
              <Button onClick={() => void checkUpdates()} disabled={checking || busy}>
                <RefreshCcw className={`size-4 ${checking ? "animate-spin" : ""}`} />
                {checking ? t("updater.checking") : t("updater.checkNow")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
