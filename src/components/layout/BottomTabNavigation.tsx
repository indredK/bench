/**
 * Layout UI / 布局 UI: bottom dock navigation (display form 3).
 *
 * Renders the same feature tree as a bottom dock of tabs, with a prefs gear at
 * the end. The feature data is unchanged — only the rendering position differs.
 */
import { useMemo } from "react"
import { useLocation, Link } from "wouter"
import { useTranslation } from "react-i18next"
import { Settings } from "lucide-react"
import type { NavigationItem } from "@/features/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface BottomTabNavigationProps {
  items: NavigationItem[]
  configItems?: NavigationItem[]
  onPrefs?: () => void
}

export function BottomTabNavigation({ items, configItems, onPrefs }: BottomTabNavigationProps) {
  const { t } = useTranslation()
  const [location] = useLocation()

  const allItems = useMemo<NavigationItem[]>(
    () => [...items, ...(configItems ?? [])],
    [items, configItems],
  )

  return (
    <div className="border-border bg-background flex shrink-0 items-center justify-center gap-1.5 border-t px-4 py-2 select-none">
      {allItems.map((item) => {
        const isActive = location === item.path
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] transition",
              isActive
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span className="flex size-5 items-center justify-center">{item.icon}</span>
            <span className="whitespace-nowrap">{item.name}</span>
          </Link>
        )
      })}

      {onPrefs && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrefs}
              aria-label={t("sidebar.preferences")}
              className="ml-1"
            >
              <Settings size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{t("sidebar.preferences")}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export default BottomTabNavigation
