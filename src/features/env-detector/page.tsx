/**
 * Page View / 页面视图: compose screen only; 只组合页面.
 */
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
import FilterBar from "@/shared/compare/FilterBar";
import { ContentView } from "@/components/content/ContentView";
import { EnvStatusBadge } from "@/features/env-detector/columns";
import { useEnvDetectorController } from "@/features/env-detector/hooks/useEnvDetectorController";
import type { EnvTool } from "@/lib/tauri/types";
import { Box } from "lucide-react";
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate";

function EnvDetector({ active, feature }: { active: boolean; feature?: { desktopOnly?: boolean } }) {
  const controller = useEnvDetectorController(active);
  const {
    t,
    loading,
    scanning,
    error,
    searchQuery,
    filters,
    sorting,
    scanned,
    showAllCommands,
    viewMode,
    filterGroups,
    statusCounts,
    filterRows,
    missingTools,
    displayedTools,
    hasActiveResultFilter,
    tableColumns,
    setSearchQuery,
    setSorting,
    setShowAllCommands,
    setViewMode,
    handleFilterChange,
    clearFilters,
    loadTools,
    getRowAttributes,
  } = controller;

  return (
    <RuntimeFeatureGate
      feature={feature}
      title={t("envDetector.title")}
      icon={<Box size={32} className="opacity-40" />}
    >
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
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-3"
                    disabled={loading}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllCommands(!showAllCommands)}
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
                  filterGroups={filterGroups}
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
                renderGridCard={(tool) => (
                  <EnvToolGridCard
                    tool={tool}
                    notFoundLabel={t("envDetector.notFound")}
                    getRowAttributes={getRowAttributes}
                  />
                )}
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
    </RuntimeFeatureGate>
  );
}

function EnvToolGridCard({
  tool,
  notFoundLabel,
  getRowAttributes,
}: {
  tool: EnvTool;
  notFoundLabel: string;
  getRowAttributes: (tool: EnvTool) => Record<string, string>;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-3 hover:ring-2 hover:ring-primary/30 transition-all h-full flex flex-col gap-1.5"
      {...getRowAttributes(tool)}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm truncate">{tool.name}</span>
        <EnvStatusBadge tool={tool} />
      </div>
      <p className="text-xs text-muted-foreground truncate">
        {tool.available ? tool.version || "-" : notFoundLabel}
      </p>
      <p className="text-[11px] text-muted-foreground truncate font-mono">
        {tool.available ? tool.path : "-"}
      </p>
      {tool.available && tool.size_display && (
        <p className="text-[11px] text-muted-foreground">{tool.size_display}</p>
      )}
    </div>
  );
}

export default EnvDetector;
