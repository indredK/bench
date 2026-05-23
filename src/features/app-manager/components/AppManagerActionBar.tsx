/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { History, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToolbarButton } from "@/components/ui/toolbar-button";

interface AppManagerActionBarProps {
  t: TFunction;
  searchQuery: string;
  loading: boolean;
  historyOpen: boolean;
  onSearchQueryChange: (query: string) => void;
  onScanApps: () => void;
  onToggleHistory: () => void;
}

export function AppManagerActionBar({
  t,
  searchQuery,
  loading,
  historyOpen,
  onSearchQueryChange,
  onScanApps,
  onToggleHistory,
}: AppManagerActionBarProps) {
  return (
    <div className="shrink-0 rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={t("appManager.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="pl-9 h-8"
            disabled={loading}
          />
        </div>
        <div className="flex-1" />
        <ToolbarButton
          icon={<RefreshCw size={15} className={loading ? "animate-spin" : ""} />}
          tooltip={loading ? t("appManager.scanning") : t("appManager.refresh")}
          onClick={onScanApps}
        />
        <ToolbarButton
          icon={<History size={15} />}
          tooltip={t("appManager.operationHistory")}
          onClick={onToggleHistory}
          active={historyOpen}
        />
      </div>
    </div>
  );
}
