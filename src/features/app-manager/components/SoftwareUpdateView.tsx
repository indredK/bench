/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useMemo } from "react";
import type { TFunction } from "i18next";
import { CheckCircle2, RefreshCw, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DetailPanel } from "@/components/layout/DetailPanel";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import type { AppInfo, UpdateInfo, UpdateSource } from "@/lib/tauri/types/app-manager";
import type { AppOperationState } from "@/features/app-manager/model/operations";
import { UpdaterActionBar } from "@/features/app-manager/components/UpdaterActionBar";
import { UpdateGroupSection } from "@/features/app-manager/components/UpdateGroupSection";
import { UpdateDetail } from "@/features/app-manager/components/UpdateDetail";
import {
  UPDATE_SOURCE_ORDER,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info";

interface SoftwareUpdateViewProps {
  t: TFunction;
  apps: AppInfo[];
  updates: UpdateInfo[];
  searchQuery: string;
  loading: boolean;
  scanned: boolean;
  error: string;
  lastUpdateCheck: number;
  selectedIds: Set<string>;
  selectedUpdate: UpdateInfo | null;
  sourceFilter: UpdateSource | "all";
  expandedGroups: Record<UpdateSource, boolean>;
  updateOperations: Record<string, AppOperationState>;
  onSearchQueryChange: (query: string) => void;
  onRecheck: () => void;
  onToggleGroup: (source: UpdateSource) => void;
  onToggleSelect: (appId: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onChangeSourceFilter: (filter: UpdateSource | "all") => void;
  onRowClick: (update: UpdateInfo) => void;
  onCloseDetail: () => void;
  onRowAction: (update: UpdateInfo) => void;
  onUpdateAllVisible: (updates: UpdateInfo[]) => void;
  onOpenExternal: (url: string) => void;
}

function groupBySource(updates: UpdateInfo[]): Map<UpdateSource, UpdateInfo[]> {
  const map = new Map<UpdateSource, UpdateInfo[]>();
  for (const update of updates) {
    const list = map.get(update.source) ?? [];
    list.push(update);
    map.set(update.source, list);
  }
  return map;
}

export function SoftwareUpdateView({
  t,
  apps,
  updates,
  searchQuery,
  loading,
  scanned,
  error,
  lastUpdateCheck,
  selectedIds,
  selectedUpdate,
  sourceFilter,
  expandedGroups,
  updateOperations,
  onSearchQueryChange,
  onRecheck,
  onToggleGroup,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onChangeSourceFilter,
  onRowClick,
  onCloseDetail,
  onRowAction,
  onUpdateAllVisible,
  onOpenExternal,
}: SoftwareUpdateViewProps) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const appLookup = useMemo(() => {
    const map = new Map<string, AppInfo>();
    for (const app of apps) {
      map.set(app.appId, app);
    }
    return map;
  }, [apps]);

  const searchedUpdates = useMemo(() => {
    if (!normalizedSearch) return updates;
    return updates.filter((update) => {
      const sourceLabel = getUpdateSourceLabel(t, update.source).toLowerCase();
      return [
        update.appName,
        update.appId,
        update.currentVersion,
        update.latestVersion,
        sourceLabel,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [normalizedSearch, t, updates]);

  const visibleUpdates = useMemo(() => {
    if (sourceFilter === "all") return searchedUpdates;
    return searchedUpdates.filter((u) => u.source === sourceFilter);
  }, [searchedUpdates, sourceFilter]);

  const visibleSources = useMemo(() => {
    const set = new Set<UpdateSource>();
    for (const u of searchedUpdates) set.add(u.source);
    return Array.from(set);
  }, [searchedUpdates]);

  const grouped = useMemo(() => groupBySource(visibleUpdates), [visibleUpdates]);

  const orderedGroups = useMemo(
    () =>
      UPDATE_SOURCE_ORDER.filter((src) => grouped.has(src)).map((src) => ({
        source: src,
        items: grouped.get(src) ?? [],
      })),
    [grouped]
  );

  const visibleSelectableIds = useMemo(
    () => visibleUpdates.map((u) => u.appId),
    [visibleUpdates]
  );

  const visibleSelectedCount = useMemo(
    () => visibleSelectableIds.filter((id) => selectedIds.has(id)).length,
    [visibleSelectableIds, selectedIds]
  );

  const handleToggleSelectAllVisible = () => {
    if (visibleSelectedCount >= visibleUpdates.length) {
      onClearSelection();
    } else {
      onSelectAll(visibleSelectableIds);
    }
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
          <RefreshCw size={32} className="opacity-40 animate-spin" />
          <p className="text-sm text-muted-foreground">
            {t("appManager.softwareUpdate.checking")}
          </p>
        </div>
      );
    }
    if (!scanned) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
          <RefreshCw size={32} className="opacity-30" />
          <p className="text-sm text-muted-foreground">
            {t("appManager.softwareUpdate.empty.neverChecked")}
          </p>
          <Button variant="default" size="sm" onClick={onRecheck}>
            <RefreshCw size={14} />
            {t("appManager.softwareUpdate.recheck")}
          </Button>
        </div>
      );
    }
    if (normalizedSearch) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-2">
          <Search size={32} className="opacity-30" />
          <p className="text-sm font-medium">{t("appManager.noResults")}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
        <CheckCircle2 size={36} className="text-green-500 opacity-80" />
        <p className="text-sm font-medium">
          {t("appManager.softwareUpdate.empty.allUpToDate")}
        </p>
        {lastUpdateCheck > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("appManager.softwareUpdate.empty.lastChecked", {
              time: new Date(lastUpdateCheck).toLocaleString(),
            })}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <UpdaterActionBar
        t={t}
        searchQuery={searchQuery}
        loading={loading}
        totalCount={searchedUpdates.length}
        visibleCount={visibleUpdates.length}
        selectedCount={visibleSelectedCount}
        visibleSources={visibleSources}
        sourceFilter={sourceFilter}
        onSearchQueryChange={onSearchQueryChange}
        onRecheck={onRecheck}
        onUpdateAllVisible={() => onUpdateAllVisible(visibleUpdates)}
        onToggleSelectAllVisible={handleToggleSelectAllVisible}
        onChangeSourceFilter={onChangeSourceFilter}
        onClearSelection={onClearSelection}
      />

      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ThreeColumnLayout
        filterOpen={false}
        detailOpen={!!selectedUpdate}
        showDetailOverlay={false}
        onCloseDetail={onCloseDetail}
        filter={null}
        content={
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-3">
              <div className="flex min-h-full flex-col gap-3">
                {orderedGroups.length === 0 ? (
                  <div className="flex-1 min-h-0 rounded-lg border bg-card">
                    {renderEmpty()}
                  </div>
                ) : (
                  orderedGroups.map(({ source, items }) => (
                    <UpdateGroupSection
                      key={source}
                      t={t}
                      source={source}
                      updates={items}
                      expanded={expandedGroups[source] ?? true}
                      appLookup={appLookup}
                      selectedIds={selectedIds}
                      activeUpdate={selectedUpdate}
                      updateOperations={updateOperations}
                      onToggleExpanded={() => onToggleGroup(source)}
                      onToggleSelect={onToggleSelect}
                      onRowClick={onRowClick}
                      onRowAction={onRowAction}
                      onGroupAction={() => onUpdateAllVisible(items)}
                      groupActionDisabled={loading}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        }
        detail={
          <DetailPanel<UpdateInfo>
            item={selectedUpdate}
            open={!!selectedUpdate}
            onClose={onCloseDetail}
            title={t("appManager.softwareUpdate.detail.releaseNotes")}
            renderDetail={(update) => (
              <UpdateDetail
                t={t}
                update={update}
                app={appLookup.get(update.appId)}
                operationStatus={updateOperations[update.appId]?.status}
                onAction={() => onRowAction(update)}
                onOpenReleaseNotes={onOpenExternal}
              />
            )}
          />
        }
      />
    </div>
  );
}
