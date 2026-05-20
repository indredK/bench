import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ThreeColumnLayoutProps {
  filter: ReactNode;
  content: ReactNode;
  detail: ReactNode;
  filterOpen: boolean;
  detailOpen: boolean;
}

/**
 * Three-column layout using flexbox with a single source of truth for column widths.
 * Parent wrappers control widths via Tailwind classes; children use w-full internally
 * to avoid double-width-control conflicts that break the layout.
 */
export function ThreeColumnLayout({
  filter,
  content,
  detail,
  filterOpen,
  detailOpen,
}: ThreeColumnLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0 gap-3">
      {/* Filter column - parent controls width, child fills with w-full */}
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

      {/* Content column - takes remaining flex space */}
      <div className="flex-1 min-w-0 flex flex-col">
        {content}
      </div>

      {/* Detail column - parent controls width, child fills with w-full */}
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width] duration-200",
          detailOpen ? "w-[320px]" : "w-0"
        )}
      >
        <div className={cn("w-full h-full", !detailOpen && "invisible")}>
          {detail}
        </div>
      </div>
    </div>
  );
}
