import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Plus, X, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface FilterGroupOption {
  value: string;
  label: string;
}

export interface FilterGroup<T> {
  key: keyof T;
  label: string;
  options?: FilterGroupOption[];
  format?: (value: unknown) => string;
}

interface FilterBarProps<T extends { id: string; model: string }> {
  filterGroups: FilterGroup<T>[];
  data: T[];
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  /* ── 型号选择相关 ── */
  models: T[];
  selectedIds: string[];
  onToggleModel: (id: string) => void;
  i18nPrefix: string;
  uid: string;
}

function FilterBar<T extends { id: string; model: string }>({
  filterGroups,
  data,
  filters,
  onFilterChange,
  onClearFilters,
  models,
  selectedIds,
  onToggleModel,
  i18nPrefix,
  uid,
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const hasActiveFilters = Object.keys(filters).length > 0;
  const [modelsCollapsed, setModelsCollapsed] = useState(false);

  // Compute cascading filter options: each group's options are constrained
  // by all OTHER active filters (so brand → series → socket → launchYear cascade)
  const resolvedGroups = useMemo(() => {
    return filterGroups.map((fg) => {
      const otherFilters = { ...filters };
      delete otherFilters[String(fg.key)];

      let pool: T[] = data;
      if (Object.keys(otherFilters).length > 0) {
        pool = data.filter((m) =>
          Object.entries(otherFilters).every(
            ([key, value]) => String(m[key as keyof T]) === value
          )
        );
      }

      const uniqueValues = new Set<string>();
      pool.forEach((m) => {
        const raw = m[fg.key];
        if (raw != null && raw !== "") {
          uniqueValues.add(String(raw));
        }
      });

      const options = Array.from(uniqueValues)
        .sort()
        .map((v) => ({
          value: v,
          label: fg.format ? fg.format(v) : v,
        }));

      return { ...fg, options };
    });
  }, [filterGroups, data, filters]);

  return (
    <div className="rounded-xl border bg-card/50 p-4 space-y-3 relative">
      {/* ── 筛选组 ── */}
      <div className="flex flex-col gap-3">
        {resolvedGroups.map((fg) => {
          const activeFilter = filters[String(fg.key)];
          return (
            <div key={String(fg.key)} className="flex items-start gap-2 sm:gap-3">
              <span className="min-w-[4.5rem] shrink-0 pt-0.5 text-left sm:text-right text-xs font-medium text-muted-foreground leading-5">
                {t(fg.label)}
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {fg.options.map((opt) => {
                  const isActive = activeFilter === opt.value;
                  return (
                    <Badge
                      key={opt.value}
                      variant={isActive ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer select-none text-xs transition-all",
                        isActive
                          ? "shadow-sm"
                          : "hover:bg-accent hover:text-accent-foreground active:scale-95"
                      )}
                      onClick={() => onFilterChange(String(fg.key), opt.value)}
                    >
                      {opt.label}
                      {isActive && <X className="ml-1 size-2.5" />}
                    </Badge>
                  );
                })}
                {fg.options.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 分隔线 ── */}
      <div className="border-t border-border/40" />

      {/* ── 型号选择列表（可折叠） ── */}
      <Collapsible
        open={!modelsCollapsed}
        onOpenChange={(open) => setModelsCollapsed(!open)}
      >
        <CollapsibleTrigger className="group flex items-center justify-between w-full cursor-pointer select-none">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground/80">
              {t(`${i18nPrefix}.selectModels`)}
            </span>
            {hasActiveFilters && (
              <span className="text-xs text-muted-foreground font-normal tabular-nums">
                {t("hardwareCompare.filteredCount", { count: models.length })}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground/50 transition-all duration-200 group-hover:text-muted-foreground",
              modelsCollapsed && "-rotate-90"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {models.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {models.map((model) => {
                const isSelected = selectedIds.includes(model.id);
                return (
                  <Button
                    key={`${uid}-model-${model.id}`}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "gap-1.5 transition-all active:scale-95",
                      isSelected
                        ? "shadow-sm"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => onToggleModel(model.id)}
                  >
                    {isSelected ? (
                      <X className="size-3 shrink-0" />
                    ) : (
                      <Plus className="size-3 shrink-0" />
                    )}
                    <span className="max-w-[160px] truncate">{model.model}</span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              {t("hardwareCompare.noModelsSelected")}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* 行内清除按钮 */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-6 px-2 text-xs gap-1 rounded-full absolute top-3 right-3 transition-all duration-200",
          "text-muted-foreground hover:text-foreground hover:bg-muted/80",
          hasActiveFilters ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClearFilters}
        tabIndex={hasActiveFilters ? 0 : -1}
      >
        <RotateCcw className="size-2.5 shrink-0" />
        {t("hardwareCompare.clearFilters")}
      </Button>
    </div>
  );
}

export default FilterBar;
