import { useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "../SettingToggle"
import { SettingGroup } from "@/components/ui/setting-group"
import { canUseTauriWindow } from "@/platform/capabilities"

export function DisplaySection() {
  const { t } = useTranslation()
  const displayBatteryPercent = useSystemSettingsStore((s) => s.displayBatteryPercent)
  const applyingKeys = useSystemSettingsStore((s) => s.applyingKeys)
  const { run } = useSettingAction()

  const refresh = useCallback(() => {
    systemSettingsUseCases
      .getDisplayBatteryPercent()
      .then((v) => useSystemSettingsStore.getState().setDisplayBatteryPercent(v))
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
    <SettingGroup title={t("systemSettings.display.title")}>
      <SettingToggle
        label={t("systemSettings.display.batteryPercent")}
        description={t("systemSettings.display.batteryPercentDesc")}
        checked={displayBatteryPercent}
        loading={applyingKeys.has("display.batteryPercent")}
        onCheckedChange={async (v) => {
          await run("display.batteryPercent", async () => {
            await systemSettingsUseCases.setDisplayBatteryPercent(v)
            // 设置成功后刷新一次,确保 store 与后端 defaults 值一致。
            // Tahoe+ 上后端写入 ByHost/com.apple.controlcenter Battery (2=显示/8=隐藏) + killall ControlCenter,
            // 旧版本写入 ShowPercent + killall SystemUIServer/ControlCenter,均可直接生效。
            refresh()
          })
        }}
      />
    </SettingGroup>
  )
}
