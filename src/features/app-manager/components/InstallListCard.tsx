/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { CheckCircle2, Download, ExternalLink, Package, RotateCcw } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { InstallSourceBadges } from "@/features/app-manager/components/InstallSourceBadges";
import type { OperationStatus } from "@/features/app-manager/store";
import type { InstallListAppInfo } from "@/lib/tauri/types/app-manager";

interface InstallListCardProps {
  app: InstallListAppInfo;
  t: TFunction;
  status: OperationStatus | undefined;
  onInstall: (app: InstallListAppInfo) => void;
  onOpenWebsite: (url: string | undefined) => void;
  onCopyText: (text: string | undefined) => void;
}

export function InstallListCard({
  app,
  t,
  status,
  onInstall,
  onOpenWebsite,
  onCopyText,
}: InstallListCardProps) {
  const isInstalling = status === "running";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="rounded-xl border bg-card p-4 flex flex-col hover:ring-2 hover:ring-primary/30 transition-all h-full relative">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="size-9 shrink-0 rounded-md bg-muted flex items-center justify-center">
              {app.installed ? (
                <CheckCircle2 size={18} className="text-green-600" />
              ) : (
                <Package size={18} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium truncate pr-16">{app.name}</h4>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{app.description}</p>
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <InstallSourceBadges installSource={app.installSource} />
              </div>
              {app.installed && (app.installedVersion || app.installedPath) && (
                <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                  {app.installedVersion && <p className="truncate">{app.installedVersion}</p>}
                  {app.installedPath && <p className="truncate">{app.installedPath}</p>}
                </div>
              )}
            </div>
          </div>

          {app.installed ? (
            <Badge variant="secondary" className="absolute top-3 right-3 text-[10px] px-1.5 py-0.5">
              {t("appManager.installListInstalled")}
            </Badge>
          ) : (
            <Badge variant="outline" className="absolute top-3 right-3 text-[10px] px-1.5 py-0.5">
              {t("appManager.installListPending")}
            </Badge>
          )}

          <div className="flex items-center gap-1.5 mt-2.5">
            <Button
              className="flex-1 h-8"
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
  );
}
