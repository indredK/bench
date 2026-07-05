/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next"
import { CheckCircle2, Download, ExternalLink, Package, RotateCcw } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToolbarButton } from "@/components/ui/toolbar-button"
import { InstallSourceBadges } from "@/features/app-manager/components/InstallSourceBadges"
import type { OperationStatus } from "@/features/app-manager/store"
import type { InstallListAppInfo } from "@/lib/tauri/types/app-manager"

interface InstallListCardProps {
  app: InstallListAppInfo
  t: TFunction
  status: OperationStatus | undefined
  onInstall: (app: InstallListAppInfo) => void
  onOpenWebsite: (url: string | undefined) => void
  onCopyText: (text: string | undefined) => void
}

export function InstallListCard({
  app,
  t,
  status,
  onInstall,
  onOpenWebsite,
  onCopyText,
}: InstallListCardProps) {
  const isInstalling = status === "running"

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="bg-card hover:ring-primary/30 relative flex h-full flex-col rounded-xl border p-4 transition-all hover:ring-2">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
              {app.installed ? (
                <CheckCircle2 size={18} className="text-green-600" />
              ) : (
                <Package size={18} className="text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="truncate pr-16 text-sm font-medium">{app.name}</h4>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">{t(`appManager.recommendedApps.${app.id}`, { defaultValue: app.description })}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <InstallSourceBadges installSource={app.installSource} />
              </div>
              {app.installed && (app.installedVersion || app.installedPath) && (
                <div className="text-muted-foreground mt-1.5 space-y-0.5 text-[11px]">
                  {app.installedVersion && <p className="truncate">{app.installedVersion}</p>}
                  {app.installedPath && <p className="truncate">{app.installedPath}</p>}
                </div>
              )}
            </div>
          </div>

          {app.installed ? (
            <Badge variant="secondary" className="absolute top-3 right-3 px-1.5 py-0.5 text-[10px]">
              {t("appManager.installListInstalled")}
            </Badge>
          ) : (
            <Badge variant="outline" className="absolute top-3 right-3 px-1.5 py-0.5 text-[10px]">
              {t("appManager.installListPending")}
            </Badge>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <Button
              className="h-8 flex-1"
              size="sm"
              disabled={isInstalling || app.installed}
              onClick={() => onInstall(app)}
            >
              {isInstalling ? (
                <>
                  <RotateCcw size={13} className="mr-1 animate-spin" />
                  {t("appManager.installing")}
                </>
              ) : app.installed ? (
                <>
                  <CheckCircle2 size={13} className="mr-1" />
                  {t("appManager.installListInstalled")}
                </>
              ) : (
                <>
                  <Download size={13} className="mr-1" />
                  {t("appManager.install")}
                </>
              )}
            </Button>
            {app.installSource.url && (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <ToolbarButton
                    icon={<ExternalLink size={14} />}
                    tooltip={t("appManager.openWebsite")}
                    onClick={() => onOpenWebsite(app.installSource.url)}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => onCopyText(app.installSource.url)}>
                    {t("appManager.copyWebsite")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {app.installedPath && (
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onCopyText(app.installedPath)}>
            {t("appManager.copyPath")}
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}
