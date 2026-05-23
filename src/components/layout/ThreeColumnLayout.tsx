/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface ThreeColumnLayoutProps {
  filter: ReactNode;
  content: ReactNode;
  detail: ReactNode;
  filterOpen: boolean;
  detailOpen: boolean;
  showDetailOverlay?: boolean;
  onCloseDetail?: () => void;
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
    <div className="relative flex h-full flex-1 min-h-0 overflow-hidden">
      <motion.div
        initial={false}
        animate={{
          width: filterOpen ? 240 : 0,
          marginRight: filterOpen ? 12 : 0,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.7 }}
        className="shrink-0 overflow-hidden"
      >
        <div className="w-[240px] h-full">{filter}</div>
      </motion.div>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {content}
      </div>

      <div
        className={cn(
          "absolute inset-y-0 right-0 z-[80] w-[320px] overflow-hidden transition-transform duration-200 ease-out",
          detailOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {detail}
      </div>

      {showDetailOverlay && (
        <div
          className={cn(
            "absolute inset-0 z-[70] transition-opacity duration-200",
            detailOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
          onClick={onCloseDetail}
        >
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}
    </div>
  );
}
