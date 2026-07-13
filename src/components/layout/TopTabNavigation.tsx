/**
 * Layout UI / 布局 UI: top tab navigation (display form 2).
 *
 * Renders the same feature tree as a horizontal top bar of tabs. The feature
 * data comes from `createNavigationItems` / `createConfigItems` and is unchanged.
 */
import { useMemo } from "react"
import { useLocation, Link } from "wouter"
import { useTranslation } from "react-i18next"
import type { NavigationItem } from "@/features/types"
import { QuickControls } from "./QuickControls"
import { useScrambleText } from "@/hooks/useScrambleText"
import { cn } from "@/lib/utils"

interface TopTabNavigationProps {
  items: NavigationItem[]
  /** Tool/config items shown after a separator (e.g. System Settings). */
  configItems?: NavigationItem[]
  onPrefs?: () => void
}

export function TopTabNavigation({ items, configItems, onPrefs }: TopTabNavigationProps) {
  const { t } = useTranslation()
  const [location] = useLocation()
  const { text: titleText, start: scrambleTitle } = useScrambleText({
    target: t("sidebar.title"),
    duration: 700,
  })

  const allItems = useMemo<NavigationItem[]>(
    () => [...items, ...(configItems ?? [])],
    [items, configItems],
  )
  const configPaths = useMemo(
    () => new Set((configItems ?? []).map((i) => i.path)),
    [configItems],
  )

  return (
    <div className="border-border bg-background text-foreground flex h-14 shrink-0 items-center gap-3 border-b px-4 select-none">
      <div className="flex shrink-0 items-center gap-2 pr-3">
        <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold">
          B
        </span>
        <span
          className="w-[68px] shrink-0 cursor-default truncate text-sm font-bold tracking-tight"
          onMouseEnter={scrambleTitle}
          title={t("sidebar.title")}
        >
          {titleText || " "}
        </span>
      </div>

      <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
        {allItems.map((item) => {
          const isActive = location === item.path
          const isConfig = configPaths.has(item.path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition",
                isConfig && "border-border ml-2 border-l pl-4",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">{item.icon}</span>
              <span className="whitespace-nowrap">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0">
        <QuickControls onPrefs={onPrefs} prefsSide="bottom" />
      </div>
    </div>
  )
}

export default TopTabNavigation
