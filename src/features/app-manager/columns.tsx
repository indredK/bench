import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Globe, Folder, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StickyTableText } from "@/components/ui/StickyTable";
import type { AppInfo } from "@/lib/tauri/types";

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

function compactPath(path: string, maxLength = 52) {
  const separator = "/";
  const parts = path.split("/").filter(Boolean);

  if (path.length <= maxLength || parts.length <= 4) {
    return path;
  }

  const prefix = separator;
  const maxTailSegments = Math.min(4, parts.length - 1);

  for (let tailSegments = maxTailSegments; tailSegments >= 2; tailSegments -= 1) {
    const tail = parts.slice(-tailSegments).join(separator);
    const candidate = `${prefix}.../${tail}`;
    if (candidate.length <= maxLength || tailSegments === 2) {
      return candidate;
    }
  }

  return path;
}

function copyPath(path: string) {
  navigator.clipboard.writeText(path).catch(() => {});
}

export function createAppManagerColumns(
  t: TFunction,
  onLaunch: (app: AppInfo) => void,
  onReveal: (app: AppInfo) => void,
): ColumnDef<AppInfo>[] {
  return [
    {
      id: "name",
      header: t("appManager.column.name"),
      accessorFn: (app) => app.name,
      enableSorting: true,
      meta: {
        width: "34%",
        minWidth: "200px",
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
          </div>
          <StickyTableText className="text-xs text-muted-foreground">
            {row.original.bundleId !== "unknown" ? row.original.bundleId : "—"}
          </StickyTableText>
        </div>
      ),
      sortingFn: (left, right) =>
        compareAppIdentity(left.original, right.original),
    },
    {
      id: "version",
      header: t("appManager.column.version"),
      accessorKey: "version",
      enableSorting: true,
      meta: {
        width: "100px",
      },
      cell: ({ row }) => (
        <span className="text-sm">{row.original.version}</span>
      ),
    },
    {
      id: "path",
      header: t("appManager.column.path"),
      accessorKey: "installPath",
      enableSorting: true,
      meta: {
        width: "26%",
        minWidth: "180px",
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
      id: "source",
      header: t("appManager.column.source"),
      accessorKey: "source",
      enableSorting: true,
      meta: {
        width: "90px",
      },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.source}
        </Badge>
      ),
    },
    {
      id: "lastModified",
      header: t("appManager.column.lastModified"),
      accessorKey: "lastModified",
      enableSorting: true,
      sortDescFirst: true,
      meta: {
        width: "140px",
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
        width: "120px",
        align: "center",
      },
      cell: ({ row }) => {
        const app = row.original;
        return (
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!app.allowedActions.launch}
              title={t("appManager.actionLaunch")}
              onClick={() => onLaunch(app)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onLaunch(app);
                }
              }}
            >
              <Play size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!app.allowedActions.reveal}
              title={t("appManager.actionReveal")}
              onClick={() => onReveal(app)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onReveal(app);
                }
              }}
            >
              <Folder size={15} />
            </Button>
          </div>
        );
      },
    },
  ];
}
