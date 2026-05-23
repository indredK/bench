/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { History, RefreshCw } from "lucide-react";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { AppManagerToolbar } from "@/features/app-manager/components/AppManagerToolbar";

interface AppManagerActionBarProps {
  t: TFunction;
  searchQuery: string;
  searchPlaceholder: string;
  loading: boolean;
  historyOpen: boolean;
  onSearchQueryChange: (query: string) => void;
  onScanApps: () => void;
  onToggleHistory: () => void;
}

export function AppManagerActionBar({
  t,
  searchQuery,
  searchPlaceholder,
  loading,
  historyOpen,
  onSearchQueryChange,
  onScanApps,
  onToggleHistory,
}: AppManagerActionBarProps) {
  return (
    <AppManagerToolbar
      t={t}
      searchQuery={searchQuery}
      searchPlaceholder={searchPlaceholder}
      onSearchQueryChange={onSearchQueryChange}
      searchDisabled={loading}
      rightContent={
        <div className="flex items-center gap-1.5">
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
      }
    />
  );
}
