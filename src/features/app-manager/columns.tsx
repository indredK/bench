import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Folder, Play, ArrowUpCircle, Trash2, Loader2, CheckCircle2, AlertCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StickyTableText } from "@/components/ui/StickyTable";
import type { AppInfo } from "@/lib/tauri/types";
import type { OperationStatus } from "@/stores/app-manager";

const naturalTextComparator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareAppIdentity(left: AppInfo, right: AppInfo) {
  return (
    naturalTextComparator.compare(left.name, right.name) ||
    naturalTextComparator.compare(left.bundleId, right.bundleId)
  );
}

function compactPath(path: string, maxLength = 46) {
  const separator = "/";
  const parts = path.split("/").filter(Boolean);

  if (path.length <= maxLength || parts.length <= 4) {
    return path;
  }
  const maxTailSegments = Math.min(4, parts.length - 1);
  for (let tailSegments = maxTailSegments; tailSegments >= 2; tailSegments -= 1) {
    const tail = parts.slice(-tailSegments).join(separator);
    const candidate = `/.../${tail}`;
    if (candidate.length <= maxLength || tailSegments === 2) {
      return candidate;
    }
  }
  return path;
}

function copyPath(path: string) {
  navigator.clipboard.writeText(path).catch(() => {});
}

function sourceBadgeVariant(sourceType: string): "default" | "secondary" | "outline" | "destructive" {
  switch (sourceType) {
    case "HomebrewCask": case "Winget": case "Flatpak": case "Snap": case "Apt":
      return "default";
    case "MacBundle": case "MsiInstaller":
      return "secondary";
    case "AppStore": case "WindowsStore":
      return "outline";
    default: return "outline";
  }
}

function sourceTypeLabel(t: TFunction, sourceType: string): string {
  switch (sourceType) {
    case "HomebrewCask": return t("appManager.sourceHomebrewCask");
    case "MacBundle": return t("appManager.sourceMacBundle");
    case "AppStore": return t("appManager.sourceAppStore");
    case "Winget": return "winget";
    case "WindowsStore": return t("appManager.sourceAppStore");
    case "MsiInstaller": return "MSI";
    case "Flatpak": return "Flatpak";
    case "Snap": return "Snap";
    case "Apt": return "APT";
    default: return t("appManager.sourceUnknown");
  }
}

function OperationStatusIcon({ status }: { status: OperationStatus }) {
  switch (status) {
    case "running":
      return <Loader2 size={13} className="animate-spin text-blue-500" />;
    case "success":
      return <CheckCircle2 size={13} className="text-green-500" />;
    case "error":
      return <AlertCircle size={13} className="text-red-500" />;
    default:
      return null;
  }
}

