import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import i18n from "@/i18n/config";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import FilterBar, { type FilterGroup } from "@/components/features/FilterBar";
import {
  StickyDataTable,
  type StickyDataTableColumn,
  type StickyDataTableSortState,
} from "@/components/ui/StickyDataTable";
import { StickyTableText } from "@/components/ui/StickyTable";

export interface EnvTool {
  name: string;
  version: string;
  path: string;
  size_bytes: number;
  size_display: string;
  install_time: string;
  available: boolean;
  category: string;
  source: string;
  kind: string;
  status: string;
  detector: string;
  all_paths: string[];
  issue: string;
}

type EnvFilterKey = "category" | "source" | "kind" | "status";
type EnvTableColumnId =
  | "name"
  | "version"
  | "path"
  | "size"
  | "installTime"
  | "status";

interface EnvFilterRow {
  id: string;
  model: string;
  category: string;
  source: string;
  kind: string;
  status: string;
}

const ENV_FILTER_GROUPS: FilterGroup<EnvFilterRow>[] = [
  {
    key: "category",
    label: "envDetector.filterGroups.category",
    format: (value) => formatEnvFilterValue("category", String(value)),
  },
  {
    key: "source",
    label: "envDetector.filterGroups.source",
    format: (value) => formatEnvFilterValue("source", String(value)),
  },
  {
    key: "kind",
    label: "envDetector.filterGroups.kind",
    format: (value) => formatEnvFilterValue("kind", String(value)),
  },
  {
    key: "status",
    label: "envDetector.filterGroups.status",
    format: (value) => formatEnvFilterValue("status", String(value)),
  },
];

