import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export interface CompareTabItem {
  id: string;
  i18nPrefix: string;
  icon: ReactNode;
  content: ReactNode;
}

interface CompareTabsProps {
  tabs: readonly CompareTabItem[];
  defaultTabId: string;
  /** Optional group labels to render between tab sections.
   *  Key is the first tab id in the group, value is the label. */
  groupLabels?: Record<string, string>;
}

function CompareTabs({ tabs, defaultTabId, groupLabels }: CompareTabsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(defaultTabId);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex flex-wrap gap-1 mb-4" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === active.id;
          const groupLabel = groupLabels?.[tab.id];

          return (
            <span key={tab.id} className="contents">
              {groupLabel && (
                <span className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2 pb-1 first:pt-0">
                  {groupLabel}
                </span>
              )}
              <Button
                role="tab"
                aria-selected={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {t(`${tab.i18nPrefix}.title`)}
              </Button>
            </span>
          );
        })}
      </div>

      <div role="tabpanel" className="flex-1 min-h-0">
        {active.content}
      </div>
    </div>
  );
}

export default CompareTabs;

