/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { type ReactNode } from "react";
import { PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterPanelProps {
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
  activeFilterCount?: number;
  title?: string;
}

export function FilterPanel({
  children,
  open,
  onToggle,
  activeFilterCount: _activeFilterCount = 0,
  title,
}: FilterPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/50 flex flex-col transition-all duration-200 overflow-hidden w-full",
        open ? "h-full" : "h-auto"
      )}
    >
      {open ? (
        <>
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
            <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              {title ?? "Filters"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onToggle}
            >
              <PanelRightClose size={14} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
