import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AppInfo } from "@/lib/tauri/types";
import { APP_CATEGORIES, classifyApp, type AppCategoryKey } from "./app-categories";
import { APP_SERIES, classifySeries, type AppSeriesKey } from "./app-series";

type FilterMode = "category" | "series";

interface CategoryFilterProps {
  apps: AppInfo[];
  categorySelected: AppCategoryKey | null;
  seriesSelected: AppSeriesKey | null;
  onCategoryChange: (category: AppCategoryKey | null) => void;
  onSeriesChange: (series: AppSeriesKey | null) => void;
}

export function CategoryFilter({
  apps,
  categorySelected,
  seriesSelected,
  onCategoryChange,
  onSeriesChange,
}: CategoryFilterProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FilterMode>("category");

  const categoryCounts = useMemo(() => {
    const counts: Record<AppCategoryKey, number> = {
      ai: 0, browser: 0, communication: 0, ide: 0, launcher: 0,
      utility: 0, development: 0, system: 0, other: 0,
    };
    for (const app of apps) {
      counts[classifyApp(app)]++;
    }
    return counts;
  }, [apps]);

  const seriesCounts = useMemo(() => {
    const counts: Record<AppSeriesKey, number> = {
      google: 0, microsoft: 0, apple: 0, tencent: 0, bytedance: 0,
      alibaba: 0, baidu: 0, openai: 0, other: 0,
    };
    for (const app of apps) {
      counts[classifySeries(app)]++;
    }
    return counts;
  }, [apps]);

  const switchTo = (newMode: FilterMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    if (newMode === "category") {
      onSeriesChange(null);
    } else {
      onCategoryChange(null);
    }
  };

  const isCategory = mode === "category";
  const items = isCategory ? APP_CATEGORIES : APP_SERIES;
  const selected = isCategory ? categorySelected : seriesSelected;
  const handleSelect = (key: string) => {
    if (isCategory) {
      onCategoryChange(selected === key ? null : key as AppCategoryKey);
    } else {
      onSeriesChange(selected === key ? null : key as AppSeriesKey);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 mb-1">
        <button
          onClick={() => switchTo("category")}
          className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
            mode === "category"
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          {t("appManager.filterTabCategory")}
        </button>
        <span className="text-muted-foreground/50 text-xs select-none">|</span>
        <button
          onClick={() => switchTo("series")}
          className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
            mode === "series"
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          {t("appManager.filterTabSeries")}
        </button>
      </div>
      {items.map((item) => (
        <Badge
          key={item.key}
          variant={selected === item.key ? "default" : "outline"}
          className="cursor-pointer select-none text-xs justify-start"
          onClick={() => handleSelect(item.key)}
        >
          {t(item.labelKey)} ({isCategory ? categoryCounts[item.key as AppCategoryKey] : seriesCounts[item.key as AppSeriesKey]})
        </Badge>
      ))}
    </div>
  );
}