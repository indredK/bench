import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AppInfo } from "@/lib/tauri/types";
import { APP_CATEGORIES, classifyApp, type AppCategoryKey } from "./app-categories";

interface CategoryFilterProps {
  apps: AppInfo[];
  selected: AppCategoryKey | null;
  onChange: (category: AppCategoryKey | null) => void;
}

export function CategoryFilter({ apps, selected, onChange }: CategoryFilterProps) {
  const { t } = useTranslation();

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
    };
    for (const app of apps) {
      counts[classifyApp(app)]++;
    }
    return counts;
  }, [apps]);

  return (
    <div className="flex flex-col gap-1">
      {APP_CATEGORIES.map((cat) => (
        <Badge
          key={cat.key}
          variant={selected === cat.key ? "default" : "outline"}
          className="cursor-pointer select-none text-xs justify-start"
          onClick={() => onChange(selected === cat.key ? null : cat.key)}
        >
          {t(cat.labelKey)} ({categoryCounts[cat.key]})
        </Badge>
      ))}
    </div>
  );
}