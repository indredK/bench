/**
 * L2 Nav / 二级导航底栏: 当前 L1 下的探测项切换；只做渲染.
 */
import { useTranslation } from "react-i18next"
import { POST_L2 } from "@/features/network-probe/probe-catalog"
import { cn } from "@/lib/utils"

export function ProbeL2Nav({
  items,
  active,
  onSelect,
}: {
  items: string[]
  active: string
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <nav
      className="bg-background flex h-11 shrink-0 items-center gap-2 border-t px-3"
      aria-label={t("networkProbe.nav.l2")}
    >
      <span className="text-muted-foreground shrink-0 border-r pr-2 text-[10px] font-bold tracking-wider uppercase">
        {t("networkProbe.nav.l2Short")}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {items.map((id) => (
          <button
            key={id}
            type="button"
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
              active === id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => onSelect(id)}
          >
            {t(`networkProbe.l2.${id}`)}
            {POST_L2.has(id) ? (
              <span className="text-muted-foreground ml-1 text-[10px]">
                {t("networkProbe.badge.post")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  )
}
