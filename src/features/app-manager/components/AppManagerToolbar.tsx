/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AppManagerToolbarProps {
  t: TFunction;
  searchQuery: string;
  searchPlaceholder: string;
  onSearchQueryChange: (query: string) => void;
  searchDisabled?: boolean;
  actions?: ReactNode;
  rightContent?: ReactNode;
  searchClassName?: string;
}

export function AppManagerToolbar({
  t,
  searchQuery,
  searchPlaceholder,
  onSearchQueryChange,
  searchDisabled = false,
  actions,
  rightContent,
  searchClassName,
}: AppManagerToolbarProps) {
  return (
    <div className="shrink-0 rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <div className={cn("relative flex-1 min-w-[220px] max-w-md", searchClassName)}>
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("appManager.searchPlaceholder")}
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="h-8 pl-9"
            disabled={searchDisabled}
          />
        </div>

        {actions}

        <div className="flex-1" />

        {rightContent}
      </div>
    </div>
  );
}
