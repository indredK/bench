/**
 * Shared Compare / 共享对比: own generic compare tools; 只负责通用对比能力.
 */
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ResolvedFilterGroup } from "@/shared/compare/useCascadingFilterGroups"

interface FacetedFilterGroupsProps<T> {
  groups: ResolvedFilterGroup<T>[]
  filters: Record<string, string>
  onFilterChange: (key: string, value: string) => void
}

function FacetedFilterGroups<T>({ groups, filters, onFilterChange }: FacetedFilterGroupsProps<T>) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3 pt-3">
      {groups.map((group) => {
        const filterKey = String(group.key)
        const activeFilter = filters[filterKey]

        return (
          <div key={filterKey} className="flex items-start gap-2 sm:gap-3">
            <span className="text-muted-foreground min-w-[4.5rem] shrink-0 pt-0.5 text-left text-xs leading-5 font-medium sm:text-right">
              {t(group.label)}
            </span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {group.options.map((option) => {
                const isActive = activeFilter === option.value

                return (
                  <Badge
                    key={option.value}
                    variant={isActive ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer text-xs transition-all select-none",
                      isActive
                        ? "shadow-sm"
                        : "hover:bg-accent hover:text-accent-foreground active:scale-95",
                    )}
                    onClick={() => onFilterChange(filterKey, option.value)}
                  >
                    {option.label}
                    {isActive && <X className="ml-1 size-2.5" />}
                  </Badge>
                )
              })}
              {group.options.length === 0 && (
                <span className="text-muted-foreground text-xs italic">—</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default FacetedFilterGroups
