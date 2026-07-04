/**
 * Table View / 表格视图: define table presentation; 只定义表格展示.
 */
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { StickyTableText } from "@/components/ui/StickyTable"
import type { EnvTool } from "@/lib/tauri/types"

export type EnvTableColumnId = "name" | "version" | "path" | "size" | "installTime" | "status"

export function createEnvDetectorColumns(t: TFunction): ColumnDef<EnvTool>[] {
  return [
    {
      id: "name",
      header: t("envDetector.toolName"),
      accessorKey: "name",
      enableSorting: true,
      meta: {
        sticky: true,
        width: "20%",
      },
      cell: ({ row }) => <StickyTableText>{row.original.name}</StickyTableText>,
      sortingFn: (left, right) => left.original.name.localeCompare(right.original.name),
    },
    {
      id: "version",
      header: t("envDetector.version"),
      accessorKey: "version",
      meta: {
        width: "14%",
        cellClassName: "text-muted-foreground",
      },
      cell: ({ row }) => (
        <StickyTableText title={row.original.version || t("envDetector.notFound")}>
          {row.original.available ? row.original.version || "—" : t("envDetector.notFound")}
        </StickyTableText>
      ),
    },
    {
      id: "path",
      header: t("envDetector.path"),
      accessorKey: "path",
      meta: {
        cellClassName: "font-mono text-xs text-muted-foreground",
      },
      cell: ({ row }) =>
        row.original.available ? (
          <>
            <StickyTableText title={row.original.path}>{row.original.path}</StickyTableText>
            {row.original.all_paths.length > 1 && (
              <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                {t("envDetector.pathCount", { count: row.original.all_paths.length })}
              </Badge>
            )}
          </>
        ) : (
          "—"
        ),
    },
    {
      id: "size",
      header: t("envDetector.size"),
      accessorKey: "size_bytes",
      enableSorting: true,
      sortDescFirst: true,
      meta: {
        width: "11%",
        align: "right",
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">
          {row.original.available ? row.original.size_display : "—"}
        </span>
      ),
      sortingFn: (left, right) =>
        left.original.size_bytes - right.original.size_bytes ||
        left.original.name.localeCompare(right.original.name),
    },
    {
      id: "installTime",
      header: t("envDetector.installTime"),
      accessorKey: "install_time",
      enableSorting: true,
      sortDescFirst: true,
      meta: {
        width: "16%",
        align: "right",
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.available ? row.original.install_time : "—"}
        </span>
      ),
      sortingFn: (left, right) =>
        left.original.install_time.localeCompare(right.original.install_time) ||
        left.original.name.localeCompare(right.original.name),
    },
    {
      id: "status",
      header: t("envDetector.status"),
      accessorKey: "status",
      meta: {
        width: "11%",
        align: "center",
        cellClassName: "text-center",
      },
      cell: ({ row }) => <EnvStatusBadge tool={row.original} />,
    },
  ]
}

export function EnvStatusBadge({ tool }: { tool: EnvTool }) {
  const { t } = useTranslation()

  if (!tool.available) {
    return (
      <Badge variant="secondary" className="bg-muted/50 text-muted-foreground">
        {t("envDetector.filterValues.status.missing")}
      </Badge>
    )
  }

  if (tool.status === "multipleVersions") {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
        {t("envDetector.filterValues.status.multipleVersions")}
      </Badge>
    )
  }

  if (tool.status === "versionUnknown") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("envDetector.filterValues.status.versionUnknown")}
      </Badge>
    )
  }

  return (
    <Badge
      variant="default"
      className="bg-green-600/20 text-green-700 dark:bg-green-500/15 dark:text-green-400"
    >
      {t("envDetector.filterValues.status.ok")}
    </Badge>
  )
}
