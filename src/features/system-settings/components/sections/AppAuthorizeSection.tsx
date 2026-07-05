import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { sendNotification } from "@tauri-apps/plugin-notification"
import { SettingGroup } from "@/components/ui/setting-group"
import { Button } from "@/components/ui/button"
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
import { authorizeMacApp } from "@/lib/tauri/commands/app-manager"
import { getErrorMessage } from "@/lib/tauri/errors"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { openPlatformDialog } from "@/platform/dialog"
import { platformName } from "@/platform/config"
import {
  appBundleDisplayName,
  formatMacAppAuthorizeCommand,
  isMacAppBundlePath,
} from "@/features/system-settings/model/app-authorize"

interface PendingAuthorize {
  path: string
  name: string
}

export function AppAuthorizeSection() {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingAuthorize | null>(null)
  const [running, setRunning] = useState(false)

  const command = useMemo(
    () => (pending ? formatMacAppAuthorizeCommand(pending.path) : ""),
    [pending],
  )

  const handlePickApp = useCallback(async () => {
    if (!canUseDesktopFeatures()) return

    const selected = await openPlatformDialog({
      multiple: false,
      defaultPath: "/Applications",
    })

    if (!selected || typeof selected !== "string") return
    if (!isMacAppBundlePath(selected)) {
      toast.error(t("systemSettings.advanced.appAuthorize.invalidApp"))
      return
    }

    setPending({
      path: selected,
      name: appBundleDisplayName(selected),
    })
  }, [t])

  const closeConfirm = useCallback(() => {
    if (running) return
    setPending(null)
  }, [running])

  const handleConfirm = useCallback(async () => {
    if (!pending || running) return

    setRunning(true)
    try {
      const result = await authorizeMacApp(pending.path)
      if (!result.success) {
        toast.error(
          t("systemSettings.advanced.appAuthorize.failedToast", { message: result.message }),
        )
        return
      }

      toast.success(t("systemSettings.advanced.appAuthorize.successToast", { name: pending.name }))
      try {
        sendNotification({
          title: t("systemSettings.advanced.appAuthorize.successNotificationTitle"),
          body: t("systemSettings.advanced.appAuthorize.successNotificationBody", {
            name: pending.name,
          }),
        })
      } catch {
        /* notification permission may be denied */
      }
      setPending(null)
    } catch (error) {
      toast.error(
        t("systemSettings.advanced.appAuthorize.failedToast", {
          message: getErrorMessage(error),
        }),
      )
    } finally {
      setRunning(false)
    }
  }, [pending, running, t])

  if (platformName !== "macos") {
    return null
  }

  return (
    <>
      <SettingGroup title={t("systemSettings.advanced.appAuthorize.title")}>
        <p className="text-muted-foreground pb-2 text-xs">
          {t("systemSettings.advanced.appAuthorize.description")}
        </p>
        <Button variant="outline" size="sm" disabled={running} onClick={() => void handlePickApp()}>
          <ShieldCheck size={14} className="mr-1.5" />
          {t("systemSettings.advanced.appAuthorize.pickApp")}
        </Button>
      </SettingGroup>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && closeConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-500" />
              {t("systemSettings.advanced.appAuthorize.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>{t("systemSettings.advanced.appAuthorize.confirmDescription", { name: pending?.name ?? "" })}</p>
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium">
                    {t("systemSettings.advanced.appAuthorize.commandLabel")}
                  </p>
                  <code className="bg-muted block rounded-md border px-3 py-2 font-mono text-xs break-all">
                    {command}
                  </code>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={running}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirm()
              }}
            >
              {running ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  {t("systemSettings.advanced.appAuthorize.running")}
                </>
              ) : (
                t("systemSettings.advanced.appAuthorize.confirmRun")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
