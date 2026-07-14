import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "../SettingToggle"
import { SettingGroup } from "@/components/ui/setting-group"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useSettingsSectionLoader } from "@/features/system-settings/hooks/useSettingsSectionLoader"
import { SettingsSectionState } from "@/features/system-settings/components/SettingsSectionState"

export function LockScreenSection() {
  const { t } = useTranslation()
  const lockScreenPassword = useSystemSettingsStore((s) => s.lockScreenPassword)
  const lockScreenPasswordDelay = useSystemSettingsStore((s) => s.lockScreenPasswordDelay)
  const applyingKeys = useSystemSettingsStore((s) => s.applyingKeys)
  const { run } = useSettingAction()

  const refresh = useCallback(async () => {
    const s = useSystemSettingsStore.getState()
    const [enabled, delay] = await Promise.all([
      systemSettingsUseCases.getLockScreenPasswordEnabled(),
      systemSettingsUseCases.getLockScreenPasswordDelay(),
    ])
    s.setLockScreenPassword(enabled)
    s.setLockScreenPasswordDelay(delay)
  }, [])
  const section = useSettingsSectionLoader(refresh)

  return (
    <SettingGroup title={t("systemSettings.actions.lockPasswordTitle")}>
      <SettingsSectionState
        status={section.status}
        error={section.error}
        onRetry={() => void section.reload()}
      >
        <SettingToggle
          label={t("systemSettings.actions.lockPassword")}
          description={t("systemSettings.actions.lockPasswordDesc")}
          checked={lockScreenPassword}
          loading={applyingKeys.has("lockScreen.password")}
          onOpenSettings={() => systemSettingsUseCases.openLockScreenSettings()}
          onCheckedChange={async (v) => {
            await run("lockScreen.password", async () => {
              await systemSettingsUseCases.setLockScreenPasswordEnabled(v)
              useSystemSettingsStore.getState().setLockScreenPassword(v)
            })
          }}
        />
        {lockScreenPassword && (
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">
              {t("systemSettings.actions.lockPasswordDelay")}
            </Label>
            <div className="flex items-center gap-2">
              {[0, 5, 10, 30, 60].map((s) => (
                <Button
                  key={s}
                  variant={lockScreenPasswordDelay === s ? "default" : "outline"}
                  size="sm"
                  disabled={applyingKeys.size > 0}
                  onClick={async () => {
                    await run("lockScreen.passwordDelay", async () => {
                      await systemSettingsUseCases.setLockScreenPasswordDelay(s)
                      useSystemSettingsStore.getState().setLockScreenPasswordDelay(s)
                    })
                  }}
                >
                  {s === 0
                    ? t("systemSettings.actions.delayImmediate")
                    : t("systemSettings.actions.delaySeconds", { seconds: s })}
                </Button>
              ))}
            </div>
          </div>
        )}
      </SettingsSectionState>
    </SettingGroup>
  )
}
