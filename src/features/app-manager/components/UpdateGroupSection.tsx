/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useReducedMotionProps } from "@/lib/motion-utils"
import type { AppInfo, UpdateInfo, UpdateSource } from "@/lib/tauri/types/app-manager"
import type { OperationStatus } from "@/features/app-manager/model/operations"
import { UpdateRow } from "@/features/app-manager/components/UpdateRow"
import {
  getUpdateGroupActionKey,
  getUpdateSourceIcon,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info"

interface UpdateGroupSectionProps {
  t: TFunction
  source: UpdateSource
  updates: UpdateInfo[]
  expanded: boolean
  appLookup: Map<string, AppInfo>
  selectedIds: Set<string>
  activeUpdate: UpdateInfo | null
  updateOperations: Record<string, { status: OperationStatus; message: string }>
  onToggleExpanded: () => void
  onToggleSelect: (appId: string) => void
  onRowClick: (update: UpdateInfo) => void
  onRowAction: (update: UpdateInfo) => void
  onSourceAction: (source: UpdateSource, updates: UpdateInfo[]) => void
}

export function UpdateGroupSection({
  t,
  source,
  updates,
  expanded,
  appLookup,
  selectedIds,
  activeUpdate,
  updateOperations,
  onToggleExpanded,
  onToggleSelect,
  onRowClick,
  onRowAction,
  onSourceAction,
}: UpdateGroupSectionProps) {
  const groupBusy = updates.some((update) => updateOperations[update.appId]?.status === "running")
  const { reduce } = useReducedMotionProps()

  return (
    <section className="bg-card relative rounded-lg border">
      <div className="bg-card/95 supports-[backdrop-filter]:bg-card/90 after:bg-border/80 relative sticky top-0 z-10 flex items-center rounded-t-lg border-b px-3 py-2 backdrop-blur after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:content-['']">
        <button
          type="button"
          className={cn(
            "flex flex-1 items-center gap-2 text-left",
            "focus-visible:ring-ring/50 rounded outline-none focus-visible:ring-2",
          )}
          onClick={onToggleExpanded}
        >
          <motion.span
            animate={reduce({ rotate: expanded ? 0 : -90 })}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="inline-flex"
          >
            <ChevronDown size={14} />
          </motion.span>
          <span className="text-base">{getUpdateSourceIcon(source)}</span>
          <span className="font-semibold">{getUpdateSourceLabel(t, source)}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("appManager.softwareUpdate.groupCount", { count: updates.length })}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-2 shrink-0"
          disabled={groupBusy || updates.length === 0}
          onClick={(event) => {
            event.stopPropagation()
            onSourceAction(source, updates)
          }}
        >
          {t(getUpdateGroupActionKey(source))}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.18, ease: "easeOut" },
            }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 px-3 py-2">
              {updates.map((update) => (
                <UpdateRow
                  key={update.appId}
                  t={t}
                  update={update}
                  app={appLookup.get(update.appId)}
                  selected={selectedIds.has(update.appId)}
                  isActive={activeUpdate?.appId === update.appId}
                  operationStatus={updateOperations[update.appId]?.status}
                  onToggleSelect={() => onToggleSelect(update.appId)}
                  onClickRow={() => onRowClick(update)}
                  onAction={() => onRowAction(update)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
