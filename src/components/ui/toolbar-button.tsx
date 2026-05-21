/**
 * Primitive UI / 基础 UI: render primitives only; 只提供基础组件.
 */
import { type ReactNode } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps {
  /** Icon element to display inside the button */
  icon: ReactNode;
  /** Tooltip label shown on hover */
  tooltip: string;
  /** Click handler */
  onClick: () => void;
  /** When true, uses "default" variant to indicate active/selected state */
  active?: boolean;
  /** Disables the button */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * A compact icon-only button with a tooltip, designed for toolbar/action-bar use.
 * Highlights with the "default" variant when `active` is true.
 */
export function ToolbarButton({
  icon,
  tooltip,
  onClick,
  active = false,
  disabled = false,
  className,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "default" : "ghost"}
          size="icon"
          className={cn("h-8 w-8", className)}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
