/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 *
 * v1.2: realtime install dialog for a single app's update. Listens to the
 * latest `InstallPhase` in the store and renders phase-specific copy. While
 * the install is in flight the dialog is non-dismissible (must use Cancel).
 *
 * The failure with `SU_APP_RUNNING` is handed off to a sibling dialog in
 * `UpdateBlockingDialogs.tsx` — this component focuses on the linear
 * progress path.
 */
import { Loader2 } from "lucide-react"
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
import { cancelAppUpdate } from "@/lib/tauri/commands/app-manager"
import type { InstallFinishedEvent, InstallPhase, UpdateInfo } from "@/lib/tauri/types/app-manager"
import { useAppManagerStore } from "@/features/app-manager/store"

interface UpdateProgressDialogProps {
  /** The update this dialog is tracking, or `null` when nothing is in flight. */
  update: UpdateInfo | null
  /** Called when the user closes the dialog (only allowed in terminal states). */
  onClose: () => void
}

/**
 * Phases the orchestrator routes through OTHER dialogs (not this one). The
 * caller decides whether to render this dialog or one of the blocking dialogs.
 */
function isHandledByBlockingDialog(finished: InstallFinishedEvent | undefined): boolean {
  if (finished && !finished.success && finished.errorCode === "SU_APP_RUNNING") return true
  return false
}

function isTerminal(
  phase: InstallPhase | undefined,
  finished: InstallFinishedEvent | undefined,
): boolean {
  if (finished) return true
  if (!phase) return false
  return phase.phase === "done" || phase.phase === "failed" || phase.phase === "rolledBack"
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function UpdateProgressDialog({ update, onClose }: UpdateProgressDialogProps) {
  const { t } = useTranslation()
  const phase = useAppManagerStore((s) => (update ? s.installProgress[update.appId] : undefined))
  const finished = useAppManagerStore((s) => (update ? s.installFinished[update.appId] : undefined))

  // Nothing in flight + nothing terminal — nothing to render.
  if (!update || (!phase && !finished)) return null
  // Surfaced by a sibling blocking dialog (DeveloperIdChanged / AppRunning).
  if (isHandledByBlockingDialog(finished)) return null

  const terminal = isTerminal(phase, finished)
  const closable = terminal

  const handleCancel = () => {
    if (update) void cancelAppUpdate(update.appId)
  }

  const handleClose = () => {
    if (!closable) return
    onClose()
  }

  const titleKey = (() => {
    if (finished)
      return finished.success
        ? "appManager.softwareUpdate.install.titleDone"
        : "appManager.softwareUpdate.install.titleFailed"
    if (!phase) return "appManager.softwareUpdate.install.titleQueued"
    switch (phase.phase) {
      case "queued":
        return "appManager.softwareUpdate.install.titleQueued"
      case "downloading":
        return "appManager.softwareUpdate.install.titleDownloading"
      case "verifying":
        return "appManager.softwareUpdate.install.titleVerifying"
      case "extracting":
        return "appManager.softwareUpdate.install.titleExtracting"
      case "replacing":
        return "appManager.softwareUpdate.install.titleReplacing"
      case "finalizing":
        return "appManager.softwareUpdate.install.titleFinalizing"
      case "done":
        return "appManager.softwareUpdate.install.titleDone"
      case "failed":
        return "appManager.softwareUpdate.install.titleFailed"
      case "rolledBack":
        return "appManager.softwareUpdate.install.titleRolledBack"
      default:
        return "appManager.softwareUpdate.install.titleQueued"
    }
  })()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && closable) handleClose()
      }}
    >
      <DialogContent
        showCloseButton={closable}
        onEscapeKeyDown={(e) => {
          if (!closable) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (!closable) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!terminal && <Loader2 className="h-4 w-4 animate-spin" />}
            {t(titleKey)}
          </DialogTitle>
          <DialogDescription>
            {t("appManager.softwareUpdate.install.subtitle", {
              app: update.appName,
              from: update.currentVersion,
              to: update.latestVersion,
            })}
          </DialogDescription>
        </DialogHeader>

        <ProgressBody phase={phase} finished={finished} />

        <DialogFooter>
          {!terminal && (
            <Button variant="outline" onClick={handleCancel}>
              {t("appManager.softwareUpdate.install.cancel")}
            </Button>
          )}
          {terminal && (
            <Button onClick={handleClose}>{t("appManager.softwareUpdate.install.close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface BodyProps {
  phase: InstallPhase | undefined
  finished: InstallFinishedEvent | undefined
}

function ProgressBody({ phase, finished }: BodyProps) {
  const { t } = useTranslation()

  if (finished) {
    return (
      <div className="text-muted-foreground text-sm">
        {finished.success ? (
          <p>{t("appManager.softwareUpdate.install.doneBody")}</p>
        ) : (
          <p className="text-destructive whitespace-pre-wrap">
            {finished.errorCode ? `[${finished.errorCode}] ` : ""}
            {finished.message}
          </p>
        )}
      </div>
    )
  }

  if (!phase) return null

  if (phase.phase === "downloading") {
    const percent = Math.max(0, Math.min(100, phase.percent))
    const sizeLine =
      phase.bytesTotal != null
        ? t("appManager.softwareUpdate.install.downloadingSize", {
            percent,
            total: formatBytes(phase.bytesTotal),
          })
        : t("appManager.softwareUpdate.install.downloadingPercent", { percent })
    return (
      <div className="space-y-2">
        <div className="text-muted-foreground text-sm">{sizeLine}</div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    )
  }

  // failed / rolledBack with no finished event yet (defensive — orchestrator
  // always emits both, but we tolerate a missing finished payload).
  if (phase.phase === "failed") {
    return (
      <p className="text-destructive text-sm whitespace-pre-wrap">
        [{phase.code}] {phase.message}
      </p>
    )
  }
  if (phase.phase === "rolledBack") {
    return <p className="text-destructive text-sm whitespace-pre-wrap">{phase.reason}</p>
  }

  // queued / verifying / extracting / replacing / finalizing / done
  return (
    <p className="text-muted-foreground text-sm">
      {t(`appManager.softwareUpdate.install.body.${phase.phase}`)}
    </p>
  )
}
