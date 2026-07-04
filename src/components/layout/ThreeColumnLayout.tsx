/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { type ReactNode } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

interface ThreeColumnLayoutProps {
  filter: ReactNode
  content: ReactNode
  detail: ReactNode
  filterOpen: boolean
  detailOpen: boolean
  showDetailOverlay?: boolean
  onCloseDetail?: () => void
}

export function ThreeColumnLayout({
  filter,
  content,
  detail,
  filterOpen,
  detailOpen,
  showDetailOverlay = true,
  onCloseDetail,
}: ThreeColumnLayoutProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      <motion.div
        initial={false}
        animate={{
          width: filterOpen ? 240 : 0,
          marginRight: filterOpen ? 12 : 0,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.7 }}
        className="shrink-0 overflow-hidden"
      >
        <div className="h-full w-[240px]">{filter}</div>
      </motion.div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{content}</div>

      <div
        className={cn(
          "z-drawer-panel absolute inset-y-0 right-0 w-[320px] overflow-hidden transition-transform duration-200 ease-out",
          detailOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {detail}
      </div>

      {showDetailOverlay && (
        <div
          className={cn(
            "z-drawer-overlay absolute inset-0 transition-opacity duration-200",
            detailOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={onCloseDetail}
        >
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}
    </div>
  )
}
