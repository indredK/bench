/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ProcessChildrenPage, ProcessNode } from "@/lib/tauri/types"

export interface ProcessTreeViewProps {
  node: ProcessNode
  depth: number
  targetPids: readonly number[]
  ancestorPids?: readonly number[]
  cycleTruncated?: boolean
  loadChildren: (
    node: Pick<ProcessNode, "pid" | "ppid" | "name" | "identity">,
    afterPid: number | null,
  ) => Promise<ProcessChildrenPage>
}

const CHILD_PAGE_SIZE = 100

export function ProcessTreeView({
  node,
  depth,
  targetPids,
  ancestorPids = [],
  cycleTruncated = false,
  loadChildren,
}: ProcessTreeViewProps) {
  const { t } = useTranslation()
  const isTarget = targetPids.includes(node.pid)
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(node.children)
  const [hasChildren, setHasChildren] = useState(node.has_children && !cycleTruncated)
  const [nextAfterPid, setNextAfterPid] = useState<number | null>(null)
  const [hasMoreChildren, setHasMoreChildren] = useState(node.has_children)
  const [hasLoadedChildrenPage, setHasLoadedChildrenPage] = useState(false)
  const [loadingChildren, setLoadingChildren] = useState(false)
  const [childrenError, setChildrenError] = useState(false)
  const requestVersion = useRef(0)
  useEffect(() => {
    requestVersion.current += 1
    setExpanded(false)
    setChildren(node.children)
    setHasChildren(node.has_children && !cycleTruncated)
    setNextAfterPid(null)
    setHasMoreChildren(node.has_children)
    setHasLoadedChildrenPage(false)
    setLoadingChildren(false)
    setChildrenError(false)
    return () => {
      requestVersion.current += 1
    }
  }, [node, cycleTruncated])

  const loadPage = async (afterPid: number | null, replace: boolean) => {
    const version = ++requestVersion.current
    setLoadingChildren(true)
    setChildrenError(false)
    try {
      const page = await loadChildren(node, afterPid)
      if (version !== requestVersion.current) return
      if (page.parent_pid !== node.pid) throw new Error("Mismatched process tree response")

      if (replace && page.children.length === 0 && page.next_after_pid === null) {
        setHasChildren(false)
      }
      setHasLoadedChildrenPage(true)
      setChildren((current) => {
        const currentByPid = new Map(current.map((child) => [child.pid, child]))
        const incoming = page.children.map((child) => {
          const cached = currentByPid.get(child.pid)
          const sameProcess = Boolean(
            cached &&
            (cached.identity && child.identity
              ? cached.identity === child.identity
              : !cached.identity &&
                !child.identity &&
                cached.name === child.name &&
                cached.ppid === child.ppid),
          )
          return {
            ...child,
            identity:
              targetPids.includes(child.pid) && cached
                ? cached.identity
                : sameProcess
                  ? (cached?.identity ?? child.identity)
                  : child.identity,
            children: sameProcess && cached ? cached.children : child.children,
          }
        })
        if (replace) return incoming

        const merged = new Map(current.map((child) => [child.pid, child]))
        for (const child of incoming) merged.set(child.pid, child)
        return [...merged.values()].sort((left, right) => left.pid - right.pid)
      })
      setNextAfterPid(page.next_after_pid)
      setHasMoreChildren(page.next_after_pid !== null)
    } catch {
      if (version === requestVersion.current) setChildrenError(true)
    } finally {
      if (version === requestVersion.current) setLoadingChildren(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setExpanded(open)
    if (open && !hasLoadedChildrenPage && hasMoreChildren && !loadingChildren) {
      void loadPage(null, true)
    }
  }

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
      {cycleTruncated && (
        <span className="text-muted-foreground text-[11px]">
          {t("portManager.processTreeCycleTruncated")}
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
      <Collapsible open={expanded} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger className="w-full cursor-pointer">{nodeContent}</CollapsibleTrigger>
        <CollapsibleContent>
          {children.map((child) => {
            const childAncestors = [...ancestorPids, node.pid]
            const cycleTruncated = childAncestors.includes(child.pid)
            return (
              <ProcessTreeView
                key={child.pid}
                node={child}
                depth={depth + 1}
                targetPids={targetPids}
                ancestorPids={childAncestors}
                cycleTruncated={cycleTruncated}
                loadChildren={loadChildren}
              />
            )
          })}
          {loadingChildren && (
            <div
              role="status"
              aria-live="polite"
              className="text-muted-foreground px-3 py-1 text-xs"
            >
              {t("portManager.loadingProcessChildren")}
            </div>
          )}
          {childrenError && (
            <div
              role="alert"
              className="text-destructive flex items-center gap-2 px-3 py-1 text-xs"
            >
              <span>{t("portManager.processTreeLoadFailed")}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingChildren}
                onClick={() => void loadPage(nextAfterPid, !hasLoadedChildrenPage)}
              >
                {t("common.retry")}
              </Button>
            </div>
          )}
          {hasMoreChildren && !loadingChildren && !childrenError && (
            <div className="flex justify-center py-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void loadPage(nextAfterPid, false)}
                aria-label={t("portManager.loadMoreProcessChildren", { count: CHILD_PAGE_SIZE })}
              >
                {t("portManager.loadMoreProcessChildren", { count: CHILD_PAGE_SIZE })}
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
