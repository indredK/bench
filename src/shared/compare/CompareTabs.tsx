/**
 * Shared Compare / 共享对比: own generic compare tools; 只负责通用对比能力.
 */
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export interface CompareTabItem {
  id: string
  i18nPrefix: string
  icon: ReactNode
  content: ReactNode
}

interface CompareTabsProps {
  tabs: readonly CompareTabItem[]
  defaultTabId: string
  /** Optional group labels to render between tab sections.
   *  Key is the first tab id in the group, value is the label. */
  groupLabels?: Record<string, string>
}

function CompareTabs({ tabs, defaultTabId, groupLabels }: CompareTabsProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState(defaultTabId)
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className="bg-card/50 mb-4 flex shrink-0 flex-wrap gap-1 rounded-xl border p-3"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active.id
          const groupLabel = groupLabels?.[tab.id]

          return (
            <span key={tab.id} className="contents">
              {groupLabel && (
                <span className="text-muted-foreground w-full pt-2 pb-1 text-xs font-semibold tracking-wider uppercase first:pt-0">
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
          )
        })}
      </div>

      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {active.content}
      </div>
    </div>
  )
}

export default CompareTabs
