import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "../SettingToggle"
import { SettingChoiceButtons } from "../SettingChoiceButtons"
import { SettingGroup } from "@/components/ui/setting-group"
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
      {section.status === "error" ? (
        <SettingsSectionState
          status="error"
          error={section.error}
          onRetry={() => void section.reload()}
        >
          <div />
        </SettingsSectionState>
      ) : (
        <>
          <SettingToggle
            label={t("systemSettings.actions.lockPassword")}
            description={t("systemSettings.actions.lockPasswordDesc")}
            checked={lockScreenPassword}
            loading={section.status === "loading" || applyingKeys.has("lockScreen.password")}
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
              <SettingChoiceButtons
                value={lockScreenPasswordDelay}
                loading={section.status === "loading"}
                disabled={applyingKeys.size > 0}
                options={[0, 5, 10, 30, 60].map((seconds) => ({
                  value: seconds,
                  label:
                    seconds === 0
                      ? t("systemSettings.actions.delayImmediate")
                      : t("systemSettings.actions.delaySeconds", { seconds }),
                }))}
                onSelect={async (seconds) => {
                  await run("lockScreen.passwordDelay", async () => {
                    await systemSettingsUseCases.setLockScreenPasswordDelay(seconds)
                    useSystemSettingsStore.getState().setLockScreenPasswordDelay(seconds)
                  })
                }}
              />
            </div>
          )}
        </>
      )}
    </SettingGroup>
  )
}
