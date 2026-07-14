/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { CheckCircle2, RefreshCw, Search, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DetailPanel } from "@/components/layout/DetailPanel"
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout"
import { ScrollableArea } from "@/components/common/ScrollableArea"
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

/**
 * 软件更新部分来源不可用时，用「必须手动关闭」的通知提示，避免占据列表高度。
 * 模块级守卫防止切进/切出页面时重复弹窗；警告清除后守卫复位，再次出现会重新提示。
 */
const UPDATE_PARTIAL_WARNING_TOAST_ID = "app-manager-update-partial-warning"
let warnedForCurrentUpdateWarning = false

interface SoftwareUpdateViewProps {
  apps: AppInfo[]
  updates: UpdateInfo[]
  searchQuery: string
  loading: boolean
  scanned: boolean
  error: string
  warning: string
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
  apps,
  updates,
  searchQuery,
  loading,
  scanned,
  error,
  warning,
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
  onChangeSourceFilter,
  onRowClick,
  onCloseDetail,
  onRowAction,
  onGroupAction,
  onOpenExternal,
}: SoftwareUpdateViewProps) {
  const { t } = useTranslation()
  const normalizedSearch = searchQuery.trim().toLowerCase()

  useEffect(() => {
    if (warning) {
      if (!warnedForCurrentUpdateWarning) {
        warnedForCurrentUpdateWarning = true
        toast.warning(warning, {
          id: UPDATE_PARTIAL_WARNING_TOAST_ID,
          duration: Infinity,
          closeButton: true,
        })
      }
    } else {
      warnedForCurrentUpdateWarning = false
      toast.dismiss(UPDATE_PARTIAL_WARNING_TOAST_ID)
    }
  }, [warning])

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
    if (error) {
      return (
        <div className="flex max-w-sm flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={onRecheck}>
            <RefreshCw size={14} />
            {t("appManager.softwareUpdate.recheck")}
          </Button>
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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <UpdaterActionBar
        searchQuery={searchQuery}
        loading={loading}
        totalCount={searchedUpdates.length}
        visibleSources={visibleSources}
        sourceFilter={sourceFilter}
        onSearchQueryChange={onSearchQueryChange}
        onRecheck={onRecheck}
        onChangeSourceFilter={onChangeSourceFilter}
      />

      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 truncate" title={error}>
              {error}
            </span>
            {onClearError ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={onClearError}>
                    <X size={13} />
                  </Button>
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
            {hasGroups ? (
              <ScrollableArea
                className="min-h-0 flex-1 flex-col gap-3 pr-1 pb-3"
                wrapperClassName="flex min-h-0 flex-1"
              >
                <div className="flex min-h-full flex-col gap-3">
                  {orderedGroups.map(({ source, items }) => (
                    <UpdateGroupSection
                      key={source}
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
                  ))}
                </div>
              </ScrollableArea>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {loading ? (
                  <div
                    className="bg-card flex min-h-0 flex-1 flex-col gap-3 rounded-lg border p-4"
                    aria-busy="true"
                  >
                    <div className="bg-muted h-1 w-full animate-pulse rounded-full" />
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className="flex h-14 items-center gap-3 border-b">
                        <div className="bg-muted size-9 animate-pulse rounded-md" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
                          <div className="bg-muted h-2.5 w-1/2 animate-pulse rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-card flex min-h-0 flex-1 items-center justify-center rounded-lg border p-6">
                    {renderEmpty()}
                  </div>
                )}
              </div>
            )}
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
