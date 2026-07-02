import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "../SettingToggle";
import { SettingGroup } from "@/components/ui/setting-group";
import { canUseTauriWindow } from "@/platform/capabilities";

export function KeyboardSection() {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  const refresh = useCallback(() => {
    systemSettingsUseCases.getKeyboardFnKeyState().then(store.setKeyboardFnKey).catch(console.error);
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
        onOpenSettings={() => systemSettingsUseCases.openSystemPane("com.apple.Keyboard-Settings.extension")}
        onCheckedChange={async (v) => {
          await run("keyboard.fnKey", async () => {
            await systemSettingsUseCases.setKeyboardFnKeyState(v);
            store.setKeyboardFnKey(v);
          });
        }}
      />
    </SettingGroup>
  );
}
