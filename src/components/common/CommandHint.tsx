/**
 * Shared UI / 共享界面: hover IPC command hint (design §3.5).
 */
import type { ReactElement, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function CommandHint({
  hint,
  children,
}: {
  hint: string
  children: ReactElement | ReactNode
}) {
  return (
    <TooltipProvider delay={280}>
      <Tooltip>
        <TooltipTrigger asChild>{children as ReactElement}</TooltipTrigger>
        <TooltipContent className="max-w-sm font-mono text-[11px] break-all">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
