/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next"
import {
  ArrowUpCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Folder,
  Package,
  Play,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DetailSection, MetadataRow } from "@/components/layout/DetailPanel"
import { AppIcon } from "@/features/app-manager/components/AppIcon"
import { getInstallSourceLabel } from "@/features/app-manager/components/InstallSourceBadges"
import { appManagerPlatformConfig } from "@/platform/config"
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager"

interface AppDetailProps {
  app: AppInfo
  t: TFunction
  onLaunch: (app: AppInfo) => void
  onReveal: (app: AppInfo) => void
  onUpgrade: () => void
  onUninstall: () => void
}

export function AppDetail({ app, t, onLaunch, onReveal, onUpgrade, onUninstall }: AppDetailProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AppIcon
          iconBase64={app.iconBase64}
          installPath={app.installPath}
          size={40}
          className="shrink-0 rounded-md"
        />
        <div>
          <h3 className="text-sm font-semibold">{app.name}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">{app.bundleId}</p>
        </div>
      </div>
      <DetailSection label={t("appManager.info")}>
        <MetadataRow label={t("appManager.detailVersion")} value={app.version} />
        <MetadataRow label={t("appManager.detailPath")} value={app.installPath} />
        <MetadataRow label={t("appManager.detailSource")} value={app.sourceType} />
        <MetadataRow label={t("appManager.detailSourceId")} value={app.sourceId || "—"} />
        <MetadataRow
          label={t("appManager.detailType")}
          value={app.isSystemApp ? t("appManager.filterSystem") : t("appManager.filterUser")}
        />
        {app.lastModified > 0 && (
          <MetadataRow
            label={t("appManager.detailModified")}
            value={new Date(app.lastModified * 1000).toLocaleDateString()}
          />
        )}
      </DetailSection>
      <DetailSection label={t("appManager.column.actions")}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!app.allowedActions.launch} onClick={() => onLaunch(app)}>
            <Play size={13} className="mr-1" />
            {t("appManager.actionLaunch")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!app.allowedActions.reveal}
            onClick={() => onReveal(app)}
          >
            <Folder size={13} className="mr-1" />
            {t(appManagerPlatformConfig.revealActionLabel)}
          </Button>
          {app.allowedActions.upgrade && (
            <Button size="sm" variant="outline" onClick={onUpgrade}>
              <ArrowUpCircle size={13} className="mr-1" />
              {t("appManager.actionUpgrade")}
            </Button>
          )}
          {app.allowedActions.uninstall && (
            <Button size="sm" variant="outline" className="text-red-600" onClick={onUninstall}>
              <Trash2 size={13} className="mr-1" />
              {t("appManager.actionUninstall")}
            </Button>
          )}
        </div>
      </DetailSection>
    </div>
  )
}

interface InstallDetailProps {
  app: InstallListAppInfo
  t: TFunction
  onInstall: (app: InstallListAppInfo) => void
  onOpenWebsite: (url: string | undefined) => void
}

export function InstallDetail({ app, t, onInstall, onOpenWebsite }: InstallDetailProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
          {app.installed ? (
            <CheckCircle2 size={20} className="text-green-600" />
          ) : (
            <Package size={20} className="text-muted-foreground" />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{app.name}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">{app.bundleId}</p>
        </div>
      </div>
      <DetailSection label={t("appManager.info")}>
        {app.installedVersion && (
          <MetadataRow label={t("appManager.detailVersion")} value={app.installedVersion} />
        )}
        {app.installedPath && (
          <MetadataRow label={t("appManager.detailPath")} value={app.installedPath} />
        )}
        <MetadataRow
          label={t("appManager.detailSource")}
          value={getInstallSourceLabel(app.installSource)}
        />
        {app.description && (
          <MetadataRow label={t("appManager.column.description")} value={t(`appManager.recommendedApps.${app.id}`, { defaultValue: app.description })} />
        )}
      </DetailSection>
      <DetailSection label={t("appManager.column.actions")}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={app.installed} onClick={() => onInstall(app)}>
            <Download size={13} className="mr-1" />
            {app.installed ? t("appManager.installListInstalled") : t("appManager.install")}
          </Button>
          {app.installSource.url && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenWebsite(app.installSource.url)}
            >
              <ExternalLink size={13} className="mr-1" />
              {t("appManager.openWebsite")}
            </Button>
          )}
        </div>
      </DetailSection>
    </div>
  )
}
