/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ThreeColumnLayoutProps {
  filter: ReactNode;
  content: ReactNode;
  detail: ReactNode;
  filterOpen: boolean;
  detailOpen: boolean;
  onCloseDetail?: () => void;
}

export function ThreeColumnLayout({
  filter,
  content,
  detail,
  filterOpen,
  detailOpen,
  onCloseDetail,
}: ThreeColumnLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0 gap-3 overflow-x-hidden">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-200",
          filterOpen ? "w-[240px]" : "w-0"
        )}
      >
        <div className={cn("w-full h-full", !filterOpen && "invisible")}>
          {filter}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col relative">
        {content}
        <div
          className={cn(
            "absolute inset-0 z-20 transition-opacity duration-200",
            detailOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
          onClick={onCloseDetail}
        >
          <div className="absolute inset-0 bg-black/20 rounded-xl" />
        </div>
      </div>

      <div
        className={cn(
          "shrink-0 w-[320px] ml-[-320px] overflow-hidden transition-transform duration-200 ease-out",
          detailOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {detail}
      </div>
    </div>
  );
}
