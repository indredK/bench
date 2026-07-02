import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingGroup } from "@/components/ui/setting-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { canUseTauriWindow } from "@/platform/capabilities";

export function DockSection() {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  const refresh = useCallback(() => {
    systemSettingsUseCases.getDockOrientation().then(store.setDockOrientation).catch(console.error);
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
    <SettingGroup title={t("systemSettings.dock.title")}>
      <div className="flex items-center justify-between py-2">
        <Label className="text-sm font-medium">{t("systemSettings.dock.position")}</Label>
        <div className="flex gap-2">
          {(["left", "bottom", "right"] as const).map((pos) => (
            <Button
              key={pos}
              variant={store.dockOrientation === pos ? "default" : "outline"}
              size="sm"
              disabled={store.applyingKeys.size > 0}
              onClick={async () => {
                await run("dock.orientation", async () => {
                  await systemSettingsUseCases.setDockOrientation(pos);
                  store.setDockOrientation(pos);
                });
              }}
            >
              {t(`systemSettings.dock.positions.${pos}`)}
            </Button>
          ))}
        </div>
      </div>
    </SettingGroup>
  );
}
