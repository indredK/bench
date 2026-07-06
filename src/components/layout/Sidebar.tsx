/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 *
 * v2 - 重设计: 删底部 ⚙ Settings 齿轮按钮、删底部 🔄 重启按钮。
 * 只保留语言/主题快捷键。系统设置导航项用分隔线和功能列表分开。
 */
import { useLocation, Link } from "wouter"
import { motion } from "motion/react"
import type { NavigationItem } from "@/features/types"
import LanguageSwitcher from "./LanguageSwitcher"
import ThemeSwitcher from "./ThemeSwitcher"
import { useScrambleText } from "@/hooks/useScrambleText"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useReducedMotionProps } from "@/lib/motion-utils"

interface SidebarProps {
  items: NavigationItem[]
  /** Tool/config items shown below separator */
  configItems?: NavigationItem[]
  onRestart?: () => void | Promise<void>
  onPrefs?: () => void
}

function Sidebar({ items, configItems, onPrefs }: SidebarProps) {
  const { t } = useTranslation()
  const { text: titleText, start: scrambleTitle } = useScrambleText({
    target: t("sidebar.title"),
    duration: 700,
  })
  const [location] = useLocation()
  const { reduce } = useReducedMotionProps()

  return (
    <div className="border-border bg-background text-foreground flex w-[200px] shrink-0 flex-col border-r select-none">
      {/* Smaller header */}
      <div className="border-border border-b px-4 pt-4 pb-3 text-center">
        <h1
          className="cursor-default text-lg font-bold tracking-tight tabular-nums"
          onMouseEnter={scrambleTitle}
        >
          {titleText || " "}
        </h1>
        <motion.p
          initial={reduce({ opacity: 0, y: 4 })}
          animate={reduce({ opacity: 1, y: 0 })}
          transition={{ duration: 0.3, delay: 0.6, ease: "easeOut" }}
          className="text-muted-foreground mt-0.5 text-[10px]"
        >
          {t("sidebar.subtitle")}
        </motion.p>
      </div>

      {/* Feature navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {items.map((item) => {
          const isActive = location === item.path
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "mr-2 ml-6 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm leading-relaxed transition",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          )
        })}

        {/* Separator */}
        {configItems && configItems.length > 0 && (
          <div className="border-border mx-4 my-2 border-t" />
        )}

        {/* Config items (e.g. System Settings) */}
        {configItems?.map((item) => {
          const isActive = location === item.path
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "mr-2 ml-6 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm leading-relaxed transition",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom: language/theme/prefs quick switchers */}
      <div className="border-border flex items-center justify-center gap-1.5 border-t px-3 py-2">
        <LanguageSwitcher />
        <ThemeSwitcher />
        {onPrefs && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onPrefs}
                aria-label={t("sidebar.settings")}
              >
                <Settings size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t("sidebar.settings")}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export default Sidebar
