/**
 * Page Header / 页面标题栏: 所有模块页顶部统一的一行（标题 + 副标题 | 页内导航 | 操作）.
 *
 * 约定（对齐 docs/how-to/ux-standards.md §1）：
 * - 固定 `h-12`，底边线与侧栏品牌区的分隔线对齐，切换页面时标题栏不跳动。
 * - 标题/副标题永远在最左，单行省略并带 `title`；页内导航紧随其后；操作按钮靠右、统一 `size="sm"`。
 * - 页面主体用 `PageBody`：只有它滚动，标题栏永远可见。
 */
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface PageNavItem<T extends string = string> {
  id: T
  label: string
  icon?: ReactNode
  /** 右上角计数/提示（如「可更新 2」）；0 / undefined 不显示。 */
  badge?: number
}

export function PageHeader({
  title,
  subtitle,
  nav,
  actions,
  className,
}: {
  title: string
  subtitle?: string
  /** 页内导航，传 `<PageTabs />`。 */
  nav?: ReactNode
  /** 右侧操作区。 */
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex h-12 shrink-0 items-center gap-4 border-b", className)}>
      <div className={cn("min-w-0", nav ? "max-w-[16rem] shrink-0" : "flex-1")}>
        <h1 className="truncate text-base leading-tight font-semibold" title={title}>
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground truncate text-xs leading-tight" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {nav ? <div className="flex h-full min-w-0 flex-1 items-stretch">{nav}</div> : null}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** 标题栏内的页内导航：下划线 Tab，选中项底线压住标题栏的分隔线。 */
export function PageTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: PageNavItem<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex h-full min-w-0 items-stretch gap-1 overflow-x-auto"
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-medium whitespace-nowrap transition-colors",
              active
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
            )}
          >
            {item.icon}
            {item.label}
            {item.badge ? (
              <span className="bg-primary text-primary-foreground inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold">
                {item.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** 页面骨架：标题栏固定，主体占满剩余高度。 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>{children}</div>
}

/** 页面主体：唯一的滚动容器；内容放得下时不出现滚动条。 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>{children}</div>
}