/** 检测是否在 Tauri 运行时环境 */
function isTauriEnv(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

function EnvDetector({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<EnvTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sorting, setSorting] = useState<StickyDataTableSortState<EnvTableColumnId>>({
    columnId: "name",
    direction: "asc",
  });
  const [scanned, setScanned] = useState(false);
  const [showAllCommands, setShowAllCommands] = useState(false);
  const unlistenersRef = useRef<UnlistenFn[]>([]);
  const scanningRef = useRef(false);
  const triggeredRef = useRef(false);

  const cleanupListeners = useCallback(() => {
    for (const unlisten of unlistenersRef.current) {
      unlisten();
    }
    unlistenersRef.current = [];
  }, []);

  const loadTools = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;

    setLoading(true);
    setScanning(true);
    setError("");
    setTools([]);

    cleanupListeners();

    try {
      if (!isTauriEnv()) {
        setScanned(true);
        return;
      }

      const unlisten1 = await listen<EnvTool>("env-tool-found", (event) => {
        setTools((prev) => [...prev, event.payload]);
      });
      const unlisten2 = await listen<{ unavailable: EnvTool[] }>("env-scan-done", (event) => {
        setTools((prev) => [...prev, ...event.payload.unavailable]);
        setScanning(false);
        scanningRef.current = false;
        setScanned(true);
        cleanupListeners();
      });

      unlistenersRef.current = [unlisten1, unlisten2];

      await invoke("detect_env_tools");
      setScanned(true);
    } catch (e) {
      console.warn("[EnvDetector] Failed to detect tools:", e);
      setTools([]);
      setError(t("envDetector.loadFailed"));
      setScanned(true);
      cleanupListeners();
    } finally {
      setLoading(false);
      setScanning(false);
      scanningRef.current = false;
    }
  }, [cleanupListeners, t]);

  useEffect(() => {
    if (active && isTauriEnv() && !scanned && !triggeredRef.current) {
      triggeredRef.current = true;
      loadTools();
    }
    return () => {
      cleanupListeners();
    };
  }, [active, loadTools, scanned, cleanupListeners]);

  const statusCounts = {
    total: tools.length,
    available: tools.filter((t) => t.available).length,
    unavailable: tools.filter((t) => !t.available).length,
  };

  const filterRows = useMemo<EnvFilterRow[]>(
    () =>
      tools.map((tool) => ({
        id: tool.name,
        model: tool.name,
        category: tool.category,
        source: tool.source,
        kind: tool.kind,
        status: tool.status,
      })),
    [tools]
  );

  const matchingTools = useMemo(
    () =>
      tools.filter((tool) => {
        const matchesSearch =
          !searchQuery ||
          tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.detector.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesFilters = Object.entries(filters).every(
          ([key, value]) => !value || String(tool[key as EnvFilterKey]) === value
        );

        return matchesSearch && matchesFilters;
      }),
    [filters, searchQuery, tools]
  );
  const missingTools = matchingTools.filter((tool) => !tool.available);
  const displayedTools = matchingTools.filter((tool) => {
    if (!tool.available) return false;
    return showAllCommands || isDeveloperSignal(tool);
  });

  const hasActiveResultFilter =
    searchQuery.trim().length > 0 || Object.keys(filters).length > 0;

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      const filterKey = key as EnvFilterKey;
      if (next[filterKey] === value) {
        delete next[filterKey];
      } else {
        next[filterKey] = value;
      }
      return next;
    });
  };

  const clearFilters = () => setFilters({});

  const tableColumns = useMemo<StickyDataTableColumn<EnvTool, EnvTableColumnId>[]>(() => [
    {
      id: "name",
      header: t("envDetector.toolName"),
      sticky: true,
      minWidth: "160px",
      sortable: true,
      renderCell: (tool) => tool.name,
      compareFn: (left, right) => left.name.localeCompare(right.name),
    },
    {
      id: "version",
      header: t("envDetector.version"),
      minWidth: "140px",
      cellClassName: "text-muted-foreground",
      renderCell: (tool) => (
        <StickyTableText title={tool.version || t("envDetector.notFound")}>
          {tool.available ? tool.version || "—" : t("envDetector.notFound")}
        </StickyTableText>
      ),
    },
    {
      id: "path",
      header: t("envDetector.path"),
      minWidth: "280px",
      cellClassName: "font-mono text-xs text-muted-foreground",
      renderCell: (tool) =>
        tool.available ? (
          <span title={tool.all_paths.join("\n") || tool.path}>
            <StickyTableText title={tool.path}>{tool.path}</StickyTableText>
            {tool.all_paths.length > 1 && (
              <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                {t("envDetector.pathCount", { count: tool.all_paths.length })}
              </Badge>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "size",
      header: t("envDetector.size"),
      width: "120px",
      align: "right",
      sortable: true,
      sortDescFirst: true,
      renderCell: (tool) => (
        <span className="tabular-nums text-muted-foreground">
          {tool.available ? tool.size_display : "—"}
        </span>
      ),
      compareFn: (left, right) =>
        left.size_bytes - right.size_bytes || left.name.localeCompare(right.name),
    },
    {
      id: "installTime",
      header: t("envDetector.installTime"),
      width: "170px",
      align: "right",
      sortable: true,
      sortDescFirst: true,
      renderCell: (tool) => (
        <span className="text-muted-foreground">
          {tool.available ? tool.install_time : "—"}
        </span>
      ),
      compareFn: (left, right) =>
        left.install_time.localeCompare(right.install_time) ||
        left.name.localeCompare(right.name),
    },
    {
      id: "status",
      header: t("envDetector.status"),
      width: "112px",
      align: "center",
      cellClassName: "text-center",
      renderCell: (tool) => <EnvStatusBadge tool={tool} />,
    },
  ], [t]);

  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>{t("envDetector.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 flex flex-col">
          {error && (
            <Alert variant="destructive" className="mb-4 shrink-0">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isTauriEnv() && !loading && tools.length === 0 && (
            <Alert className="mb-4 shrink-0 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800">
              <AlertDescription className="text-indigo-700 dark:text-indigo-300">
                {t("envDetector.browserInfo")}
              </AlertDescription>
            </Alert>
          )}

          {/* Search & Filter Bar - always visible */}
          <div className="mb-3 shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative flex-1 min-w-[200px]">
                <Input
                  placeholder={t("envDetector.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-3"
                  disabled={loading}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllCommands((prev) => !prev)}
                disabled={loading}
              >
                {showAllCommands
                  ? t("envDetector.hideAllCommands")
                  : t("envDetector.showAllCommands")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadTools}
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <span className="mr-1.5 size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t("envDetector.scanning")}
                  </>
                ) : (
                  t("envDetector.refresh")
                )}
              </Button>
            </div>
            <div className="mb-2">
              <FilterBar
                filterGroups={ENV_FILTER_GROUPS}
                data={filterRows}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={clearFilters}
                resultCount={displayedTools.length + missingTools.length}
                filterTitleKey="envDetector.filters"
                clearFiltersKey="envDetector.clearFilters"
                filteredCountKey="envDetector.filteredCount"
                autoExpandHintKey="envDetector.autoExpandHint"
                pinnedHintKey="envDetector.pinnedHint"
              />
            </div>
            <div className="flex items-center justify-end">
              {scanning && (
                <span className="mr-2 size-2 animate-pulse rounded-full bg-primary" />
              )}
              <p className="text-sm text-muted-foreground">
                {t(
                  hasActiveResultFilter
                    ? "envDetector.filteredSummary"
                    : "envDetector.summary",
                  {
                    available: statusCounts.available,
                    total: statusCounts.total,
                    visible: displayedTools.length + missingTools.length,
                  }
                )}
              </p>
            </div>
          </div>

          {/* Table Area */}
          <div className="flex-1 min-h-0">
            {loading && tools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground rounded-lg border">
                <div className="size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
                <p>{t("envDetector.scanning")}</p>
              </div>
            ) : tools.length > 0 ? (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="flex items-center justify-between shrink-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("envDetector.detectedTools", { count: displayedTools.length })}
                  </p>
                  {missingTools.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("envDetector.missingTools", { count: missingTools.length })}
                    </p>
                  )}
                </div>
              <StickyDataTable
                data={displayedTools}
                columns={tableColumns}
                getRowId={(tool) => `${tool.name}:${tool.path || tool.detector}:${tool.status}`}
                sorting={{
                  state: sorting,
                  onChange: setSorting,
                }}
                containerClassName="h-full min-h-0 rounded-lg border"
              />
                {missingTools.length > 0 && (
                  <div className="shrink-0 rounded-lg border bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t("envDetector.missingTools", { count: missingTools.length })}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {missingTools.map((tool) => (
                        <Badge key={`missing-${tool.name}`} variant="secondary">
                          {tool.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground rounded-lg border">
                <p>{scanned ? t("envDetector.empty") : t("envDetector.startHint")}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatEnvFilterValue(
  key: EnvFilterKey,
  value: string
): string {
  return i18n.t(`envDetector.filterValues.${key}.${value}`);
}

function isDeveloperSignal(tool: EnvTool): boolean {
  return (
    tool.detector !== "path-scan" ||
    tool.category !== "other" ||
    tool.status === "multipleVersions" ||
    tool.status === "versionUnknown"
  );
}

function EnvStatusBadge({ tool }: { tool: EnvTool }) {
  const { t } = useTranslation();

  if (!tool.available) {
    return (
      <Badge variant="secondary" className="bg-muted/50 text-muted-foreground">
        {t("envDetector.filterValues.status.missing")}
      </Badge>
    );
  }

  if (tool.status === "multipleVersions") {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
        {t("envDetector.filterValues.status.multipleVersions")}
      </Badge>
    );
  }

  if (tool.status === "versionUnknown") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("envDetector.filterValues.status.versionUnknown")}
      </Badge>
    );
  }

  return (
    <Badge
      variant="default"
      className="bg-green-600/20 text-green-700 dark:bg-green-500/15 dark:text-green-400"
    >
      {t("envDetector.filterValues.status.ok")}
    </Badge>
  );
}

export default EnvDetector;
