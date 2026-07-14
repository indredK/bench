/**
 * Station column / 站点栏: list of relay stations with reorder + toolbar.
 */
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  Check,
  Copy,
  Download,
  Import,
  Inbox,
  Link2,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { SortableList, useSortableCard, DragHandle } from "@/components/ui/sortable-card"
import type { RelayStation } from "@/lib/tauri/types/account-manager"
import { ColumnHeader, EmptyHint } from "@/features/account-manager/components/shared"

export function StationColumn({
  stations,
  selectedId,
  countByStation,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  reorderDisabled,
  onRefreshAll,
  refreshingAll,
  onImportData,
  onExportData,
  importingData,
  exportingData,
  onQuickLogin,
  onExternalLogin,
  quickLoginDisabledReason,
  externalLoginDisabledReason,
}: {
  stations: RelayStation[]
  selectedId: string
  countByStation: Record<string, number>
  onSelect: (id: string) => void
  onAdd: () => void
  onEdit: (station: RelayStation) => void
  onDelete: (station: RelayStation) => void
  onReorder: (orderedIds: string[]) => void
  reorderDisabled: boolean
  onRefreshAll: () => void
  refreshingAll: boolean
  onImportData: () => void
  onExportData: () => void
  importingData: boolean
  exportingData: boolean
  onQuickLogin: () => void
  onExternalLogin?: () => void
  quickLoginDisabledReason?: string
  externalLoginDisabledReason?: string
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const renderCard = (station: RelayStation, dragging: boolean) => (
    <StationCardContent
      station={station}
      active={station.id === selectedId}
      count={countByStation[station.id] ?? 0}
      dragging={dragging}
      onSelect={onSelect}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )
  return (
    <section className="bg-card flex w-[320px] shrink-0 flex-col rounded-lg border">
      <ColumnHeader
        title={`${t("accountManager.stationTitle")} (${stations.length})`}
        action={
          <div className="flex items-center gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={onRefreshAll}
                    disabled={refreshingAll}
                    aria-label={t("accountManager.refreshAll")}
                  >
                    <RefreshCw className={refreshingAll ? "animate-spin" : undefined} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("accountManager.refreshAll")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button size="sm" onClick={onAdd}>
              <Plus />
              {t("accountManager.addStation")}
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {stations.length === 0 ? (
          <EmptyHint
            icon={<Inbox className="size-7 opacity-40" />}
            text={t("accountManager.noStation")}
          />
        ) : (
          <SortableList
            items={stations}
            disabled={reorderDisabled || stations.length < 2}
            onReorder={onReorder}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            renderItem={(station) => (
              <SortableStationItem
                key={station.id}
                station={station}
                disabled={reorderDisabled || stations.length < 2}
                render={renderCard}
              />
            )}
            renderOverlay={(station) => (
              <div className="bg-card rounded-lg border shadow-xl">{renderCard(station, true)}</div>
            )}
          />
        )}
      </div>
      <div className="flex items-center border-t px-3 py-3">
        <div className="flex items-center gap-1.5">
          {onQuickLogin && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="icon-sm"
                      onClick={onQuickLogin}
                      disabled={Boolean(quickLoginDisabledReason)}
                      aria-label={t("accountManager.sessionManager.quickLogin.title")}
                    >
                      <LogIn size={14} />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {quickLoginDisabledReason ?? t("accountManager.sessionManager.quickLogin.title")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onExternalLogin && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onExternalLogin}
                      disabled={Boolean(externalLoginDisabledReason)}
                    >
                      <Link2 className="size-3.5" />
                      {t("accountManager.proxyPaste.button")}
                    </Button>
                  </span>
                </TooltipTrigger>
                {externalLoginDisabledReason && (
                  <TooltipContent side="top">{externalLoginDisabledReason}</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={onImportData}
                  disabled={importingData}
                  aria-label={t("accountManager.importData")}
                >
                  <Import className={importingData ? "animate-pulse" : undefined} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.importData")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={onExportData}
                  disabled={exportingData}
                  aria-label={t("accountManager.exportData")}
                >
                  <Download className={exportingData ? "animate-pulse" : undefined} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.exportData")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </section>
  )
}

function SortableStationItem({
  station,
  disabled,
  render,
}: {
  station: RelayStation
  disabled: boolean
  render: (station: RelayStation, dragging: boolean) => ReactNode
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps, isDragging } = useSortableCard(station.id, disabled)
  return (
    <StationCardShell
      ref={setNodeRef}
      style={style}
      isDragging={isDragging}
      handle={
        <DragHandle
          label={t("accountManager.reorder.dragHandle")}
          disabled={disabled}
          handleProps={handleProps}
          className="absolute inset-y-0 left-0 z-10 w-4"
        />
      }
      content={render(station, false)}
    />
  )
}

const StationCardShell = ({
  ref,
  style,
  isDragging,
  handle,
  content,
}: {
  ref: (node: HTMLElement | null) => void
  style: React.CSSProperties
  isDragging: boolean
  handle: ReactNode
  content: ReactNode
}) => (
  <div ref={ref} style={style} className={cn("relative", isDragging && "z-10")}>
    {handle}
    {content}
  </div>
)

function StationCardContent({
  station,
  active,
  count,
  dragging,
  onSelect,
  onEdit,
  onDelete,
}: {
  station: RelayStation
  active: boolean
  count: number
  dragging: boolean
  onSelect: (id: string) => void
  onEdit: (station: RelayStation) => void
  onDelete: (station: RelayStation) => void
}) {
  const { t } = useTranslation()
  const [remarkCopied, setRemarkCopied] = useState(false)
  const handleCopyRemark = (event: React.MouseEvent) => {
    event.stopPropagation()
    navigator.clipboard
      .writeText(station.remark)
      .then(() => {
        setRemarkCopied(true)
        toast.success(t("accountManager.toasts.copySuccess"))
        window.setTimeout(() => setRemarkCopied(false), 1200)
      })
      .catch(() => {
        toast.error(t("accountManager.toasts.copyFailed"))
      })
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(station.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(station.id)
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer rounded-lg border px-3 py-3 text-left transition",
        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        dragging && "shadow-xl",
      )}
    >
      <span className="absolute -top-2 -right-2">
        <Badge
          variant="secondary"
          className="flex size-5 items-center justify-center rounded-full p-0 text-[10px] leading-none"
        >
          {count}
        </Badge>
      </span>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold">{station.remark}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopyRemark}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={t("accountManager.detail.copy")}
                >
                  {remarkCopied ? <Check size={12} /> : <Copy size={12} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.detail.copy")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(station)
                  }}
                  aria-label={t("accountManager.editStation")}
                  className="hover:bg-muted/50 cursor-pointer rounded-md"
                >
                  <Pencil size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.editStation")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(station)
                  }}
                  aria-label={t("accountManager.deleteStation")}
                  className="hover:bg-muted/50 cursor-pointer rounded-md"
                >
                  <Trash2 size={13} className="text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.deleteStation")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <p className="text-muted-foreground mt-1 truncate text-xs">{station.website}</p>
    </div>
  )
}
