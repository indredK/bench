/**
 * Feature / 功能层: stay within this feature; 只处理当前功能.
 */
import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types"
import { APP_CATEGORIES, classifyApp, type AppCategoryKey } from "../app-categories"
import { APP_SERIES, classifySeries, type AppSeriesKey } from "../app-series"

type FilterMode = "category" | "series"

export type CategorizableItem = AppInfo | InstallListAppInfo

function getAppCategory(item: CategorizableItem): AppCategoryKey {
  if ("_virtual" in item) return (item as InstallListAppInfo).category as AppCategoryKey
  return classifyApp(item as AppInfo)
}

function getAppSeries(item: CategorizableItem): AppSeriesKey {
  if ("_virtual" in item) return (item as InstallListAppInfo).series as AppSeriesKey
  return classifySeries(item as AppInfo)
}

interface CategoryFilterProps {
  apps: CategorizableItem[]
  categorySelected: AppCategoryKey | null
  seriesSelected: AppSeriesKey | null
  onCategoryChange: (category: AppCategoryKey | null) => void
  onSeriesChange: (series: AppSeriesKey | null) => void
}

export function CategoryFilter({
  apps,
  categorySelected,
  seriesSelected,
  onCategoryChange,
  onSeriesChange,
}: CategoryFilterProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<FilterMode>("category")

  const categoryCounts = useMemo(() => {
    const counts: Record<AppCategoryKey, number> = {
      ai: 0,
      browser: 0,
      communication: 0,
      ide: 0,
      launcher: 0,
      utility: 0,
      development: 0,
      system: 0,
      other: 0,
    }
    for (const app of apps) {
      counts[getAppCategory(app)]++
    }
    return counts
  }, [apps])

  const seriesCounts = useMemo(() => {
    const counts: Record<AppSeriesKey, number> = {
      google: 0,
      microsoft: 0,
      apple: 0,
      tencent: 0,
      bytedance: 0,
      alibaba: 0,
      baidu: 0,
      openai: 0,
      other: 0,
    }
    for (const app of apps) {
      counts[getAppSeries(app)]++
    }
    return counts
  }, [apps])

  const switchTo = (newMode: FilterMode) => {
    if (newMode === mode) return
    setMode(newMode)
    if (newMode === "category") {
      onSeriesChange(null)
    } else {
      onCategoryChange(null)
    }
  }

  const isCategory = mode === "category"
  const items = isCategory ? APP_CATEGORIES : APP_SERIES
  const selected = isCategory ? categorySelected : seriesSelected
  const handleSelect = (key: string) => {
    if (isCategory) {
      onCategoryChange(selected === key ? null : (key as AppCategoryKey))
    } else {
      onSeriesChange(selected === key ? null : (key as AppSeriesKey))
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 flex items-center gap-1.5">
        <Button
          variant={mode === "category" ? "default" : "ghost"}
          size="xs"
          onClick={() => switchTo("category")}
        >
          {t("appManager.filterTabCategory")}
        </Button>
        <span className="text-muted-foreground/50 text-xs select-none">|</span>
        <Button
          variant={mode === "series" ? "default" : "ghost"}
          size="xs"
          onClick={() => switchTo("series")}
        >
          {t("appManager.filterTabSeries")}
        </Button>
      </div>
      {items.map((item) => (
        <Badge
          key={item.key}
          variant={selected === item.key ? "default" : "outline"}
          className="cursor-pointer justify-start text-xs select-none"
          onClick={() => handleSelect(item.key)}
        >
          {t(item.labelKey)} (
          {isCategory
            ? categoryCounts[item.key as AppCategoryKey]
            : seriesCounts[item.key as AppSeriesKey]}
          )
        </Badge>
      ))}
    </div>
  )
}
