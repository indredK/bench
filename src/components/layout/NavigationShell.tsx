/**
 * Layout UI / 布局 UI: arrange nav + content per selected layout.
 *
 * The feature tree (items) is identical across all three forms; only the
 * position/orientation of the navigation changes:
 *   - sidebar    → nav on the left, content to the right
 *   - top-tab    → nav as a top bar, content below
 *   - bottom-tab → content above, nav as a bottom dock
 */
import type { ReactNode } from "react"
import type { NavigationItem } from "@/features/types"
import type { NavigationLayoutId } from "@/lib/navigationLayout"
import Sidebar from "./Sidebar"
import TopTabNavigation from "./TopTabNavigation"
import BottomTabNavigation from "./BottomTabNavigation"

export interface NavigationShellProps {
  layout: NavigationLayoutId
  activePath: string
  items: NavigationItem[]
  configItems?: NavigationItem[]
  onPrefs?: () => void
  children: ReactNode
}

export function NavigationShell({
  layout,
  activePath,
  items,
  configItems,
  onPrefs,
  children,
}: NavigationShellProps) {
  const content = (
    <div className="bg-background flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden p-4">{children}</div>
    </div>
  )

  if (layout === "top-tab") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopTabNavigation
          activePath={activePath}
          items={items}
          configItems={configItems}
          onPrefs={onPrefs}
        />
        {content}
      </div>
    )
  }

  if (layout === "bottom-tab") {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {content}
        <BottomTabNavigation
          activePath={activePath}
          items={items}
          configItems={configItems}
          onPrefs={onPrefs}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar activePath={activePath} items={items} configItems={configItems} onPrefs={onPrefs} />
      {content}
    </div>
  )
}

export default NavigationShell
