import type { TFunction } from "i18next";
import { Badge } from "@/components/ui/badge";
import { AppIcon } from "@/features/app-manager/components/AppIcon";
import type { AppInfo } from "@/lib/tauri/types/app-manager";

interface AppManagerGridCardProps {
  app: AppInfo;
  t: TFunction;
}

export function AppManagerGridCard({ app, t }: AppManagerGridCardProps) {
  return (
    <div className="rounded-xl border bg-card p-3 hover:ring-2 hover:ring-primary/30 transition-all h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AppIcon iconBase64={app.iconBase64} size={20} className="shrink-0 rounded-sm" />
        <span className="font-medium text-sm truncate">{app.name}</span>
        {app.isSystemApp && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
            {t("appManager.systemLabel")}
          </Badge>
        )}
        {app.upgradeAvailable && (
          <Badge variant="destructive" className="text-[10px] px-1 py-0 shrink-0">
            {t("appManager.updateAvailable")}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground truncate">
        {app.bundleId !== "unknown" ? app.bundleId : "—"}
      </p>
      <p className="text-xs text-muted-foreground truncate">{app.version}</p>
      <p className="text-[10px] text-muted-foreground truncate">{app.sourceType}</p>
    </div>
  );
}
