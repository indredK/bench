import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { StickyTableText } from "@/components/ui/StickyTable";
import type { ProjectInfo } from "@/lib/tauri/types";
import { formatDate, formatSize } from "@/lib/utils";

export type DevCleanerSortBy = "name" | "totalSize" | "cleanupSize" | "modified";

const projectTypeMap: Partial<Record<ProjectInfo["project_type"], "nodejs" | "python" | "rust" | "go">> = {
  NodeJs: "nodejs",
  Python: "python",
  Rust: "rust",
  Go: "go",
};

const naturalTextComparator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const MAX_VISIBLE_PATH_LENGTH = 56;

function compareProjectIdentity(left: ProjectInfo, right: ProjectInfo) {
  return (
    naturalTextComparator.compare(left.name, right.name) ||
    naturalTextComparator.compare(left.path, right.path)
  );
}

function compactPath(path: string, maxLength = MAX_VISIBLE_PATH_LENGTH) {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[/\\]+/).filter(Boolean);
  const hasDrivePrefix = /^[A-Za-z]:/.test(path);
  const hasRootPrefix = separator === "/" && path.startsWith("/");

  if (path.length <= maxLength || parts.length <= 4) {
    return path;
  }

  const prefix = hasDrivePrefix
    ? `${parts[0]}${separator}`
    : hasRootPrefix
      ? separator
      : `${parts[0]}${separator}`;
  const maxTailSegments = Math.min(4, parts.length - 1);

  for (let tailSegments = maxTailSegments; tailSegments >= 2; tailSegments -= 1) {
    const tail = parts.slice(-tailSegments).join(separator);
    const candidate = `${prefix}...${separator}${tail}`;

    if (candidate.length <= maxLength || tailSegments === 2) {
      return candidate;
    }
  }

  return path;
}

export function createDevCleanerColumns(
  t: TFunction
): ColumnDef<ProjectInfo>[] {
  return [
    {
      id: "name",
      header: t("devCleaner.column.project"),
      accessorFn: (project) => project.name,
      enableSorting: true,
      meta: {
        width: "44%",
        minWidth: "280px",
      },
      cell: ({ row }) => (
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <StickyTableText className="font-medium">
              {row.original.name}
            </StickyTableText>
            <Badge variant="outline" className="shrink-0 text-xs">
              {projectTypeMap[row.original.project_type]
                ? t(`devCleaner.filter.${projectTypeMap[row.original.project_type]}`)
                : row.original.project_type}
            </Badge>
          </div>
          <StickyTableText
            className="text-xs text-muted-foreground"
            title={row.original.path}
          >
            {compactPath(row.original.path)}
          </StickyTableText>
          {row.original.dependencies_count > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("devCleaner.dependencies")}: {row.original.dependencies_count}
            </span>
          )}
        </div>
      ),
      sortingFn: (left, right) => compareProjectIdentity(left.original, right.original),
    },
    {
      id: "totalSize",
      header: t("devCleaner.totalSize"),
      accessorKey: "total_size",
      enableSorting: true,
      sortDescFirst: true,
      meta: {
        width: "120px",
        align: "right",
      },
      cell: ({ row }) => <span className="text-sm">{formatSize(row.original.total_size)}</span>,
      sortingFn: (left, right) =>
        left.original.total_size - right.original.total_size ||
        compareProjectIdentity(left.original, right.original),
    },
    {
      id: "cleanupSize",
      header: t("devCleaner.cleanupSize"),
      accessorKey: "cleanup_potential",
      enableSorting: true,
      sortDescFirst: true,
      meta: {
        width: "150px",
        align: "right",
      },
      cell: ({ row }) => (
        <div className="inline-block rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-1.5">
          <p className="text-[10px] text-orange-700/80">
            {t("devCleaner.cleanupSize")}
          </p>
          <p className="text-sm font-semibold text-orange-600">
            {formatSize(row.original.cleanup_potential)}
          </p>
        </div>
      ),
      sortingFn: (left, right) =>
        left.original.cleanup_potential - right.original.cleanup_potential ||
        compareProjectIdentity(left.original, right.original),
    },
    {
      id: "modified",
      header: t("devCleaner.lastModified"),
      accessorKey: "last_modified",
      enableSorting: true,
      sortDescFirst: true,
      meta: {
        width: "170px",
        align: "right",
      },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.last_modified)}
        </span>
      ),
      sortingFn: (left, right) =>
        left.original.last_modified - right.original.last_modified ||
        compareProjectIdentity(left.original, right.original),
    },
  ];
}
