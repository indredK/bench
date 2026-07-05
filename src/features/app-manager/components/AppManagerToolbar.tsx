/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface AppManagerToolbarProps {
  searchQuery: string
  searchPlaceholder: string
  onSearchQueryChange: (query: string) => void
  searchDisabled?: boolean
  afterSearchContent?: ReactNode
  actions?: ReactNode
  rightContent?: ReactNode
  searchClassName?: string
}

export function AppManagerToolbar({
  searchQuery,
  searchPlaceholder,
  onSearchQueryChange,
  searchDisabled = false,
  afterSearchContent,
  actions,
  rightContent,
  searchClassName,
}: AppManagerToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-card shrink-0 rounded-lg border">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <div className={cn("relative max-w-md min-w-[220px] flex-1", searchClassName)}>
          <Search
            size={14}
            className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2"
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

        {afterSearchContent}

        {actions}

        <div className="flex-1" />

        {rightContent}
      </div>
    </div>
  )
}
