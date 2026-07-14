/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { ProcessNode } from "@/lib/tauri/types"

interface ProcessTreeViewProps {
  node: ProcessNode
  depth: number
  targetPid: number
}

export function ProcessTreeView({ node, depth, targetPid }: ProcessTreeViewProps) {
  const { t } = useTranslation()
  const isTarget = node.pid === targetPid
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0

  const nodeContent = (
    <div
      className={cn(
        "flex items-center gap-2 rounded px-1 py-0.5 text-[13px] leading-[22px]",
        isTarget && "bg-primary text-primary-foreground",
      )}
      style={{ paddingLeft: 4 + depth * 24 }}
    >
      <span className="w-4 shrink-0 text-center opacity-50">
        {hasChildren ? (expanded ? "▼" : "▶") : " "}
      </span>
      <span className={cn("whitespace-nowrap", isTarget && "font-semibold")}>{node.name}</span>
      <span
        className={cn(
          "text-[11px]",
          isTarget ? "text-primary-foreground/70" : "text-muted-foreground",
        )}
      >
        {t("portManager.pid", { pid: node.pid })}
      </span>
      {isTarget && (
        <span className="rounded-[10px] bg-white/20 px-1.5 py-px text-[10px]">
          {t("portManager.portOwner")}
        </span>
      )}
      {!isTarget && node.pid === node.ppid && (
        <span className="text-muted-foreground rounded-[10px] border px-1.5 py-px text-[10px]">
          {t("portManager.rootProcess")}
        </span>
      )}
    </div>
  )

  if (!hasChildren) {
    return nodeContent
  }

  return (
    <div>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="w-full cursor-pointer">{nodeContent}</CollapsibleTrigger>
        <CollapsibleContent>
          {node.children.map((child) => (
            <ProcessTreeView key={child.pid} node={child} depth={depth + 1} targetPid={targetPid} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
