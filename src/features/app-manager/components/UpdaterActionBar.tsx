/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { ArrowUpCircle, CheckSquare, RefreshCw, Square, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import type { UpdateSource } from "@/lib/tauri/types/app-manager";
import {
  UPDATE_SOURCE_ORDER,
  getUpdateSourceIcon,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info";

interface UpdaterActionBarProps {
  t: TFunction;
  loading: boolean;
  totalCount: number;
  visibleCount: number;
  selectedCount: number;
  visibleSources: UpdateSource[];
  sourceFilter: UpdateSource | "all";
  onRecheck: () => void;
  onUpdateAllVisible: () => void;
  onToggleSelectAllVisible: () => void;
  onChangeSourceFilter: (filter: UpdateSource | "all") => void;
  onClearSelection: () => void;
}

export function UpdaterActionBar({
  t,
  loading,
  totalCount,
  visibleCount,
  selectedCount,
  visibleSources,
  sourceFilter,
  onRecheck,
  onUpdateAllVisible,
  onToggleSelectAllVisible,
  onChangeSourceFilter,
  onClearSelection,
}: UpdaterActionBarProps) {
  const allSelected = selectedCount > 0 && selectedCount >= visibleCount;
  const showAllChip = totalCount > 0;

  return (
    <Card className="shrink-0">
      <CardContent className="flex flex-wrap items-center gap-1.5 py-2.5">
        <Button
          variant={visibleCount > 0 ? "default" : "ghost"}
          size="sm"
          disabled={loading || visibleCount === 0}
          onClick={onUpdateAllVisible}
          className="gap-1.5"
        >
          <ArrowUpCircle size={14} />
          {visibleCount > 0
            ? t("appManager.softwareUpdate.updateAllCount", { count: visibleCount })
            : t("appManager.softwareUpdate.updateAll")}
        </Button>

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

        <div className="flex-1" />

        {showAllChip && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">
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
        )}
      </CardContent>
    </Card>
  );
}
