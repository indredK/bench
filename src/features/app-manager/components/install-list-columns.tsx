/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { StickyTableText } from "@/components/ui/StickyTable";
import { InstallSourceBadges, getInstallSourceLabel } from "@/features/app-manager/components/InstallSourceBadges";
import type { InstallListAppInfo } from "@/lib/tauri/types/app-manager";

interface InstallListColumnsOptions {
  t: TFunction;
  onInstall: (app: InstallListAppInfo) => void;
  onOpenWebsite: (url: string | undefined) => void;
  onCopyText: (text: string | undefined) => void;
}

export function createInstallListColumns({
  t,
  onInstall,
  onOpenWebsite,
  onCopyText,
}: InstallListColumnsOptions): ColumnDef<InstallListAppInfo>[] {
  return [
    {
      id: "name",
      header: t("appManager.column.name"),
      accessorFn: (app) => app.name,
      meta: { minWidth: "80px" },
      cell: ({ getValue }) => (
        <StickyTableText className="font-medium text-sm">{getValue() as string}</StickyTableText>
      ),
    },
    {
      id: "description",
      header: t("appManager.column.description"),
      accessorFn: (app) => app.description,
      meta: { minWidth: "120px" },
      cell: ({ getValue }) => (
        <StickyTableText className="text-xs text-muted-foreground">{getValue() as string}</StickyTableText>
      ),
    },
    {
      id: "status",
      header: t("appManager.column.status"),
      accessorFn: (app) => app.installed,
      meta: { width: "76px" },
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
      header: t("appManager.column.source"),
      accessorFn: (app) => getInstallSourceLabel(app.installSource),
      meta: { width: "120px" },
      cell: ({ row }) => (
        <InstallSourceBadges
          installSource={row.original.installSource}
          className="text-[10px]"
        />
      ),
    },
    {
      id: "actions",
      header: t("appManager.column.actions"),
      meta: { width: "160px" },
      cell: ({ row }) => {
        const app = row.original;
        return (
          <div
            className="flex items-center gap-1.5 justify-end"
            onClick={(e) => e.stopPropagation()}
          >
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
              <div className="flex items-center gap-1">
                <ToolbarButton
                  icon={<ExternalLink size={12} />}
                  tooltip={t("appManager.openWebsite")}
                  onClick={() => onOpenWebsite(app.installSource.url)}
                />
                <ToolbarButton
                  icon={<Copy size={12} />}
                  tooltip={t("appManager.copyWebsite")}
                  onClick={() => onCopyText(app.installSource.url)}
                />
              </div>
            )}
          </div>
        );
      },
    },
  ];
}
