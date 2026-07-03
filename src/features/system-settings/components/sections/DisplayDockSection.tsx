import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "../SettingToggle";
import { SettingGroup } from "@/components/ui/setting-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { canUseTauriWindow } from "@/platform/capabilities";

interface DisplayDockSectionProps {
  className?: string;
}

export function DisplayDockSection({ className }: DisplayDockSectionProps) {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  const refresh = useCallback(() => {
    systemSettingsUseCases.getDisplayBatteryPercent().then(store.setDisplayBatteryPercent).catch(console.error);
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
    <SettingGroup title={t("systemSettings.display.title")} className={className}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <SettingToggle
          label={t("systemSettings.display.batteryPercent")}
          description={t("systemSettings.display.batteryPercentDesc")}
          checked={store.displayBatteryPercent}
          loading={store.applyingKeys.has("display.batteryPercent")}
          onOpenSettings={() => systemSettingsUseCases.openControlCenterSettings()}
          onCheckedChange={async (v) => {
            await run("display.batteryPercent", async () => {
              await systemSettingsUseCases.setDisplayBatteryPercent(v);
              refresh();
            });
          }}
        />
        <div className="flex items-center justify-between py-2">
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={() => systemSettingsUseCases.openDesktopSettings()}
          >
            <Label className="text-sm font-medium hover:text-foreground transition-colors">
              {t("systemSettings.dock.position")}
            </Label>
            <ExternalLink
              size={12}
              className="text-muted-foreground hover:text-foreground transition-colors"
            />
          </div>
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
      </div>
    </SettingGroup>
  );
}
