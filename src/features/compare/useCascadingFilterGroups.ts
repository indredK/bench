import { useMemo } from "react";
import type { FilterGroup, FilterGroupOption } from "@/features/compare/types";

export interface ResolvedFilterGroup<T> extends FilterGroup<T> {
  options: FilterGroupOption[];
}

export function useCascadingFilterGroups<T>(
  filterGroups: FilterGroup<T>[],
  data: T[],
  filters: Record<string, string>,
  language: string
) {
  return useMemo<ResolvedFilterGroup<T>[]>(() => {
    return filterGroups.map((filterGroup) => {
      const otherFilters = { ...filters };
      delete otherFilters[String(filterGroup.key)];

      const pool =
        Object.keys(otherFilters).length > 0
          ? data.filter((item) =>
              Object.entries(otherFilters).every(
                ([key, value]) => String(item[key as keyof T]) === value
              )
            )
          : data;

      const uniqueValues = new Set<string>();

      for (const item of pool) {
        const raw = item[filterGroup.key];
        if (raw != null && raw !== "") {
          uniqueValues.add(String(raw));
        }
      }

      const options = Array.from(uniqueValues)
        .sort()
        .map((value) => ({
          value,
          label: filterGroup.format ? filterGroup.format(value) : value,
        }));

      return { ...filterGroup, options };
    });
  }, [filterGroups, data, filters, language]);
}

