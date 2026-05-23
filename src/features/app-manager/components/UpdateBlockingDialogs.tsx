/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 *
 * v1.2: two interactive checkpoints that branch out of the linear progress
 * dialog —
 *
 * 1. `DeveloperIdChangedDialog` — orchestrator paused on
 *    `developerIdChanged` phase; user must approve (continue) or reject
 *    (rollback) the team-ID change.
 * 2. `AppRunningDialog` — orchestrator failed with `SU_APP_RUNNING`; user
 *    quits the app and retries, or cancels.
 *
 * Both are rendered as sibling modals of `UpdateProgressDialog` from the
 * Software Update view.
 */
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  cancelAppUpdate,
  confirmDeveloperIdChange,
  installAppUpdate,
} from "@/lib/tauri/commands/app-manager";
import type { UpdateInfo } from "@/lib/tauri/types/app-manager";
import { useAppManagerStore } from "@/features/app-manager/store";

interface UpdateBlockingDialogsProps {
  update: UpdateInfo | null;
  onClose: () => void;
}

/**
 * Render whichever blocking checkpoint matches the latest install state for
 * `update`, or `null` if none apply.
 */
export function UpdateBlockingDialogs({ update, onClose }: UpdateBlockingDialogsProps) {
  const phase = useAppManagerStore((s) => (update ? s.installProgress[update.appId] : undefined));
  const finished = useAppManagerStore((s) => (update ? s.installFinished[update.appId] : undefined));

  if (!update) return null;

  // Developer ID change checkpoint — orchestrator is awaiting our decision.
  if (phase?.phase === "developerIdChanged") {
    return (
      <DeveloperIdChangedDialog
        update={update}
        oldTeamId={phase.old}
        newTeamId={phase.new}
        onClose={onClose}
      />
    );
  }

  // App-running failure — the orchestrator already finished with SU_APP_RUNNING.
  if (finished && !finished.success && finished.errorCode === "SU_APP_RUNNING") {
    return <AppRunningDialog update={update} onClose={onClose} />;
  }

  return null;
}

interface DeveloperIdChangedDialogProps {
  update: UpdateInfo;
  oldTeamId: string;
  newTeamId: string;
  onClose: () => void;
}

function DeveloperIdChangedDialog({
  update,
  oldTeamId,
  newTeamId,
  onClose,
}: DeveloperIdChangedDialogProps) {
  const { t } = useTranslation();

  const handleApprove = async () => {
    await confirmDeveloperIdChange(update.appId, true);
  };

  const handleReject = async () => {
    await confirmDeveloperIdChange(update.appId, false);
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) void handleReject(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t("appManager.softwareUpdate.install.devIdChanged.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              {t("appManager.softwareUpdate.install.devIdChanged.body", {
                app: update.appName,
              })}
            </p>
            <div className="rounded-md border bg-muted/40 p-2 font-mono text-xs">
              <div>
                <span className="text-muted-foreground">
                  {t("appManager.softwareUpdate.install.devIdChanged.oldLabel")}:
                </span>{" "}
                {oldTeamId || t("appManager.softwareUpdate.install.devIdChanged.unknown")}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("appManager.softwareUpdate.install.devIdChanged.newLabel")}:
                </span>{" "}
                {newTeamId || t("appManager.softwareUpdate.install.devIdChanged.unknown")}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("appManager.softwareUpdate.install.devIdChanged.hint")}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void handleReject()}>
            {t("appManager.softwareUpdate.install.devIdChanged.reject")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleApprove()}>
            {t("appManager.softwareUpdate.install.devIdChanged.approve")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface AppRunningDialogProps {
  update: UpdateInfo;
  onClose: () => void;
}

function AppRunningDialog({ update, onClose }: AppRunningDialogProps) {
  const { t } = useTranslation();
  const setInstallFinished = useAppManagerStore((s) => s.setInstallFinished);
  const clearInstallFinished = useAppManagerStore((s) => s.clearInstallFinished);
  const clearInstallProgress = useAppManagerStore((s) => s.clearInstallProgress);

  const handleRetry = async () => {
    // Drop the terminal failure state before restarting; otherwise the dialog
    // sees both the new in-flight install AND the old SU_APP_RUNNING and
    // re-opens immediately.
    clearInstallFinished(update.appId);
    clearInstallProgress(update.appId);
    try {
      await installAppUpdate(update);
    } catch (err) {
      // installAppUpdate spawns the orchestrator and returns Ok in the happy
      // path; an immediate Err means it never got to the running-check phase,
      // so we restore the finished state so the dialog stays open.
      setInstallFinished(update.appId, {
        appId: update.appId,
        success: false,
        message: String(err),
        errorCode: "SU_INSTALL_FAIL",
      });
    }
  };

  const handleCancel = () => {
    // The orchestrator has already returned, but the user may also have spawned
    // a follow-up install; send a best-effort cancel just in case.
    void cancelAppUpdate(update.appId);
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) handleCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t("appManager.softwareUpdate.install.appRunning.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("appManager.softwareUpdate.install.appRunning.body", {
              app: update.appName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {t("appManager.softwareUpdate.install.appRunning.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleRetry()}>
            {t("appManager.softwareUpdate.install.appRunning.retry")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
