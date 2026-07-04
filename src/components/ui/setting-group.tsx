/**
 * SettingGroup / 设置分组: group container; 分组容器.
 */
import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface SettingGroupProps {
  title: string
  children: ReactNode
  className?: string
  onTitleClick?: () => void
}

export function SettingGroup({ title, children, className, onTitleClick }: SettingGroupProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <h3
        className={cn(
          "text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase",
          onTitleClick && "hover:text-foreground cursor-pointer transition-colors",
        )}
        onClick={onTitleClick}
      >
        {title}
        {onTitleClick && <ExternalLink size={11} />}
      </h3>
      <div className="bg-card space-y-0 rounded-lg border p-3">{children}</div>
    </div>
  )
}
