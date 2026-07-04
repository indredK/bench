/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next"
import { AppWindow, ArrowUpCircle, Download } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { AppManagerTabKey } from "@/features/app-manager/model/store-types"

interface AppManagerTabsProps {
  t: TFunction
  activeTab: AppManagerTabKey
  onChange: (tab: AppManagerTabKey) => void
  updateCount: number
}

export function AppManagerTabs({ t, activeTab, onChange, updateCount }: AppManagerTabsProps) {
  const getTriggerClass = (tab: AppManagerTabKey) =>
    cn(
      "relative h-full px-3 select-none !rounded-none !border-0 !bg-transparent !shadow-none",
      "after:absolute after:bottom-[-1px] after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-primary after:transition-opacity",
      activeTab === tab
        ? "font-medium text-foreground after:opacity-100"
        : "text-muted-foreground after:opacity-0 hover:text-foreground",
    )

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onChange(value as AppManagerTabKey)}
      className="shrink-0 select-none"
    >
      <TabsList className="h-10 w-full justify-start gap-1 rounded-none border-b bg-transparent p-0 select-none">
        <TabsTrigger value="installed" className={getTriggerClass("installed")}>
          <AppWindow size={14} />
          <span>{t("appManager.tabs.installed")}</span>
        </TabsTrigger>
        <TabsTrigger value="softwareUpdate" className={getTriggerClass("softwareUpdate")}>
          <ArrowUpCircle size={14} />
          <span>{t("appManager.tabs.softwareUpdate")}</span>
          {updateCount > 0 && (
            <span
              className={cn(
                "ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full",
                "bg-red-500 px-1 text-[10px] font-semibold text-white tabular-nums dark:bg-red-600",
              )}
            >
              {updateCount > 99 ? "99+" : updateCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="marketplace" className={getTriggerClass("marketplace")}>
          <Download size={14} />
          <span>{t("appManager.tabs.marketplace")}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
