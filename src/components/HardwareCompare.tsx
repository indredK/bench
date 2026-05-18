import { useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  StickyTable,
  StickyTableHeader,
  StickyTableBody,
  StickyTableRow,
  StickyTableHead,
  StickyTableCell,
} from "@/components/ui/StickyTable";
import { cn } from "@/lib/utils";
import FilterBar from "@/components/FilterBar";
import type { FilterGroup } from "@/components/FilterBar";

export type { FilterGroup };

export interface SpecRow<T> {
  key: keyof T;
  label: string;
  format?: (val: T[keyof T], model: T) => string;
}

export interface CompareDataModule<T extends { id: string; model: string }> {
  data: T[];
  specRows: SpecRow<T>[];
  numericKeys: (keyof T)[];
  inverseKeys: (keyof T)[];
  i18nPrefix: string;
  filterGroups?: FilterGroup<T>[];
  /** 获取某个字段的参考链接（key 为规格行字段名） */
  referenceUrl?: (model: T, key: keyof T) => string | undefined;
}

interface HardwareCompareProps<T extends { id: string; model: string }> {
  module: CompareDataModule<T>;
}

function HardwareCompare<T extends { id: string; model: string }>({
  module,
}: HardwareCompareProps<T>) {
  const { t } = useTranslation();
  const uid = useId();
  const {
    data,
    specRows,
    numericKeys,
    inverseKeys,
    i18nPrefix,
    filterGroups,
    referenceUrl,
  } = module;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const clearSelectedModels = () => setSelectedIds([]);

  const toggleModel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => {
      if (prev[key] === value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const clearFilters = () => setFilters({});

  const hasActiveFilters = Object.keys(filters).length > 0;

  // Apply filters to available-models pool (selected models stay unfiltered)
  const filteredData = !hasActiveFilters
    ? data
    : data.filter((m) =>
        Object.entries(filters).every(
          ([key, value]) => String(m[key as keyof T]) === value
        )
      );

  const selectedModels = data.filter((m) => selectedIds.includes(m.id));
  const allFiltered = filteredData; // 筛选后的全部型号（不排除已选中的）

  const bestValues = new Map<keyof T, Set<string>>();
  const rangeValues = new Map<keyof T, { min: number; max: number }>();
  specRows.forEach((row) => {
    if (selectedModels.length < 2) return;
    const key = row.key;
    if (numericKeys.includes(key)) {
      const nums = selectedModels
        .map((m) => m[key] as number)
        .filter((n) => n != null);
      if (nums.length > 0) {
        const maxVal = Math.max(...nums);
        rangeValues.set(key, { min: Math.min(...nums), max: maxVal });
        bestValues.set(
          key,
          new Set(
            selectedModels
              .filter((m) => (m[key] as number) === maxVal)
              .map((m) => m.id)
          )
        );
      }
    } else if (inverseKeys.includes(key)) {
      const nums = selectedModels
        .map((m) => m[key] as number)
        .filter((n) => n != null);
      if (nums.length > 0) {
        const minVal = Math.min(...nums);
        rangeValues.set(key, { min: minVal, max: Math.max(...nums) });
        bestValues.set(
          key,
          new Set(
            selectedModels
              .filter((m) => (m[key] as number) === minVal)
              .map((m) => m.id)
          )
        );
      }
    }
  });

  return (
    <TooltipProvider delay={200}>
      <Card className="shadow-sm flex-1 flex flex-col min-h-0">
        <CardContent className="pt-4 space-y-4 flex flex-col flex-1 min-h-0">
          {/* ── 筛选 + 型号选择（合并） ── */}
          {filterGroups && filterGroups.length > 0 && (
            <FilterBar
              filterGroups={filterGroups}
              data={data}
              filters={filters}
              onFilterChange={setFilter}
              onClearFilters={clearFilters}
              models={allFiltered}
              selectedIds={selectedIds}
              onToggleModel={toggleModel}
              onClearSelected={clearSelectedModels}
              i18nPrefix={i18nPrefix}
              uid={uid}
            />
          )}

          {/* ── 对比表格 ── */}
          {selectedModels.length > 0 && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between shrink-0 mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t(`${i18nPrefix}.comparingTitle`, {
                    count: selectedModels.length,
                  })}
                </p>
              </div>
              <StickyTable containerClassName="rounded-xl border shadow-xs flex-1 min-h-0">
                <StickyTableHeader>
                  <StickyTableRow>
                    <StickyTableHead isFirstColumn isFirstRow>
                      {t(`${i18nPrefix}.specification`)}
                    </StickyTableHead>
                    {selectedModels.map((model) => (
                      <StickyTableHead
                        key={model.id}
                        isFirstRow
                        className="min-w-[140px]"
                      >
                        <div className="flex items-center gap-2">
                          <div className="size-2 shrink-0 rounded-full bg-primary/40" />
                          <span className="truncate font-medium">
                            {model.model}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0 ml-auto opacity-60 hover:opacity-100 transition-opacity"
                            onClick={() => toggleModel(model.id)}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      </StickyTableHead>
                    ))}
                  </StickyTableRow>
                </StickyTableHeader>
                <StickyTableBody>
                  {specRows.map((row, idx) => {
                    const isBest = bestValues.has(row.key);
                    const range = rangeValues.get(row.key);
                    const isNumeric =
                      numericKeys.includes(row.key) ||
                      inverseKeys.includes(row.key);
                    const isEvenRow = idx % 2 === 1;
                    return (
                      <StickyTableRow
                        key={String(row.key)}
                        className="transition-none"
                      >
                        <StickyTableCell isFirstColumn className="text-xs">
                          {t(row.label)}
                        </StickyTableCell>
                        {selectedModels.map((model) => {
                          const val = model[row.key];
                          const displayVal = row.format
                            ? row.format(val as never, model)
                            : String(val ?? "—");
                          const isHighlighted =
                            isBest &&
                            bestValues.get(row.key)?.has(model.id);

                          let barPercent = 0;
                          if (
                            range &&
                            isNumeric &&
                            val != null &&
                            !Number.isNaN(Number(val))
                          ) {
                            const num = Number(val);
                            const diff = range.max - range.min;
                            if (diff > 0) {
                              barPercent =
                                ((num - range.min) / diff) * 100;
                            } else {
                              barPercent = 100;
                            }
                          }

                          const refUrl = referenceUrl
                            ? referenceUrl(model, row.key)
                            : undefined;

                          return (
                            <StickyTableCell
                              key={model.id}
                              className={cn(
                                "relative",
                                isEvenRow && "bg-muted/15",
                                isHighlighted &&
                                  "font-bold text-emerald-600 dark:text-emerald-400"
                              )}
                            >
                              {barPercent > 0 && (
                                <div
                                  className="absolute inset-y-1.5 left-0 rounded-r-full transition-all duration-300"
                                  style={{
                                    width: `${Math.max(barPercent, 4)}%`,
                                    background: isHighlighted
                                      ? "linear-gradient(90deg, rgba(5,150,105,0.20), rgba(5,150,105,0.06))"
                                      : "linear-gradient(90deg, rgba(107,114,128,0.10), rgba(107,114,128,0.02))",
                                  }}
                                />
                              )}
                              <div className="relative z-10 flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "text-sm tabular-nums",
                                    isHighlighted &&
                                      "text-emerald-700 dark:text-emerald-300"
                                  )}
                                >
                                  {displayVal}
                                </span>
                                {refUrl && (
                                  <Tooltip>
                                    <TooltipTrigger
                                      className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(
                                          refUrl,
                                          "_blank",
                                          "noopener,noreferrer"
                                        );
                                      }}
                                    >
                                      <ExternalLink className="size-3" />
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      align="center"
                                      className="max-w-[400px] break-all"
                                    >
                                      <span className="font-mono text-[10px]">
                                        {refUrl}
                                      </span>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </StickyTableCell>
                          );
                        })}
                      </StickyTableRow>
                    );
                  })}
                </StickyTableBody>
              </StickyTable>
            </div>
          )}

          {/* ── 空状态 ── */}
          {selectedModels.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 py-10 text-center">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <Plus className="size-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("hardwareCompare.noModelsSelected")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default HardwareCompare;
