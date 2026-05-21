import type { TFunction } from "i18next";
import { ArrowUpCircle, Download, Layers, Trash2 } from "lucide-react";
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

interface ConfirmDialogState {
  open: boolean;
  appId: string;
  appName: string;
  action: "upgrade" | "uninstall";
}

interface InstallConfirmDialogState {
  open: boolean;
  appId: string;
  appName: string;
}

interface BatchConfirmDialogState {
  open: boolean;
  action: "upgrade" | "uninstall" | "install";
  count: number;
}

interface AppManagerConfirmDialogsProps {
  t: TFunction;
  confirmDialog: ConfirmDialogState;
  installConfirmDialog: InstallConfirmDialogState;
  batchConfirmDialog: BatchConfirmDialogState;
  onCloseConfirm: () => void;
  onCloseInstallConfirm: () => void;
  onCloseBatchConfirm: () => void;
  onConfirmAction: () => void;
  onInstallConfirm: () => void;
  onBatchConfirm: () => void;
}

export function AppManagerConfirmDialogs({
  t,
  confirmDialog,
  installConfirmDialog,
  batchConfirmDialog,
  onCloseConfirm,
  onCloseInstallConfirm,
  onCloseBatchConfirm,
  onConfirmAction,
  onInstallConfirm,
  onBatchConfirm,
}: AppManagerConfirmDialogsProps) {
  return (
    <>
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => { if (!open) onCloseConfirm(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmDialog.action === "uninstall" ? (
                <Trash2 size={18} className="text-red-500" />
              ) : (
                <ArrowUpCircle size={18} className="text-orange-500" />
              )}
              {confirmDialog.action === "uninstall"
                ? t("appManager.confirmUninstallTitle")
                : t("appManager.confirmUpgradeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === "uninstall"
                ? t("appManager.confirmUninstallDescription", { name: confirmDialog.appName })
                : t("appManager.confirmUpgradeDescription", { name: confirmDialog.appName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmAction}
              className={confirmDialog.action === "uninstall" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {confirmDialog.action === "uninstall"
                ? t("appManager.confirmUninstall")
                : t("appManager.confirmUpgrade")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={installConfirmDialog.open}
        onOpenChange={(open) => { if (!open) onCloseInstallConfirm(); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Download size={18} className="text-blue-500" />
              {t("appManager.installConfirmTitle", { name: installConfirmDialog.appName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("appManager.installConfirmDescription", { name: installConfirmDialog.appName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onInstallConfirm}>
              {t("appManager.confirmInstall")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={batchConfirmDialog.open}
        onOpenChange={(open) => { if (!open) onCloseBatchConfirm(); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {batchConfirmDialog.action === "install" ? (
                <Download size={18} className="text-blue-500" />
              ) : (
                <Layers size={18} />
              )}
              {batchConfirmDialog.action === "install"
                ? t("appManager.batchInstallConfirmTitle", { count: batchConfirmDialog.count })
                : t("appManager.batchConfirmTitle", {
                    action: batchConfirmDialog.action === "uninstall"
                      ? t("appManager.batchActionUninstall")
                      : t("appManager.batchActionUpgrade"),
                    count: batchConfirmDialog.count,
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {batchConfirmDialog.action === "install"
                ? t("appManager.batchInstallConfirmDescription", { count: batchConfirmDialog.count })
                : batchConfirmDialog.action === "uninstall"
                  ? t("appManager.batchUninstallConfirmDescription", { count: batchConfirmDialog.count })
                  : t("appManager.batchUpgradeConfirmDescription", { count: batchConfirmDialog.count })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBatchConfirm}
              className={batchConfirmDialog.action === "uninstall" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {batchConfirmDialog.action === "install"
                ? t("appManager.confirmInstall")
                : batchConfirmDialog.action === "uninstall"
                  ? t("appManager.confirmUninstall")
                  : t("appManager.confirmUpgrade")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
