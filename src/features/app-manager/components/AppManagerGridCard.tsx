/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { AppIcon } from "@/features/app-manager/components/AppIcon"
import type { AppInfo } from "@/lib/tauri/types/app-manager"

interface AppManagerGridCardProps {
  app: AppInfo
}

export function AppManagerGridCard({ app }: AppManagerGridCardProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-card hover:ring-primary/30 flex h-full flex-col gap-2 rounded-xl border p-3 transition-all hover:ring-2">
      <div className="flex items-center gap-2">
        <AppIcon
          iconBase64={app.iconBase64}
          installPath={app.installPath}
          size={20}
          className="shrink-0 rounded-sm"
        />
        <span className="truncate text-sm font-medium">{app.name}</span>
        {app.isSystemApp && (
          <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[10px]">
            {t("appManager.systemLabel")}
          </Badge>
        )}
        {app.upgradeAvailable && (
          <Badge variant="destructive" className="shrink-0 px-1 py-0 text-[10px]">
            {t("appManager.updateAvailable")}
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground truncate text-xs">
        {app.bundleId !== "unknown" ? app.bundleId : "—"}
      </p>
      <p className="text-muted-foreground truncate text-xs">{app.version}</p>
      <p className="text-muted-foreground truncate text-[10px]">{app.sourceType}</p>
    </div>
  )
}