export function createAppManagerColumns(
  t: TFunction,
  getOpStatus: (appId: string) => OperationStatus,
  onLaunch: (app: AppInfo) => void,
  onReveal: (app: AppInfo) => void,
  onUpgrade: (app: AppInfo) => void,
  onUninstall: (app: AppInfo) => void,
): ColumnDef<AppInfo>[] {
  return [
    {
      id: "name",
      header: t("appManager.column.name"),
      accessorFn: (app) => app.name,
      enableSorting: true,
      meta: {
        minWidth: "160px",
      },
      cell: ({ row }) => (
        <div className="min-w-0 space-y-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <StickyTableText className="font-medium">
              {row.original.name}
            </StickyTableText>
            {row.original.isSystemApp && (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                {t("appManager.systemLabel")}
              </Badge>
            )}
            {row.original.upgradeAvailable && (
              <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 py-0">
                {t("appManager.updateAvailable")}
              </Badge>
            )}
          </div>
          <StickyTableText className="text-xs text-muted-foreground">
            {row.original.bundleId !== "unknown" ? row.original.bundleId : "—"}
          </StickyTableText>
        </div>
      ),
      sortingFn: (left, right) => compareAppIdentity(left.original, right.original),
    },
    {
      id: "version",
      header: t("appManager.column.version"),
      accessorKey: "version",
      enableSorting: true,
      meta: { width: "90px" },
      cell: ({ row }) => (
        <span className="text-sm">{row.original.version}</span>
      ),
    },
    {
      id: "sourceType",
      header: t("appManager.column.source"),
      accessorKey: "sourceType",
      enableSorting: true,
      meta: { width: "120px" },
      cell: ({ row }) => {
        const app = row.original;
        return (
          <div className="flex items-center gap-1">
            <Badge variant={sourceBadgeVariant(app.sourceType)} className="text-[10px] px-1.5">
              {sourceTypeLabel(t, app.sourceType)}
            </Badge>
            {app.sourceConfidence > 0 && app.sourceConfidence < 1.0 && (
              <span className="text-[10px] text-muted-foreground">
                {Math.round(app.sourceConfidence * 100)}%
              </span>
            )}
          </div>
        );
      },
      sortingFn: (left, right) =>
        naturalTextComparator.compare(left.original.sourceType, right.original.sourceType) ||
        compareAppIdentity(left.original, right.original),
    },
    {
      id: "path",
      header: t("appManager.column.path"),
      accessorKey: "installPath",
      enableSorting: true,
      meta: {
        width: "auto",
        minWidth: "140px",
      },
      cell: ({ row }) => (
        <StickyTableText
          className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
          title={row.original.installPath}
          onClick={() => copyPath(row.original.installPath)}
        >
          {compactPath(row.original.installPath)}
        </StickyTableText>
      ),
      sortingFn: (left, right) =>
        naturalTextComparator.compare(left.original.installPath, right.original.installPath) ||
        compareAppIdentity(left.original, right.original),
    },
    {
      id: "lastModified",
      header: t("appManager.column.lastModified"),
      accessorKey: "lastModified",
      enableSorting: true,
      sortDescFirst: true,
      meta: {
        width: "120px",
        align: "right",
      },
      cell: ({ row }) => {
        const d = row.original.lastModified;
        if (!d) return <span className="text-sm text-muted-foreground">—</span>;
        const date = new Date(d * 1000);
        return (
          <span className="text-sm text-muted-foreground">
            {date.toLocaleDateString()}
          </span>
        );
      },
      sortingFn: (left, right) =>
        left.original.lastModified - right.original.lastModified ||
        compareAppIdentity(left.original, right.original),
    },
    {
      id: "actions",
      header: t("appManager.column.actions"),
      enableSorting: false,
      meta: {
        width: "160px",
        align: "center",
      },
      cell: ({ row }) => {
        const app = row.original;
        const opStatus = getOpStatus(app.appId);

        return (
          <div className="flex items-center justify-center gap-0.5">
            {/* Launch */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!app.allowedActions.launch}
              title={t("appManager.actionLaunch")}
              onClick={() => onLaunch(app)}
            >
              <Play size={14} />
            </Button>

            {/* Reveal */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!app.allowedActions.reveal}
              title={t("appManager.actionReveal")}
              onClick={() => onReveal(app)}
            >
              <Folder size={14} />
            </Button>

            {/* Upgrade */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!app.allowedActions.upgrade || opStatus === "running"}
              title={
                app.upgradeAvailable
                  ? t("appManager.actionUpgradeAvailable")
                  : t("appManager.actionUpgrade")
              }
              onClick={() => onUpgrade(app)}
            >
              {opStatus === "running" && app.canUpgrade ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowUpCircle
                  size={14}
                  className={app.upgradeAvailable ? "text-orange-500" : ""}
                />
              )}
            </Button>

            {/* Uninstall */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!app.allowedActions.uninstall || opStatus === "running"}
              title={
                app.isSystemApp
                  ? t("appManager.actionUninstallSystemBlocked")
                  : app.sourceType === "Unknown"
                    ? t("appManager.actionUninstallUnknownBlocked")
                    : t("appManager.actionUninstall")
              }
              onClick={() => onUninstall(app)}
            >
              {!app.allowedActions.uninstall ? (
                <ShieldAlert size={14} className="text-muted-foreground/40" />
              ) : opStatus === "running" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </Button>

            {/* Operation status indicator */}
            <OperationStatusIcon status={opStatus} />
          </div>
        );
      },
    },
  ];
}
