/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import i18n from "@/i18n/config"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { InstallSource } from "@/lib/tauri/types/app-manager"

interface InstallSourceBadgesProps {
  installSource: InstallSource
  className?: string
}

export function InstallSourceBadges({
  installSource,
  className = "text-[10px] px-1 py-0",
}: InstallSourceBadgesProps) {
  const { t } = useTranslation()
  const labels: string[] = []
  if (installSource.brew) labels.push(t("appManager.sourceHomebrewCask"))
  if (installSource.winget) labels.push(t("appManager.sourceWinget"))
  if (installSource.flatpak) labels.push(t("appManager.sourceFlatpak"))
  if (installSource.snap) labels.push(t("appManager.sourceSnap"))
  if (installSource.apt) labels.push(t("appManager.sourceApt"))
  if (labels.length === 0 && installSource.url) labels.push(t("appManager.sourceDownload"))

  if (labels.length === 0) return null

  const primary = labels[0]
  const extra = labels.length - 1

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Badge variant="secondary" className={className}>
            {primary}
          </Badge>
          {extra > 0 && (
            <Badge variant="outline" className={className}>
              +{extra}
            </Badge>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="p-1.5">
        <div className="flex flex-wrap gap-1">
          {labels.map((label, i) => (
            <Badge key={i} variant="secondary" className="px-1 py-0 text-[10px]">
              {label}
            </Badge>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function getInstallSourceLabel(installSource: InstallSource): string {
  if (installSource.brew) return i18n.t("appManager.sourceHomebrewCask")
  if (installSource.winget) return i18n.t("appManager.sourceWinget")
  if (installSource.flatpak) return i18n.t("appManager.sourceFlatpak")
  if (installSource.snap) return i18n.t("appManager.sourceSnap")
  if (installSource.apt) return i18n.t("appManager.sourceApt")
  return i18n.t("appManager.sourceDownload")
}
