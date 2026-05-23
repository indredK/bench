/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { AppWindow, ArrowUpCircle, Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { AppManagerTabKey } from "@/features/app-manager/model/store-types";

interface AppManagerTabsProps {
  t: TFunction;
  activeTab: AppManagerTabKey;
  onChange: (tab: AppManagerTabKey) => void;
  updateCount: number;
}

export function AppManagerTabs({ t, activeTab, onChange, updateCount }: AppManagerTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onChange(value as AppManagerTabKey)}
      className="shrink-0"
    >
      <TabsList className="h-9">
        <TabsTrigger value="installed" className="px-3">
          <AppWindow size={14} />
          <span>{t("appManager.tabs.installed")}</span>
        </TabsTrigger>
        <TabsTrigger value="softwareUpdate" className="px-3">
          <ArrowUpCircle size={14} />
          <span>{t("appManager.tabs.softwareUpdate")}</span>
          {updateCount > 0 && (
            <span
              className={cn(
                "ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full",
                "bg-red-500 dark:bg-red-600 px-1 text-[10px] font-semibold tabular-nums text-white"
              )}
            >
              {updateCount > 99 ? "99+" : updateCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="marketplace" className="px-3">
          <Download size={14} />
          <span>{t("appManager.tabs.marketplace")}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
