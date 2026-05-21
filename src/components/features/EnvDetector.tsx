import { useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
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
import { ContentView } from "@/components/content/ContentView";
import { createEnvDetectorColumns, EnvStatusBadge } from "@/features/env-detector/columns";
import { useEnvDetectorStore } from "@/stores/env-detector";
import type { EnvTool } from "@/lib/tauri/types";
import { useContextMenuRegistration } from "@/features/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/features/context-menu/types";
import { Box } from "lucide-react";
import { DesktopOnly } from "@/components/common/DesktopOnly";

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

function isTauriEnv(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

function EnvDetector({ active }: { active: boolean }) {
  const { t } = useTranslation();

  if (!isTauriEnv()) {
    return <DesktopOnly title={t("envDetector.title")} icon={<Box size={32} className="opacity-40" />} />;
  }

  const tools = useEnvDetectorStore((s) => s.tools);
  const loading = useEnvDetectorStore((s) => s.loading);
  const scanning = useEnvDetectorStore((s) => s.scanning);
  const error = useEnvDetectorStore((s) => s.error);
  const searchQuery = useEnvDetectorStore((s) => s.searchQuery);
  const filters = useEnvDetectorStore((s) => s.filters);
  const sorting = useEnvDetectorStore((s) => s.sorting);
  const scanned = useEnvDetectorStore((s) => s.scanned);
  const showAllCommands = useEnvDetectorStore((s) => s.showAllCommands);
  const viewMode = useEnvDetectorStore((s) => s.viewMode);

  const setSearchQuery = useEnvDetectorStore((s) => s.setSearchQuery);
  const setSorting = useEnvDetectorStore((s) => s.setSorting);
  const setViewMode = useEnvDetectorStore((s) => s.setViewMode);
  const handleFilterChange = useEnvDetectorStore((s) => s.handleFilterChange);
  const clearFilters = useEnvDetectorStore((s) => s.clearFilters);
  const loadTools = useEnvDetectorStore((s) => s.loadTools);

  useEffect(() => {
    if (active && isTauriEnv() && !scanned) {
      loadTools();
    }
  }, [active, loadTools, scanned]);

  const statusCounts = {
    total: tools.length,
    available: tools.filter((t) => t.available).length,
    unavailable: tools.filter((t) => !t.available).length,
  };

  const handleCopyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard write may fail in some environments
    }
  }, []);

  const getRowAttributes = useCallback((tool: EnvTool) => ({
    "data-context-type": "env-detector-row",
    "data-row-id": tool.path || tool.name,
  }), []);

  const envRegistration = useMemo(() => ({
    id: "env-detector-row",
    selector: '[data-context-type="env-detector-row"]',
    resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
    buildMenu: (ctx: unknown): ContextMenuConfig | null => {
      const key = ctx as string;
      if (!key) return null;
      const tool = tools.find((t) => (t.path || t.name) === key);
      if (!tool) return null;
      const items: ContextMenuConfig["items"] = [
        {
          id: "copy-path",
          label: t("envDetector.copyPath"),
          icon: undefined,
          onClick: () => handleCopyToClipboard(tool.path || tool.name),
        },
      ];
      if (tool.version) {
        items.push({
          id: "copy-version",
          label: t("envDetector.copyVersion"),
          icon: undefined,
          onClick: () => handleCopyToClipboard(tool.version),
        });
      }
      return { id: "env-detector-menu", items };
    },
  } satisfies ContextMenuRegistration), [tools, t, handleCopyToClipboard]);

  useContextMenuRegistration(envRegistration);

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

  const tableColumns = useMemo(() => createEnvDetectorColumns(t), [t]);

  const renderGridCard = useCallback((tool: EnvTool) => (
    <div className="rounded-xl border bg-card p-3 hover:ring-2 hover:ring-primary/30 transition-all h-full flex flex-col gap-1.5" {...getRowAttributes(tool)}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm truncate">{tool.name}</span>
        <EnvStatusBadge tool={tool} />
      </div>
      <p className="text-xs text-muted-foreground truncate">
        {tool.available ? tool.version || "—" : t("envDetector.notFound")}
      </p>
      <p className="text-[11px] text-muted-foreground truncate font-mono">
        {tool.available ? tool.path : "—"}
      </p>
      {tool.available && tool.size_display && (
        <p className="text-[11px] text-muted-foreground">{tool.size_display}</p>
      )}
    </div>
  ), [t, getRowAttributes]);

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
                onClick={() => useEnvDetectorStore.setState({ showAllCommands: !useEnvDetectorStore.getState().showAllCommands })}
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
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <ContentView
              data={displayedTools}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              columns={tableColumns}
              getRowId={(tool) => `${tool.name}:${tool.path || tool.detector}:${tool.status}`}
              renderGridCard={renderGridCard}
              onItemClick={() => {}}
              sorting={sorting}
              onSortingChange={setSorting}
              emptyIcon={<Box size={32} className="opacity-30" />}
              emptyText={scanned ? t("envDetector.empty") : t("envDetector.startHint")}
              loading={loading}
              showViewToggle
              summary={t(
                hasActiveResultFilter
                  ? "envDetector.filteredSummary"
                  : "envDetector.summary",
                {
                  available: statusCounts.available,
                  total: statusCounts.total,
                  visible: displayedTools.length + missingTools.length,
                }
              )}
              getRowAttributes={getRowAttributes}
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
        </CardContent>
      </Card>
    </div>
  );
}

function formatEnvFilterValue(key: EnvFilterKey, value: string): string {
  return i18n.t(`envDetector.filterValues.${key}.${value}`);
}

function isDeveloperSignal(tool: EnvTool): boolean {
  return !(tool.detector === "path-scan" && tool.category === "other");
}

export default EnvDetector;
