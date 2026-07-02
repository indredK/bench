import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSystemSettingsStore } from "@/features/system-settings/store";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { useSettingAction } from "@/features/system-settings/useSettingAction";
import { SettingToggle } from "../SettingToggle";
import { SettingGroup } from "@/components/ui/setting-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function LockScreenSection() {
  const { t } = useTranslation();
  const store = useSystemSettingsStore();
  const { run } = useSettingAction();

  useEffect(() => {
    Promise.all([
      systemSettingsUseCases.getLockScreenPasswordEnabled(),
      systemSettingsUseCases.getLockScreenPasswordDelay(),
    ]).then(([enabled, delay]) => {
      store.setLockScreenPassword(enabled);
      store.setLockScreenPasswordDelay(delay);
    }).catch(console.error);
  }, []);

  return (
    <SettingGroup title={t("systemSettings.actions.lockPasswordTitle")}>
      <SettingToggle
        label={t("systemSettings.actions.lockPassword")}
        description={t("systemSettings.actions.lockPasswordDesc")}
        checked={store.lockScreenPassword}
        loading={store.applyingKeys.has("lockScreen.password")}
        onOpenSettings={() => systemSettingsUseCases.openSystemPane("com.apple.Lock-Screen-Settings.extension")}
        onCheckedChange={async (v) => {
          await run("lockScreen.password", async () => {
            await systemSettingsUseCases.setLockScreenPasswordEnabled(v);
            store.setLockScreenPassword(v);
          });
        }}
      />
      {store.lockScreenPassword && (
        <div className="space-y-2 py-2">
          <Label className="text-sm font-medium">{t("systemSettings.actions.lockPasswordDelay")}</Label>
          <div className="flex gap-2 items-center">
            {[0, 5, 10, 30, 60].map((s) => (
              <Button
                key={s}
                variant={store.lockScreenPasswordDelay === s ? "default" : "outline"}
                size="sm"
                disabled={store.applyingKeys.size > 0}
                onClick={async () => {
                  await run("lockScreen.passwordDelay", async () => {
                    await systemSettingsUseCases.setLockScreenPasswordDelay(s);
                    store.setLockScreenPasswordDelay(s);
                  });
                }}
              >
                {s === 0 ? t("systemSettings.actions.delayImmediate") : t("systemSettings.actions.delaySeconds", { seconds: s })}
              </Button>
            ))}
          </div>
        </div>
      )}
    </SettingGroup>
  );
}
