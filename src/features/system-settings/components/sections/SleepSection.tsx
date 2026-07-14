import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "../SettingToggle"
import { SettingGroup } from "@/components/ui/setting-group"
import { useSettingsSectionLoader } from "@/features/system-settings/hooks/useSettingsSectionLoader"
import { SettingsSectionState } from "@/features/system-settings/components/SettingsSectionState"

export function SleepSection() {
  const { t } = useTranslation()
  const sleepState = useSystemSettingsStore((s) => s.sleepState)
  const applyingKeys = useSystemSettingsStore((s) => s.applyingKeys)
  const { run } = useSettingAction()

  const refresh = useCallback(async () => {
    const state = await systemSettingsUseCases.getSleepInhibitorState()
    useSystemSettingsStore.getState().setSleepState(state)
  }, [])
  const section = useSettingsSectionLoader(refresh)

  return (
    <SettingGroup title={t("systemSettings.sleep.title")}>
      {section.status === "error" ? (
        <SettingsSectionState
          status="error"
          error={section.error}
          onRetry={() => void section.reload()}
        >
          <div />
        </SettingsSectionState>
      ) : (
        <SettingToggle
          label={t("systemSettings.sleep.preventSleep")}
          description={t("systemSettings.sleep.preventSleepDesc")}
          checked={sleepState?.enabled ?? false}
          loading={section.status === "loading" || applyingKeys.has("sleep.preventSleep")}
          onCheckedChange={async (v) => {
            await run("sleep.preventSleep", async () => {
              const state = await systemSettingsUseCases.toggleSleepInhibitor(
                { prevent_sleep: true, prevent_display: true, auto_disable_on_exit: true },
                v,
              )
              useSystemSettingsStore.getState().setSleepState(state)
            })
          }}
        />
      )}
    </SettingGroup>
  )
}
