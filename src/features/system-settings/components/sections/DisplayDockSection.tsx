import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ExternalLink } from "lucide-react"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { SettingToggle } from "../SettingToggle"
import { SettingChoiceButtons } from "../SettingChoiceButtons"
import { SettingGroup } from "@/components/ui/setting-group"
import { Label } from "@/components/ui/label"
import { useSettingsSectionLoader } from "@/features/system-settings/hooks/useSettingsSectionLoader"
import { SettingsSectionState } from "@/features/system-settings/components/SettingsSectionState"

interface DisplayDockSectionProps {
  className?: string
}

export function DisplayDockSection({ className }: DisplayDockSectionProps) {
  const { t } = useTranslation()
  const displayBatteryPercent = useSystemSettingsStore((s) => s.displayBatteryPercent)
  const dockOrientation = useSystemSettingsStore((s) => s.dockOrientation)
  const minimizeScaleEnabled = useSystemSettingsStore((s) => s.minimizeScaleEnabled)
  const applyingKeys = useSystemSettingsStore((s) => s.applyingKeys)
  const { run } = useSettingAction()

  const refresh = useCallback(async () => {
    const s = useSystemSettingsStore.getState()
    const [batteryPercent, orientation, minimizeScale] = await Promise.all([
      systemSettingsUseCases.getDisplayBatteryPercent(),
      systemSettingsUseCases.getDockOrientation(),
      systemSettingsUseCases.getMinimizeScaleEnabled(),
    ])
    s.setDisplayBatteryPercent(batteryPercent)
    s.setDockOrientation(orientation)
    s.setMinimizeScaleEnabled(minimizeScale)
  }, [])
  const section = useSettingsSectionLoader("display-dock", refresh)

  return (
    <SettingGroup title={t("systemSettings.display.title")} className={className}>
      {section.status === "error" ? (
        <SettingsSectionState
          status="error"
          error={section.error}
          onRetry={() => void section.reload()}
        >
          <div />
        </SettingsSectionState>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <SettingToggle
            label={t("systemSettings.display.batteryPercent")}
            description={t("systemSettings.display.batteryPercentDesc")}
            checked={displayBatteryPercent}
            loading={section.status === "loading" || applyingKeys.has("display.batteryPercent")}
            onOpenSettings={() => systemSettingsUseCases.openControlCenterSettings()}
            onCheckedChange={async (v) => {
              await run("display.batteryPercent", async () => {
                await systemSettingsUseCases.setDisplayBatteryPercent(v)
                refresh()
              })
            }}
          />
          <div className="flex items-center justify-between py-2">
            <div
              className="flex cursor-pointer items-center gap-1.5"
              onClick={() => systemSettingsUseCases.openDesktopSettings()}
            >
              <Label className="hover:text-foreground text-sm font-medium transition-colors">
                {t("systemSettings.dock.position")}
              </Label>
              <ExternalLink
                size={12}
                className="text-muted-foreground hover:text-foreground transition-colors"
              />
            </div>
            <SettingChoiceButtons
              value={dockOrientation}
              loading={section.status === "loading"}
              disabled={applyingKeys.size > 0}
              options={[
                { value: "left", label: t("systemSettings.dock.positions.left") },
                { value: "bottom", label: t("systemSettings.dock.positions.bottom") },
                { value: "right", label: t("systemSettings.dock.positions.right") },
              ]}
              onSelect={async (pos) => {
                await run("dock.orientation", async () => {
                  await systemSettingsUseCases.setDockOrientation(pos)
                  useSystemSettingsStore.getState().setDockOrientation(pos)
                })
              }}
            />
          </div>
          <SettingToggle
            label={t("systemSettings.dock.minimizeScale")}
            description={t("systemSettings.dock.minimizeScaleDesc")}
            checked={minimizeScaleEnabled}
            loading={section.status === "loading" || applyingKeys.has("dock.minimizeScale")}
            onOpenSettings={() => systemSettingsUseCases.openDesktopSettings()}
            onCheckedChange={async (v) => {
              await run("dock.minimizeScale", async () => {
                await systemSettingsUseCases.setMinimizeScaleEnabled(v)
                useSystemSettingsStore.getState().setMinimizeScaleEnabled(v)
              })
            }}
          />
        </div>
      )}
    </SettingGroup>
  )
}
