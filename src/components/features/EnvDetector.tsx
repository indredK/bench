import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SortingState } from "@tanstack/react-table";
import { isTauri } from "@tauri-apps/api/core";
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
import { DataTable } from "@/components/ui/DataTable";
import { createEnvDetectorColumns } from "@/features/env-detector/columns";
import { detectEnvTools } from "@/lib/tauri/commands";
import type { EnvTool } from "@/lib/tauri/types";

type EnvFilterKey = "category" | "source" | "kind" | "status";

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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
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

      await detectEnvTools();
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

  const tableColumns = useMemo(() => createEnvDetectorColumns(t), [t]);

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
              <DataTable
                data={displayedTools}
                columns={tableColumns}
                getRowId={(tool) => `${tool.name}:${tool.path || tool.detector}:${tool.status}`}
                sorting={{
                  sorting,
                  onSortingChange: setSorting,
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

export default EnvDetector;
