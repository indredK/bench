import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface FilterBarProps<T extends { id: string }> {
  filterGroups: FilterGroup<T>[];
  data: T[];
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
}

function FilterBar<T extends { id: string }>({
  filterGroups,
  data,
  filters,
  onFilterChange,
  onClearFilters,
}: FilterBarProps<T>) {
  const { t } = useTranslation();
  const hasActiveFilters = Object.keys(filters).length > 0;

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
    <div className="space-y-2">
      <div className="flex flex-col gap-2">
        {resolvedGroups.map((fg) => {
          const activeFilter = filters[String(fg.key)];
          return (
            <div key={String(fg.key)} className="flex items-start gap-3">
              <span className="w-20 shrink-0 pt-0.5 text-right text-xs font-medium text-muted-foreground leading-5">
                {t(fg.label)}
              </span>
              <div className="flex flex-wrap gap-1">
                {fg.options.map((opt) => {
                  const isActive = activeFilter === opt.value;
                  return (
                    <Badge
                      key={opt.value}
                      variant={isActive ? "default" : "outline"}
                      className="cursor-pointer select-none text-xs"
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
      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-3 text-xs gap-1.5 rounded-full",
              "border border-border/40",
              "bg-background/50 backdrop-blur-sm",
              "text-muted-foreground hover:text-foreground",
              "shadow-xs hover:shadow-sm",
              "transition-all duration-200 ease-in-out",
              "hover:scale-[1.03] active:scale-95",
              "hover:bg-muted/80 hover:border-muted-foreground/20",
            )}
            onClick={onClearFilters}
          >
            <RotateCcw className="size-3 transition-transform duration-300 group-hover:rotate-[-180deg]" />
            {t("hardwareCompare.clearFilters")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default FilterBar;
