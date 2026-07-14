import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "../SettingToggle"
import { SettingGroup } from "@/components/ui/setting-group"
import { useSettingsSectionLoader } from "@/features/system-settings/hooks/useSettingsSectionLoader"
import { SettingsSectionState } from "@/features/system-settings/components/SettingsSectionState"

export function KeyboardSection() {
  const { t } = useTranslation()
  const keyboardFnKey = useSystemSettingsStore((s) => s.keyboardFnKey)
  const autoCorrect = useSystemSettingsStore((s) => s.autoCorrect)
  const smartQuotes = useSystemSettingsStore((s) => s.smartQuotes)
  const smartDashes = useSystemSettingsStore((s) => s.smartDashes)
  const autoCapitalize = useSystemSettingsStore((s) => s.autoCapitalize)
  const applyingKeys = useSystemSettingsStore((s) => s.applyingKeys)
  const { run } = useSettingAction()

  const refresh = useCallback(async () => {
    const s = useSystemSettingsStore.getState()
    const [fnKey, autoCorrect, smartQuotes, smartDashes, autoCapitalize] = await Promise.all([
      systemSettingsUseCases.getKeyboardFnKeyState(),
      systemSettingsUseCases.getAutoCorrectState(),
      systemSettingsUseCases.getSmartQuotesState(),
      systemSettingsUseCases.getSmartDashesState(),
      systemSettingsUseCases.getAutoCapitalizeState(),
    ])
    s.setKeyboardFnKey(fnKey)
    s.setAutoCorrect(autoCorrect)
    s.setSmartQuotes(smartQuotes)
    s.setSmartDashes(smartDashes)
    s.setAutoCapitalize(autoCapitalize)
  }, [])
  const section = useSettingsSectionLoader(refresh)

  return (
    <SettingGroup title={t("systemSettings.keyboard.title")}>
      <SettingsSectionState
        status={section.status}
        error={section.error}
        onRetry={() => void section.reload()}
      >
        <SettingToggle
          label={t("systemSettings.keyboard.fnKeys")}
          description={t("systemSettings.keyboard.fnKeysDesc")}
          checked={keyboardFnKey}
          loading={applyingKeys.has("keyboard.fnKey")}
          onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
          onCheckedChange={async (v) => {
            await run("keyboard.fnKey", async () => {
              await systemSettingsUseCases.setKeyboardFnKeyState(v)
              useSystemSettingsStore.getState().setKeyboardFnKey(v)
            })
          }}
        />
        <SettingToggle
          label={t("systemSettings.keyboard.autoCorrect")}
          description={t("systemSettings.keyboard.autoCorrectDesc")}
          checked={autoCorrect}
          loading={applyingKeys.has("keyboard.autoCorrect")}
          onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
          onCheckedChange={async (v) => {
            await run("keyboard.autoCorrect", async () => {
              await systemSettingsUseCases.setAutoCorrectState(v)
              useSystemSettingsStore.getState().setAutoCorrect(v)
            })
          }}
        />
        <SettingToggle
          label={t("systemSettings.keyboard.smartQuotes")}
          description={t("systemSettings.keyboard.smartQuotesDesc")}
          checked={smartQuotes}
          loading={applyingKeys.has("keyboard.smartQuotes")}
          onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
          onCheckedChange={async (v) => {
            await run("keyboard.smartQuotes", async () => {
              await systemSettingsUseCases.setSmartQuotesState(v)
              useSystemSettingsStore.getState().setSmartQuotes(v)
            })
          }}
        />
        <SettingToggle
          label={t("systemSettings.keyboard.smartDashes")}
          description={t("systemSettings.keyboard.smartDashesDesc")}
          checked={smartDashes}
          loading={applyingKeys.has("keyboard.smartDashes")}
          onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
          onCheckedChange={async (v) => {
            await run("keyboard.smartDashes", async () => {
              await systemSettingsUseCases.setSmartDashesState(v)
              useSystemSettingsStore.getState().setSmartDashes(v)
            })
          }}
        />
        <SettingToggle
          label={t("systemSettings.keyboard.autoCapitalize")}
          description={t("systemSettings.keyboard.autoCapitalizeDesc")}
          checked={autoCapitalize}
          loading={applyingKeys.has("keyboard.autoCapitalize")}
          onOpenSettings={() => systemSettingsUseCases.openKeyboardSettings()}
          onCheckedChange={async (v) => {
            await run("keyboard.autoCapitalize", async () => {
              await systemSettingsUseCases.setAutoCapitalizeState(v)
              useSystemSettingsStore.getState().setAutoCapitalize(v)
            })
          }}
        />
      </SettingsSectionState>
    </SettingGroup>
  )
}
