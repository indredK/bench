/**
 * Shared Compare / 共享对比: own generic compare tools; 只负责通用对比能力.
 */
import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { RotateCcw, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import FacetedFilterGroups from "@/shared/compare/FacetedFilterGroups";
import ModelPicker from "@/shared/compare/ModelPicker";
import { useCascadingFilterGroups } from "@/shared/compare/useCascadingFilterGroups";
import type { FilterGroup } from "@/shared/compare/types";

export type { FilterGroup } from "@/shared/compare/types";

interface FilterBarProps<T extends { id: string; model: string }> {
  filterGroups: FilterGroup<T>[];
  data: T[];
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  resultCount: number;
  filterTitleKey?: string;
  clearFiltersKey?: string;
  filteredCountKey?: string;
  autoExpandHintKey?: string;
  pinnedHintKey?: string;
  /* ── 型号选择相关（可选） ── */
  models?: T[];
  selectedIds?: string[];
  onToggleModel?: (id: string) => void;
  onClearSelected?: () => void;
  i18nPrefix?: string;
  uid?: string;
  selectModelsTitleKey?: string;
  clearSelectedKey?: string;
}

function FilterBar<T extends { id: string; model: string }>({
  filterGroups,
  data,
  filters,
  onFilterChange,
  onClearFilters,
  resultCount,
  filterTitleKey = "hardwareCompare.filters",
  clearFiltersKey = "hardwareCompare.clearFilters",
  filteredCountKey = "hardwareCompare.filteredCount",
  autoExpandHintKey = "hardwareCompare.autoExpandHint",
  pinnedHintKey = "hardwareCompare.pinnedHint",
  models,
  selectedIds,
  onToggleModel,
  onClearSelected,
  i18nPrefix,
  uid,
  selectModelsTitleKey,
  clearSelectedKey = "hardwareCompare.clearSelected",
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const hasActiveFilters = Object.keys(filters).length > 0;
  const [masterCollapsed, setMasterCollapsed] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>();
  const modelPicker =
    models && selectedIds && onToggleModel && onClearSelected
      ? { models, selectedIds, onToggleModel, onClearSelected }
      : null;

  const expandOnHover = useCallback(() => {
    if (!autoMode) return;
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setMasterCollapsed(false);
  }, [autoMode]);

  const collapseOnLeave = useCallback(() => {
    if (!autoMode) return;
    collapseTimer.current = setTimeout(() => {
      setMasterCollapsed(true);
    }, 400);
  }, [autoMode]);

  const toggleMaster = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    if (autoMode) {
      // 点击：退出自动模式，保持展开
      setAutoMode(false);
      setMasterCollapsed(false);
    } else {
      // 点击：收起并进入自动模式
      setAutoMode(true);
      setMasterCollapsed(true);
    }
  }, [autoMode]);

  const resolvedGroups = useCascadingFilterGroups(
    filterGroups,
    data,
    filters,
    i18n.language
  );

  return (
    <div
      className="rounded-xl border bg-card/50"
      onMouseEnter={expandOnHover}
      onMouseLeave={collapseOnLeave}
    >
      {/* ── 标题栏（始终显示，整行可点击缩起/展开） ── */}
      <div
        className={cn(
          "flex items-center justify-between px-4 cursor-pointer select-none transition-all",
          masterCollapsed ? "py-1" : "py-2.5"
        )}
        onClick={toggleMaster}
      >
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
          {t(filterTitleKey)}
        </span>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all duration-200"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
          >
            <RotateCcw className="size-2.5 shrink-0" />
            {t(clearFiltersKey)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 w-6 p-0 rounded-full transition-all duration-300 group",
              autoMode
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                : "bg-primary/10 text-primary hover:bg-primary/20 ring-1 ring-primary/20"
            )}
            onClick={toggleMaster}
            title={autoMode ? t(autoExpandHintKey) : t(pinnedHintKey)}
          >
            {autoMode ? (
              <PinOff className="size-3.5 transition-transform duration-300 group-hover:scale-110" />
            ) : (
              <Pin className="size-3.5 transition-transform duration-300 group-hover:scale-110" />
            )}
          </Button>
        </div>
      </div>

      {/* ── 可切换内容区域 ── */}
      {!masterCollapsed && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40">
          <FacetedFilterGroups
            groups={resolvedGroups}
            filters={filters}
            onFilterChange={onFilterChange}
          />

          {modelPicker && (
            <>
              <div className="border-t border-border/40" />
              <ModelPicker
                models={modelPicker.models}
                selectedIds={modelPicker.selectedIds}
                onToggleModel={modelPicker.onToggleModel}
                onClearSelected={modelPicker.onClearSelected}
                hasActiveFilters={hasActiveFilters}
                resultCount={resultCount}
                filteredCountKey={filteredCountKey}
                i18nPrefix={i18nPrefix}
                uid={uid}
                selectModelsTitleKey={selectModelsTitleKey}
                clearSelectedKey={clearSelectedKey}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default FilterBar;
