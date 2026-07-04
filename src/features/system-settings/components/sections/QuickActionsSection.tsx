import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingGroup } from "@/components/ui/setting-group"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"

type PendingAction = "emptyTrash" | "reboot" | "shutdown" | null

export function QuickActionsSection() {
  const { t } = useTranslation()
  const { run, applying } = useSettingAction()
  const [pending, setPending] = useState<PendingAction>(null)

  const closeConfirm = useCallback(() => setPending(null), [])

  const dialogCopy =
    pending === "emptyTrash"
      ? {
          title: t("systemSettings.actions.emptyTrashConfirmTitle"),
          description: t("systemSettings.actions.emptyTrashConfirmDescription"),
          consequence: t("systemSettings.actions.emptyTrashConsequence"),
          confirm: t("systemSettings.actions.emptyTrashConfirmAction"),
          onConfirm: () =>
            run("quickActions.emptyTrash", () => systemSettingsUseCases.emptyTrash()),
        }
      : pending === "reboot"
        ? {
            title: t("systemSettings.actions.rebootConfirmTitle"),
            description: t("systemSettings.actions.rebootConfirmDescription"),
            consequence: t("systemSettings.actions.rebootConsequence"),
            confirm: t("systemSettings.actions.rebootConfirmAction"),
            onConfirm: () => run("quickActions.reboot", () => systemSettingsUseCases.rebootNow()),
          }
        : pending === "shutdown"
          ? {
              title: t("systemSettings.actions.shutdownConfirmTitle"),
              description: t("systemSettings.actions.shutdownConfirmDescription"),
              consequence: t("systemSettings.actions.shutdownConsequence"),
              confirm: t("systemSettings.actions.shutdownConfirmAction"),
              onConfirm: () =>
                run("quickActions.shutdown", () => systemSettingsUseCases.shutdownNow()),
            }
          : null

  return (
    <>
      <SettingGroup title={t("systemSettings.actions.title")}>
        <Alert className="mb-3 border-orange-500/50 bg-orange-500/10 text-sm">
          <AlertDescription className="text-xs">
            {t("systemSettings.actions.warning")}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2 py-2">
          <Button
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={() =>
              run("quickActions.lockScreen", () => systemSettingsUseCases.lockScreen())
            }
          >
            {t("systemSettings.actions.lockScreen")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={() => setPending("emptyTrash")}
          >
            {t("systemSettings.actions.emptyTrash")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={() => run("quickActions.sleepNow", () => systemSettingsUseCases.sleepNow())}
          >
            {t("systemSettings.actions.sleepNow")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={() => setPending("reboot")}
          >
            {t("systemSettings.actions.reboot")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={() => setPending("shutdown")}
          >
            {t("systemSettings.actions.shutdown")}
          </Button>
        </div>
      </SettingGroup>

      {dialogCopy && (
        <DestructiveConfirmDialog
          open={pending !== null}
          onOpenChange={(open) => {
            if (!open) closeConfirm()
          }}
          title={dialogCopy.title}
          description={dialogCopy.description}
          consequence={dialogCopy.consequence}
          confirmLabel={dialogCopy.confirm}
          cancelLabel={t("common.cancel")}
          onConfirm={async () => {
            await dialogCopy.onConfirm()
            closeConfirm()
          }}
          loading={applying}
        />
      )}
    </>
  )
}
