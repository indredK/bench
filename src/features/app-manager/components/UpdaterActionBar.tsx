/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ToolbarButton } from "@/components/ui/toolbar-button"
import { AppManagerToolbar } from "@/features/app-manager/components/AppManagerToolbar"
import type { UpdateSource } from "@/lib/tauri/types/app-manager"
import {
  UPDATE_SOURCE_ORDER,
  getUpdateSourceIcon,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info"

interface UpdaterActionBarProps {
  searchQuery: string
  loading: boolean
  totalCount: number
  visibleSources: UpdateSource[]
  sourceFilter: UpdateSource | "all"
  onSearchQueryChange: (query: string) => void
  onRecheck: () => void
  onChangeSourceFilter: (filter: UpdateSource | "all") => void
}

export function UpdaterActionBar({
  searchQuery,
  loading,
  totalCount,
  visibleSources,
  sourceFilter,
  onSearchQueryChange,
  onRecheck,
  onChangeSourceFilter,
}: UpdaterActionBarProps) {
  const { t } = useTranslation()
  const showAllChip = totalCount > 0

  return (
    <AppManagerToolbar
      searchQuery={searchQuery}
      searchPlaceholder={t("appManager.softwareUpdate.searchPlaceholder")}
      onSearchQueryChange={onSearchQueryChange}
      searchDisabled={loading}
      rightContent={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {showAllChip ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground mr-1 text-xs">
                {t("appManager.softwareUpdate.filterBySource")}:
              </span>
              <Badge
                variant={sourceFilter === "all" ? "default" : "secondary"}
                className="cursor-pointer select-none"
                onClick={() => onChangeSourceFilter("all")}
              >
                {t("appManager.filterAll")} ({totalCount})
              </Badge>
              {UPDATE_SOURCE_ORDER.filter((src) => visibleSources.includes(src)).map((src) => (
                <Badge
                  key={src}
                  variant={sourceFilter === src ? "default" : "secondary"}
                  className="cursor-pointer select-none"
                  onClick={() => onChangeSourceFilter(src)}
                >
                  <span className="mr-1">{getUpdateSourceIcon(src)}</span>
                  {getUpdateSourceLabel(t, src)}
                </Badge>
              ))}
            </div>
          ) : null}
          <ToolbarButton
            icon={<RefreshCw size={15} className={loading ? "animate-spin" : ""} />}
            tooltip={
              loading
                ? t("appManager.softwareUpdate.checking")
                : t("appManager.softwareUpdate.recheck")
            }
            onClick={onRecheck}
            disabled={loading}
          />
        </div>
      }
    />
  )
}
