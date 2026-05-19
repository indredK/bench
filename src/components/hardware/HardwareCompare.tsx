import { useMemo, useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import FilterBar from "@/components/features/FilterBar";
import type { CompareDataModule } from "@/features/compare/types";
import { CompareMatrixTable } from "@/features/compare/CompareMatrixTable";

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

  const { bestValues, rangeValues } = useMemo(() => {
    const nextBestValues = new Map<keyof T, Set<string>>();
    const nextRangeValues = new Map<keyof T, { min: number; max: number }>();

    specRows.forEach((row) => {
      if (selectedModels.length < 2) return;

      const key = row.key;
      if (numericKeys.includes(key)) {
        const nums = selectedModels
          .map((model) => model[key] as number)
          .filter((value) => value != null);

        if (nums.length > 0) {
          const maxVal = Math.max(...nums);
          nextRangeValues.set(key, { min: Math.min(...nums), max: maxVal });
          nextBestValues.set(
            key,
            new Set(
              selectedModels
                .filter((model) => (model[key] as number) === maxVal)
                .map((model) => model.id)
            )
          );
        }
      } else if (inverseKeys.includes(key)) {
        const nums = selectedModels
          .map((model) => model[key] as number)
          .filter((value) => value != null);

        if (nums.length > 0) {
          const minVal = Math.min(...nums);
          nextRangeValues.set(key, { min: minVal, max: Math.max(...nums) });
          nextBestValues.set(
            key,
            new Set(
              selectedModels
                .filter((model) => (model[key] as number) === minVal)
                .map((model) => model.id)
            )
          );
        }
      }
    });

    return {
      bestValues: nextBestValues,
      rangeValues: nextRangeValues,
    };
  }, [inverseKeys, numericKeys, selectedModels, specRows]);

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
              resultCount={allFiltered.length}
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
              <CompareMatrixTable
                specRows={specRows}
                selectedModels={selectedModels}
                numericKeys={numericKeys}
                inverseKeys={inverseKeys}
                i18nPrefix={i18nPrefix}
                bestValues={bestValues}
                rangeValues={rangeValues}
                referenceUrl={referenceUrl}
                onRemoveModel={toggleModel}
                containerClassName="rounded-xl border shadow-xs flex-1 min-h-0"
              />
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
