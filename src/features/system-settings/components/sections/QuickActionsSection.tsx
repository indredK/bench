import { useTranslation } from "react-i18next";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingGroup } from "../SettingGroup";
import { Button } from "@/components/ui/button";

export function QuickActionsSection() {
  const { t } = useTranslation();
  const { run, applying } = useSettingAction();

  return (
    <SettingGroup title={t("systemSettings.actions.title")}>
      <div className="flex flex-wrap gap-2 py-2">
        <Button variant="outline" size="sm" disabled={applying} onClick={() => run("quickActions.lockScreen", () => systemSettingsUseCases.lockScreen())}>
          {t("systemSettings.actions.lockScreen")}
        </Button>
        <Button variant="outline" size="sm" disabled={applying} onClick={() => run("quickActions.emptyTrash", () => systemSettingsUseCases.emptyTrash())}>
          {t("systemSettings.actions.emptyTrash")}
        </Button>
        <Button variant="outline" size="sm" disabled={applying} onClick={() => run("quickActions.sleepNow", () => systemSettingsUseCases.sleepNow())}>
          {t("systemSettings.actions.sleepNow")}
        </Button>
        <Button variant="outline" size="sm" disabled={applying} onClick={async () => {
          if (confirm(t("systemSettings.actions.rebootConfirm"))) {
            await run("quickActions.reboot", () => systemSettingsUseCases.rebootNow());
          }
        }}>
          {t("systemSettings.actions.reboot")}
        </Button>
        <Button variant="outline" size="sm" disabled={applying} onClick={async () => {
          if (confirm(t("systemSettings.actions.shutdownConfirm"))) {
            await run("quickActions.shutdown", () => systemSettingsUseCases.shutdownNow());
          }
        }}>
          {t("systemSettings.actions.shutdown")}
        </Button>
        <Button variant="outline" size="sm" disabled={applying} onClick={() => run("quickActions.emptyPasteboard", () => systemSettingsUseCases.emptyPasteboard())}>
          {t("systemSettings.actions.emptyPasteboard")}
        </Button>
        <Button variant="outline" size="sm" disabled={applying} onClick={() => run("quickActions.ejectDiscs", () => systemSettingsUseCases.ejectDiscs())}>
          {t("systemSettings.actions.ejectDiscs")}
        </Button>
      </div>
    </SettingGroup>
  );
}
