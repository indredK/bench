import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction";
import { SettingToggle } from "../SettingToggle";
import { SettingGroup } from "@/components/ui/setting-group";
import { canUseTauriWindow } from "@/platform/capabilities";

export function KeyboardSection() {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  const refresh = useCallback(() => {
    systemSettingsUseCases.getKeyboardFnKeyState().then(store.setKeyboardFnKey).catch(console.error);
    systemSettingsUseCases.getAutoCorrectState().then(store.setAutoCorrect).catch(console.error);
    systemSettingsUseCases.getSmartQuotesState().then(store.setSmartQuotes).catch(console.error);
    systemSettingsUseCases.getSmartDashesState().then(store.setSmartDashes).catch(console.error);
    systemSettingsUseCases.getAutoCapitalizeState().then(store.setAutoCapitalize).catch(console.error);
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
    <SettingGroup title={t("systemSettings.keyboard.title")}>
      <SettingToggle
        label={t("systemSettings.keyboard.fnKeys")}
        description={t("systemSettings.keyboard.fnKeysDesc")}
        checked={store.keyboardFnKey}
        loading={store.applyingKeys.has("keyboard.fnKey")}
        onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
        onCheckedChange={async (v) => {
          await run("keyboard.fnKey", async () => {
            await systemSettingsUseCases.setKeyboardFnKeyState(v);
            store.setKeyboardFnKey(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.keyboard.autoCorrect")}
        description={t("systemSettings.keyboard.autoCorrectDesc")}
        checked={store.autoCorrect}
        loading={store.applyingKeys.has("keyboard.autoCorrect")}
        onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
        onCheckedChange={async (v) => {
          await run("keyboard.autoCorrect", async () => {
            await systemSettingsUseCases.setAutoCorrectState(v);
            store.setAutoCorrect(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.keyboard.smartQuotes")}
        description={t("systemSettings.keyboard.smartQuotesDesc")}
        checked={store.smartQuotes}
        loading={store.applyingKeys.has("keyboard.smartQuotes")}
        onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
        onCheckedChange={async (v) => {
          await run("keyboard.smartQuotes", async () => {
            await systemSettingsUseCases.setSmartQuotesState(v);
            store.setSmartQuotes(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.keyboard.smartDashes")}
        description={t("systemSettings.keyboard.smartDashesDesc")}
        checked={store.smartDashes}
        loading={store.applyingKeys.has("keyboard.smartDashes")}
        onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
        onCheckedChange={async (v) => {
          await run("keyboard.smartDashes", async () => {
            await systemSettingsUseCases.setSmartDashesState(v);
            store.setSmartDashes(v);
          });
        }}
      />
      <SettingToggle
        label={t("systemSettings.keyboard.autoCapitalize")}
        description={t("systemSettings.keyboard.autoCapitalizeDesc")}
        checked={store.autoCapitalize}
        loading={store.applyingKeys.has("keyboard.autoCapitalize")}
        onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
        onCheckedChange={async (v) => {
          await run("keyboard.autoCapitalize", async () => {
            await systemSettingsUseCases.setAutoCapitalizeState(v);
            store.setAutoCapitalize(v);
          });
        }}
      />
    </SettingGroup>
  );
}
