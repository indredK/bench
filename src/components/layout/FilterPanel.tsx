/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { PanelRightClose } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { useReducedMotionProps } from "@/lib/motion-utils"

interface FilterPanelProps {
  children: ReactNode
  /** Fixed region pinned below the scrollable filter content (e.g. platform capabilities). Does not scroll. */
  footer?: ReactNode
  open: boolean
  onToggle: () => void
  activeFilterCount?: number
  title?: string
}

export function FilterPanel({
  children,
  footer,
  open,
  onToggle,
  activeFilterCount: _activeFilterCount = 0,
  title,
}: FilterPanelProps) {
  const { reduce } = useReducedMotionProps()
  return (
    <div className="bg-card/50 flex h-full w-full flex-col overflow-hidden rounded-xl border">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="filter-panel-content"
            initial={reduce({ opacity: 0, x: -8 })}
            animate={reduce({ opacity: 1, x: 0 })}
            exit={reduce({ opacity: 0, x: -8 })}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex h-full min-h-0 flex-col"
          >
            <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
              <span className="text-foreground/70 text-xs font-semibold tracking-wider uppercase">
                {title}
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onToggle}>
                <PanelRightClose size={14} />
              </Button>
            </div>
            <ScrollableArea className="h-full px-4 pb-4" wrapperClassName="flex-1 min-h-0">
              {children}
            </ScrollableArea>
            {footer && <div className="bg-card shrink-0 border-t px-4 py-3">{footer}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
