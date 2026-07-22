/**
 * Feature UI / 功能界面: fixed toolbar + independently scrolling body for probe panels.
 */
import type { ReactNode } from "react"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { cn } from "@/lib/utils"

interface ProbePanelShellProps {
  toolbar: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Nest inside a parent scroller (e.g. offline hub) — no flex-fill / nested scroll. */
  embedded?: boolean
}

export function ProbePanelShell({
  toolbar,
  children,
  footer,
  className,
  embedded = false,
}: ProbePanelShellProps) {
  if (embedded) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="space-y-3">{toolbar}</div>
        <div className="space-y-3">{children}</div>
        {footer}
      </div>
    )
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-hidden", className)}>
      <div className="shrink-0 space-y-3">{toolbar}</div>
      <ScrollableArea
        wrapperClassName="flex min-h-0 min-w-0 flex-1"
        className="min-h-0 flex-1 pr-1 pb-1"
        showBottomDot={false}
      >
        <div className="space-y-3">{children}</div>
      </ScrollableArea>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  )
}
