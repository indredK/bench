/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useMemo } from "react"
import type { TFunction } from "i18next"
import { CheckCircle2, RefreshCw, Search, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DetailPanel } from "@/components/layout/DetailPanel"
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AppInfo, UpdateInfo, UpdateSource } from "@/lib/tauri/types/app-manager"
import type { AppOperationState } from "@/features/app-manager/model/operations"
import { UpdaterActionBar } from "@/features/app-manager/components/UpdaterActionBar"
import { UpdateGroupSection } from "@/features/app-manager/components/UpdateGroupSection"
import { UpdateDetail } from "@/features/app-manager/components/UpdateDetail"
import {
  UPDATE_SOURCE_ORDER,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info"

interface SoftwareUpdateViewProps {
  t: TFunction
  apps: AppInfo[]
  updates: UpdateInfo[]
  searchQuery: string
  loading: boolean
  scanned: boolean
  error: string
  onClearError?: () => void
  lastUpdateCheck: number
  selectedIds: Set<string>
  selectedUpdate: UpdateInfo | null
  sourceFilter: UpdateSource | "all"
  expandedGroups: Record<UpdateSource, boolean>
  updateOperations: Record<string, AppOperationState>
  onSearchQueryChange: (query: string) => void
  onRecheck: () => void
  onToggleGroup: (source: UpdateSource) => void
  onToggleSelect: (appId: string) => void
  onClearSelection: () => void
  onChangeSourceFilter: (filter: UpdateSource | "all") => void
  onRowClick: (update: UpdateInfo) => void
  onCloseDetail: () => void
  onRowAction: (update: UpdateInfo) => void
  onGroupAction: (source: UpdateSource, updates: UpdateInfo[]) => void
  onOpenExternal: (url: string) => void
}

function groupBySource(updates: UpdateInfo[]): Map<UpdateSource, UpdateInfo[]> {
  const map = new Map<UpdateSource, UpdateInfo[]>()
  for (const update of updates) {
    const list = map.get(update.source) ?? []
    list.push(update)
    map.set(update.source, list)
  }
  return map
}

export function SoftwareUpdateView({
  t,
  apps,
  updates,
  searchQuery,
  loading,
  scanned,
  error,
  onClearError,
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
  onClearSelection,
  onChangeSourceFilter,
  onRowClick,
  onCloseDetail,
  onRowAction,
  onGroupAction,
  onOpenExternal,
}: SoftwareUpdateViewProps) {
  const normalizedSearch = searchQuery.trim().toLowerCase()

  const appLookup = useMemo(() => {
    const map = new Map<string, AppInfo>()
    for (const app of apps) {
      map.set(app.appId, app)
    }
    return map
  }, [apps])

  const searchedUpdates = useMemo(() => {
    if (!normalizedSearch) return updates
    return updates.filter((update) => {
      const sourceLabel = getUpdateSourceLabel(t, update.source).toLowerCase()
      return [
        update.appName,
        update.appId,
        update.currentVersion,
        update.latestVersion,
        sourceLabel,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    })
  }, [normalizedSearch, t, updates])

  const visibleUpdates = useMemo(() => {
    if (sourceFilter === "all") return searchedUpdates
    return searchedUpdates.filter((u) => u.source === sourceFilter)
  }, [searchedUpdates, sourceFilter])

  const visibleSources = useMemo(() => {
    const set = new Set<UpdateSource>()
    for (const u of searchedUpdates) set.add(u.source)
    return Array.from(set)
  }, [searchedUpdates])

  const grouped = useMemo(() => groupBySource(visibleUpdates), [visibleUpdates])

  const orderedGroups = useMemo(
    () =>
      UPDATE_SOURCE_ORDER.filter((src) => grouped.has(src)).map((src) => ({
        source: src,
        items: grouped.get(src) ?? [],
      })),
    [grouped],
  )
  const hasGroups = orderedGroups.length > 0

  const renderEmpty = () => {
    if (loading) {
      return (
        <div className="flex max-w-sm flex-col items-center justify-center gap-3 text-center">
          <RefreshCw size={32} className="animate-spin opacity-40" />
          <p className="text-muted-foreground text-sm">{t("appManager.softwareUpdate.checking")}</p>
        </div>
      )
    }
    if (!scanned) {
      return (
        <div className="flex max-w-sm flex-col items-center justify-center gap-3 text-center">
          <RefreshCw size={32} className="opacity-30" />
          <p className="text-muted-foreground text-sm">
            {t("appManager.softwareUpdate.empty.neverChecked")}
          </p>
          <Button variant="default" size="sm" onClick={onRecheck}>
            <RefreshCw size={14} />
            {t("appManager.softwareUpdate.recheck")}
          </Button>
        </div>
      )
    }
    if (normalizedSearch) {
      return (
        <div className="flex max-w-sm flex-col items-center justify-center gap-2 text-center">
          <Search size={32} className="opacity-30" />
          <p className="text-sm font-medium">{t("appManager.noResults")}</p>
        </div>
      )
    }
    return (
      <div className="flex max-w-sm flex-col items-center justify-center gap-2 text-center">
        <CheckCircle2 size={36} className="text-green-500 opacity-80" />
        <p className="text-sm font-medium">{t("appManager.softwareUpdate.empty.allUpToDate")}</p>
        {lastUpdateCheck > 0 && (
          <p className="text-muted-foreground text-xs">
            {t("appManager.softwareUpdate.empty.lastChecked", {
              time: new Date(lastUpdateCheck).toLocaleString(),
            })}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <UpdaterActionBar
        t={t}
        searchQuery={searchQuery}
        loading={loading}
        totalCount={searchedUpdates.length}
        selectedCount={selectedIds.size}
        visibleSources={visibleSources}
        sourceFilter={sourceFilter}
        onSearchQueryChange={onSearchQueryChange}
        onRecheck={onRecheck}
        onChangeSourceFilter={onChangeSourceFilter}
        onClearSelection={onClearSelection}
      />

      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            {onClearError ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="hover:bg-destructive/30 focus-visible:ring-ring flex size-5 shrink-0 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none"
                    onClick={onClearError}
                  >
                    <X size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("common.actions.close")}</TooltipContent>
              </Tooltip>
            ) : null}
          </AlertDescription>
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
            <div
              className={
                hasGroups
                  ? "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-3"
                  : "min-h-0 flex-1 overflow-hidden"
              }
            >
              <div
                className={
                  hasGroups ? "flex min-h-full flex-col gap-3" : "flex h-full min-h-0 flex-col"
                }
              >
                {!hasGroups ? (
                  <div className="bg-card flex min-h-0 flex-1 items-center justify-center rounded-lg border p-6">
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
                      onSourceAction={onGroupAction}
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
  )
}
