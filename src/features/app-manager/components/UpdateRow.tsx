/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { AppInfo, UpdateInfo } from "@/lib/tauri/types/app-manager"
import { AppIcon } from "@/features/app-manager/components/AppIcon"
import type { OperationStatus } from "@/features/app-manager/model/operations"
import {
  formatBytes,
  getUpdateActionKey,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info"

interface UpdateRowProps {
  update: UpdateInfo
  app: AppInfo | undefined
  selected: boolean
  isActive: boolean
  operationStatus: OperationStatus | undefined
  onToggleSelect: () => void
  onClickRow: () => void
  onAction: () => void
}

export function UpdateRow({
  update,
  app,
  selected,
  isActive,
  operationStatus,
  onToggleSelect,
  onClickRow,
  onAction,
}: UpdateRowProps) {
  const { t } = useTranslation()
  const running = operationStatus === "running"
  const actionLabel = t(getUpdateActionKey(update.source))
  const sizeLabel = formatBytes(update.size)

  return (
    <div
      className={cn(
        "group hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md border border-transparent py-2",
        isActive && "border-primary/40 bg-muted/40",
        running && "opacity-80",
      )}
      onClick={onClickRow}
    >
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer rounded"
        checked={selected}
        onChange={(event) => {
          event.stopPropagation()
          onToggleSelect()
        }}
        onClick={(event) => event.stopPropagation()}
        aria-label={update.appName}
      />

      <AppIcon
        iconBase64={null}
        installPath={app?.installPath}
        size={28}
        className="shrink-0 rounded"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{update.appName}</span>
          <Badge variant="secondary" className="shrink-0">
            {getUpdateSourceLabel(t, update.source)}
          </Badge>
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs tabular-nums">
          <span>{update.currentVersion || "—"}</span>
          <ArrowRight size={12} className="text-green-500" />
          <span className="text-green-600 dark:text-green-400">{update.latestVersion}</span>
          {sizeLabel !== "—" && <span>· {sizeLabel}</span>}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation()
          onAction()
        }}
        disabled={running}
        className="shrink-0"
      >
        {running ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            {t("appManager.softwareUpdate.action.queued")}
          </>
        ) : (
          actionLabel
        )}
      </Button>
    </div>
  )
}
