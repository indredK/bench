/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import { Monitor } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { FeatureGateReason } from "@/platform/capabilities"
import type { PlatformName } from "@/platform/config"

interface DesktopOnlyProps {
  title: string
  icon?: React.ReactNode
  description?: string
  reason?: FeatureGateReason
  platform?: PlatformName
}

export function DesktopOnly({ title, icon, description, reason, platform }: DesktopOnlyProps) {
  const { t } = useTranslation()

  const message =
    description ||
    (reason === "platform-unsupported" && platform
      ? t("common.platformUnsupported", { platform: t(`common.platformNames.${platform}`) })
      : t("common.desktopOnly"))

  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-5">
      <div className="bg-muted flex size-16 items-center justify-center rounded-full">
        {icon || <Monitor size={32} className="opacity-40" />}
      </div>
      <div className="max-w-sm space-y-1 text-center">
        <h3 className="text-foreground text-base font-semibold">{title}</h3>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  )
}
