/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import { ArrowUpCircle, Download, Layers, ShieldCheck, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ConfirmDialogState {
  open: boolean
  appId: string
  appName: string
  action: "upgrade" | "uninstall"
}

interface InstallConfirmDialogState {
  open: boolean
  appId: string
  appName: string
}

interface AuthorizeConfirmDialogState {
  open: boolean
  appId: string
  appName: string
}

interface BatchConfirmDialogState {
  open: boolean
  action: "upgrade" | "uninstall" | "install"
  count: number
  names: string[]
}

interface AppManagerConfirmDialogsProps {
  confirmDialog: ConfirmDialogState
  installConfirmDialog: InstallConfirmDialogState
  authorizeConfirmDialog: AuthorizeConfirmDialogState
  batchConfirmDialog: BatchConfirmDialogState
  onCloseConfirm: () => void
  onCloseInstallConfirm: () => void
  onCloseAuthorizeConfirm: () => void
  onCloseBatchConfirm: () => void
  onConfirmAction: () => void
  onInstallConfirm: () => void
  onAuthorizeConfirm: () => void
  onBatchConfirm: () => void
}

export function AppManagerConfirmDialogs({
  confirmDialog,
  installConfirmDialog,
  authorizeConfirmDialog,
  batchConfirmDialog,
  onCloseConfirm,
  onCloseInstallConfirm,
  onCloseAuthorizeConfirm,
  onCloseBatchConfirm,
  onConfirmAction,
  onInstallConfirm,
  onAuthorizeConfirm,
  onBatchConfirm,
}: AppManagerConfirmDialogsProps) {
  const { t } = useTranslation()
  return (
    <>
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) onCloseConfirm()
        }}
      >
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
        onOpenChange={(open) => {
          if (!open) onCloseInstallConfirm()
        }}
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
        open={authorizeConfirmDialog.open}
        onOpenChange={(open) => {
          if (!open) onCloseAuthorizeConfirm()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-500" />
              {t("appManager.confirmAuthorizeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("appManager.confirmAuthorizeDescription", {
                name: authorizeConfirmDialog.appName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onAuthorizeConfirm}>
              {t("appManager.confirmAuthorize")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={batchConfirmDialog.open}
        onOpenChange={(open) => {
          if (!open) onCloseBatchConfirm()
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="w-full place-items-stretch text-left">
            <AlertDialogTitle className="flex items-center gap-2">
              {batchConfirmDialog.action === "install" ? (
                <Download size={18} className="text-blue-500" />
              ) : (
                <Layers size={18} />
              )}
              {batchConfirmDialog.action === "install"
                ? t("appManager.batchInstallConfirmTitle", { count: batchConfirmDialog.count })
                : t("appManager.batchConfirmTitle", {
                    action:
                      batchConfirmDialog.action === "uninstall"
                        ? t("appManager.batchActionUninstall")
                        : t("appManager.batchActionUpgrade"),
                    count: batchConfirmDialog.count,
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {batchConfirmDialog.action === "install"
                ? t("appManager.batchInstallConfirmDescription", {
                    count: batchConfirmDialog.count,
                  })
                : batchConfirmDialog.action === "uninstall"
                  ? t("appManager.batchUninstallConfirmDescription", {
                      count: batchConfirmDialog.count,
                    })
                  : t("appManager.batchUpgradeConfirmDescription", {
                      count: batchConfirmDialog.count,
                    })}
            </AlertDialogDescription>
            {batchConfirmDialog.names.length > 0 && (
              <div className="w-full space-y-2">
                <p className="text-muted-foreground text-xs font-medium">
                  {t("appManager.batchSelectedAppsLabel")}
                </p>
                <div className="bg-muted/25 w-full overflow-hidden rounded-lg border">
                  <ul className="max-h-48 overflow-y-auto text-sm">
                    {batchConfirmDialog.names.map((name, index) => (
                      <li
                        key={`${name}-${index}`}
                        className="flex min-h-9 items-center border-b px-3 py-2 last:border-b-0"
                      >
                        <span className="truncate">{name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBatchConfirm}
              className={
                batchConfirmDialog.action === "uninstall" ? "bg-red-600 hover:bg-red-700" : ""
              }
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
  )
}
