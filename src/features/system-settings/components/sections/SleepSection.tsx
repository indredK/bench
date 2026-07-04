import { useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "../SettingToggle"
import { SettingGroup } from "@/components/ui/setting-group"
import { canUseTauriWindow } from "@/platform/capabilities"

export function SleepSection() {
  const { t } = useTranslation()
  const sleepState = useSystemSettingsStore((s) => s.sleepState)
  const applyingKeys = useSystemSettingsStore((s) => s.applyingKeys)
  const { run } = useSettingAction()

  const refresh = useCallback(() => {
    systemSettingsUseCases
      .getSleepInhibitorState()
      .then((v) => useSystemSettingsStore.getState().setSleepState(v))
      .catch(console.error)
  }, [])

  useEffect(() => {
    refresh()

    let unlisten: (() => void) | undefined

    if (canUseTauriWindow()) {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        const win = getCurrentWindow()
        win
          .onFocusChanged(({ payload: focused }) => {
            if (focused) refresh()
          })
          .then((un) => {
            unlisten = un
          })
      })
    }

    return () => {
      unlisten?.()
    }
  }, [refresh])

  return (
    <SettingGroup title={t("systemSettings.sleep.title")}>
      <SettingToggle
        label={t("systemSettings.sleep.preventSleep")}
        description={t("systemSettings.sleep.preventSleepDesc")}
        checked={sleepState?.enabled ?? false}
        loading={applyingKeys.has("sleep.preventSleep")}
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
    </SettingGroup>
  )
}
