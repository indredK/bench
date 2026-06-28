import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "../SettingToggle";
import { SettingGroup } from "../SettingGroup";
import { canUseTauriWindow } from "@/platform/capabilities";

export function SleepSection() {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  const refresh = useCallback(() => {
    systemSettingsUseCases.getSleepInhibitorState().then(store.setSleepState).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();

    let unlisten: (() => void) | undefined;

    if (canUseTauriWindow()) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        win.onFocusChanged(({ payload: focused }) => {
          if (focused) refresh();
        }).then((un) => { unlisten = un; });
      });
    }

    return () => { unlisten?.(); };
  }, [refresh]);

  return (
    <SettingGroup title={t("systemSettings.sleep.title")}>
      <SettingToggle
        label={t("systemSettings.sleep.preventSleep")}
        description={t("systemSettings.sleep.preventSleepDesc")}
        checked={store.sleepState?.enabled ?? false}
        loading={store.applyingKeys.has("sleep.preventSleep")}
        onCheckedChange={async (v) => {
          await run("sleep.preventSleep", async () => {
            const state = await systemSettingsUseCases.toggleSleepInhibitor(
              { prevent_sleep: true, prevent_display: true, auto_disable_on_exit: true },
              v
            );
            store.setSleepState(state);
          });
        }}
      />
    </SettingGroup>
  );
}
