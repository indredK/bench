/**
 * Feature / 功能层: stay within this feature; 只处理当前功能.
 */
import { useMemo, useId } from "react"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import FilterBar from "@/shared/compare/FilterBar"
import type { CompareDataModule } from "@/shared/compare/types"
import { CompareMatrixTable } from "@/shared/compare/CompareMatrixTable"
import { useHardwareCompareStore } from "@/features/hardware/store"

interface HardwareCompareProps<T extends { id: string; model: string }> {
  module: CompareDataModule<T>
}

const EMPTY_SELECTED_IDS: string[] = []
const EMPTY_FILTERS: Record<string, string> = {}

function HardwareCompare<T extends { id: string; model: string }>({
  module,
}: HardwareCompareProps<T>) {
  const { t } = useTranslation()
  const uid = useId()
  const { data, specRows, numericKeys, inverseKeys, i18nPrefix, filterGroups, referenceUrl } =
    module
  const scope = i18nPrefix

  const selectedIds = useHardwareCompareStore(
    (s) => s.selectedIdsByScope[scope] ?? EMPTY_SELECTED_IDS,
  )
  const filters = useHardwareCompareStore((s) => s.filtersByScope[scope] ?? EMPTY_FILTERS)
  const toggleModel = useHardwareCompareStore((s) => s.toggleModel)
  const setFilter = useHardwareCompareStore((s) => s.setFilter)
  const clearFilters = useHardwareCompareStore((s) => s.clearFilters)
  const clearSelectedModels = useHardwareCompareStore((s) => s.clearSelectedModels)

  const hasActiveFilters = Object.keys(filters).length > 0

  const filteredData = !hasActiveFilters
    ? data
    : data.filter((m) =>
        Object.entries(filters).every(([key, value]) => String(m[key as keyof T]) === value),
      )

  const selectedModels = data.filter((m) => selectedIds.includes(m.id))
  const allFiltered = filteredData

  const { bestValues, rangeValues } = useMemo(() => {
    const nextBestValues = new Map<keyof T, Set<string>>()
    const nextRangeValues = new Map<keyof T, { min: number; max: number }>()

    specRows.forEach((row) => {
      if (selectedModels.length < 2) return

      const key = row.key
      if (numericKeys.includes(key)) {
        const nums = selectedModels
          .map((model) => model[key] as number)
          .filter((value) => value != null)

        if (nums.length > 0) {
          const maxVal = Math.max(...nums)
          nextRangeValues.set(key, { min: Math.min(...nums), max: maxVal })
          nextBestValues.set(
            key,
            new Set(
              selectedModels
                .filter((model) => (model[key] as number) === maxVal)
                .map((model) => model.id),
            ),
          )
        }
      } else if (inverseKeys.includes(key)) {
        const nums = selectedModels
          .map((model) => model[key] as number)
          .filter((value) => value != null)

        if (nums.length > 0) {
          const minVal = Math.min(...nums)
          nextRangeValues.set(key, { min: minVal, max: Math.max(...nums) })
          nextBestValues.set(
            key,
            new Set(
              selectedModels
                .filter((model) => (model[key] as number) === minVal)
                .map((model) => model.id),
            ),
          )
        }
      }
    })

    return {
      bestValues: nextBestValues,
      rangeValues: nextRangeValues,
    }
  }, [inverseKeys, numericKeys, selectedModels, specRows])

  return (
    <TooltipProvider delay={200}>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {filterGroups && filterGroups.length > 0 && (
          <FilterBar
            filterGroups={filterGroups}
            data={data}
            filters={filters}
            onFilterChange={(key, value) => setFilter(scope, key, value)}
            onClearFilters={() => clearFilters(scope)}
            resultCount={allFiltered.length}
            models={allFiltered}
            selectedIds={selectedIds}
            onToggleModel={(id) => toggleModel(scope, id)}
            onClearSelected={() => clearSelectedModels(scope)}
            i18nPrefix={i18nPrefix}
            uid={uid}
          />
        )}

        {selectedModels.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
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
              onRemoveModel={(id) => toggleModel(scope, id)}
              containerClassName="rounded-xl border shadow-xs flex-1 min-h-0"
            />
          </div>
        )}

        {selectedModels.length === 0 && (
          <div className="bg-card/50 flex flex-1 flex-col items-center justify-center rounded-xl border py-10 text-center">
            <div className="bg-muted mb-3 flex size-10 items-center justify-center rounded-full">
              <Plus className="text-muted-foreground/60 size-5" />
            </div>
            <p className="text-muted-foreground text-sm">{t("hardwareCompare.noModelsSelected")}</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default HardwareCompare
