/**
 * Primitive UI / 基础 UI: render primitives only; 只提供基础组件.
 */
import { type ReactNode } from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ToolbarButtonProps {
  /** Icon element to display inside the button */
  icon: ReactNode
  /** Tooltip label shown on hover */
  tooltip: string
  /** Click handler */
  onClick: () => void
  /** Active state: `true` = full highlight (panel open), "half" = filter applied but panel collapsed, false = idle. */
  active?: boolean | "half"
  /** Disables the button */
  disabled?: boolean
  /** Additional class names */
  className?: string
}

/**
 * A compact icon-only button with a tooltip, designed for toolbar/action-bar use.
 * Highlights with the "default" variant when `active` is true; a faint accent tint
 * when `active` is "half" (indicates an active filter while the panel is collapsed).
 */
export function ToolbarButton({
  icon,
  tooltip,
  onClick,
  active = false,
  disabled = false,
  className,
}: ToolbarButtonProps) {
  const isFull = active === true
  const isHalf = active === "half"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isFull ? "default" : "ghost"}
          size="icon"
          className={cn(
            "h-8 w-8",
            isHalf && "bg-primary/15 text-primary hover:bg-primary/25",
            className,
          )}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
