/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { InstallSourceBadges, getInstallSourceLabel } from "@/features/app-manager/components/InstallSourceBadges";
import type { InstallListAppInfo } from "@/lib/tauri/types/app-manager";

interface InstallListColumnsOptions {
  t: TFunction;
  onInstall: (app: InstallListAppInfo) => void;
  onOpenWebsite: (url: string | undefined) => void;
}

export function createInstallListColumns({
  t,
  onInstall,
  onOpenWebsite,
}: InstallListColumnsOptions): ColumnDef<InstallListAppInfo>[] {
  return [
    {
      id: "name",
      header: t("appManager.column.name"),
      accessorFn: (app) => app.name,
      cell: ({ getValue }) => (
        <span className="font-medium text-sm truncate">{getValue() as string}</span>
      ),
    },
    {
      id: "description",
      header: t("appManager.column.description"),
      accessorFn: (app) => app.description,
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground truncate">{getValue() as string}</span>
      ),
    },
    {
      id: "status",
      header: t("appManager.column.status"),
      accessorFn: (app) => app.installed,
      cell: ({ row }) => {
        const app = row.original;
        return app.installed ? (
          <Badge variant="secondary" className="text-[10px]">
            {t("appManager.installListInstalled")}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            {t("appManager.installListPending")}
          </Badge>
        );
      },
    },
    {
      id: "source",
      header: "Source",
      accessorFn: (app) => getInstallSourceLabel(app.installSource),
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap">
          <InstallSourceBadges
            installSource={row.original.installSource}
            className="text-[10px]"
          />
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const app = row.original;
        return (
          <div className="flex items-center gap-1.5 justify-end">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={app.installed}
              onClick={() => onInstall(app)}
            >
              <Download size={12} className="mr-1" />
              {t("appManager.install")}
            </Button>
            {app.installSource.url && (
              <ToolbarButton
                icon={<ExternalLink size={12} />}
                tooltip={t("appManager.openWebsite")}
                onClick={() => onOpenWebsite(app.installSource.url)}
              />
            )}
          </div>
        );
      },
    },
  ];
}
