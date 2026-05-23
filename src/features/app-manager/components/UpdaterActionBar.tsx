/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { CheckSquare, RefreshCw, Square, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { AppManagerToolbar } from "@/features/app-manager/components/AppManagerToolbar";
import type { UpdateSource } from "@/lib/tauri/types/app-manager";
import {
  UPDATE_SOURCE_ORDER,
  getUpdateSourceIcon,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info";

interface UpdaterActionBarProps {
  t: TFunction;
  searchQuery: string;
  loading: boolean;
  totalCount: number;
  visibleCount: number;
  selectedCount: number;
  visibleSources: UpdateSource[];
  sourceFilter: UpdateSource | "all";
  onSearchQueryChange: (query: string) => void;
  onRecheck: () => void;
  onToggleSelectAllVisible: () => void;
  onChangeSourceFilter: (filter: UpdateSource | "all") => void;
  onClearSelection: () => void;
}

export function UpdaterActionBar({
  t,
  searchQuery,
  loading,
  totalCount,
  visibleCount,
  selectedCount,
  visibleSources,
  sourceFilter,
  onSearchQueryChange,
  onRecheck,
  onToggleSelectAllVisible,
  onChangeSourceFilter,
  onClearSelection,
}: UpdaterActionBarProps) {
  const allSelected = selectedCount > 0 && selectedCount >= visibleCount;
  const showAllChip = totalCount > 0;

  return (
    <AppManagerToolbar
      t={t}
      searchQuery={searchQuery}
      searchPlaceholder={t("appManager.softwareUpdate.searchPlaceholder")}
      onSearchQueryChange={onSearchQueryChange}
      searchDisabled={loading}
      actions={
        <>
          <ToolbarButton
            icon={<RefreshCw size={15} className={loading ? "animate-spin" : ""} />}
            tooltip={loading ? t("appManager.softwareUpdate.checking") : t("appManager.softwareUpdate.recheck")}
            onClick={onRecheck}
            disabled={loading}
          />

          {visibleCount > 0 && (
            <ToolbarButton
              icon={allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              tooltip={allSelected ? t("appManager.softwareUpdate.deselectAll") : t("appManager.softwareUpdate.selectAll")}
              onClick={onToggleSelectAllVisible}
              active={allSelected}
            />
          )}

          {selectedCount > 0 && (
            <ToolbarButton
              icon={<X size={15} />}
              tooltip={t("appManager.batchClear")}
              onClick={onClearSelection}
            />
          )}
        </>
      }
      rightContent={
        showAllChip ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">
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
        ) : null
      }
    />
  );
}
