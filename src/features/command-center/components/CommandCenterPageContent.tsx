/**
 * Page Content / 页面内容: render card grid & toolbar; 只做渲染.
 *
 * v2 重设计：
 *  - 紧凑网格（信息分层：图标+标题 ／ 类型徽章 ／ 命令预览 ／ 行内操作）。
 *  - Hover 卡片：若该卡已有运行结果（运行中或已完成），浮层显示实时输出，
 *    无运行结果时 hover 无任何效果。
 *  - 点击卡片：放大进入「聚焦」态——左栏实时运行输出、右栏卡片详情，
 *    运行中持续打印；运行结束不自动退出，Esc 或点击遮罩复位。
 *  - 点击只查详情时不触发运行；运行需显式点运行按钮。
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Terminal, Trash2 } from "lucide-react"
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  Plus,
  ShieldAlert,
  Upload,
  XCircle,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCommandCenterStore } from "@/features/command-center/store"
import { TerminateButton } from "@/features/command-center/components/RunDetailDrawer"
import type { CardKind, CommandCard } from "@/lib/tauri/types/command-center"
import type { RunStatus } from "@/features/command-center/store"

const KIND_ICON: Record<CardKind, typeof Terminal> = {
  shell: Terminal,
  shellAdmin: ShieldAlert,
  copy: Copy,
  open: ExternalLink,
}

function statusClasses(status: RunStatus | undefined): string {
  switch (status) {
    case "success":
      return "border-emerald-500/40 bg-emerald-500/5"
    case "failed":
      return "border-red-500/40 bg-red-500/5"
    case "running":
      return "border-amber-500/40 bg-amber-500/5"
    default:
      return ""
  }
}

function StatusDot({ status }: { status: RunStatus | undefined }) {
  const base = "size-1.5 rounded-full"
  if (status === "running") return <span className={cn(base, "animate-pulse bg-amber-500")} />
  if (status === "success") return <span className={cn(base, "bg-emerald-500")} />
  if (status === "failed") return <span className={cn(base, "bg-red-500")} />
  return null
}

// 订阅单卡运行结果（避免整列表因任意卡更新而重渲染）
function CommandCardTile({
  card,
  running,
  onRun,
  onEdit,
  onDelete,
  onExpand,
  onTerminate,
  peekable,
  dragDisabled,
}: {
  card: CommandCard
  running: boolean
  onRun: (card: CommandCard) => void
  onEdit: (card: CommandCard) => void
  onDelete: (card: CommandCard) => void
  onExpand: (card: CommandCard) => void
  onTerminate: () => void
  peekable: boolean
  dragDisabled?: boolean
}) {
  const { t } = useTranslation()
  const Icon = KIND_ICON[card.kind]
  const status = useCommandCenterStore((s) => s.runStatus[card.id]) ?? "idle"
  const outcome = useCommandCenterStore((s) => s.runOutcome[card.id])
  const builtin = card.id.startsWith("builtin-")
  // 用户手动关闭某卡的运行输出浮层后,本次 hover 不再自动弹出
  const [peekHidden, setPeekHidden] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: dragDisabled,
  })
  const dragStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={dragStyle}
      layout={false}
      className={cn(
        "group bg-card hover:border-primary/40 relative flex min-h-[148px] cursor-pointer flex-col rounded-xl border p-3 transition-colors hover:shadow-sm",
        builtin && "border-primary/40 ring-primary/20 ring-1",
        statusClasses(status),
      )}
      onClick={() => onExpand(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onExpand(card)
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* 头部：拖拽手柄 + 图标 + 标题 + 徽章 */}
      <div className="flex items-start gap-2">
        <span
          {...attributes}
          {...listeners}
          role="button"
          aria-label={t("commandCenter.reorder")}
          title={t("commandCenter.reorder")}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground/40 hover:text-muted-foreground mt-0.5 -ml-1 inline-flex shrink-0 cursor-grab touch-none items-center justify-center transition active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </span>
        <span className="bg-muted/60 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
          <Icon size={15} className="opacity-80" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium">{card.title}</h3>
            <StatusDot status={status} />
          </div>
          {card.description && (
            <p className="text-muted-foreground line-clamp-1 text-xs">{card.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {builtin && (
            <Badge variant="default" className="text-[10px]">
              {t("commandCenter.builtin")}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {t(`commandCenter.kind.${card.kind}`)}
          </Badge>
        </div>
      </div>

      {/* 命令预览 */}
      <pre className="text-muted-foreground bg-muted/40 mt-2 line-clamp-3 flex-1 overflow-hidden rounded-md p-2 font-mono text-[11px] leading-snug">
        {card.command}
      </pre>

      {/* 行内操作（始终位于浮层之上，保证可点击） */}
      <div
        className="relative z-30 mt-2 flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {running ? (
          <TerminateButton onClick={() => onTerminate()} />
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => {
              setPeekHidden(false)
              onRun(card)
            }}
          >
            {card.kind === "copy" ? <Copy size={13} /> : <Play size={13} />}
            {card.kind === "copy"
              ? t("commandCenter.actions.copy")
              : t("commandCenter.actions.run")}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7"
            onClick={() => onEdit(card)}
            title={t("common.edit")}
          >
            <Pencil size={13} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive size-7"
            onClick={() => onDelete(card)}
            title={t("common.delete")}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Hover 浮层：仅当已有运行结果（含运行中）时显示实时输出，
          覆盖命令预览区，不遮挡底部操作栏；可手动关闭 */}
      <AnimatePresence>
        {peekable && outcome && !peekHidden && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="border-border bg-popover/95 absolute inset-x-2 top-2 bottom-2 z-20 rounded-lg border p-2 shadow-lg backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium">
              {status === "running" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : status === "success" ? (
                <CheckCircle2 size={11} className="text-emerald-500" />
              ) : status === "failed" ? (
                <XCircle size={11} className="text-red-500" />
              ) : null}
              <span className="text-muted-foreground">{t("commandCenter.result.output")}</span>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setPeekHidden(true)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded p-0.5 transition"
              >
                <XCircle size={12} />
              </button>
            </div>
            <pre className="max-h-20 overflow-auto rounded-md bg-neutral-900 p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap text-neutral-100">
              {outcome.result?.stdout ||
                outcome.result?.stderr ||
                t("commandCenter.result.noOutput")}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function CommandCenterPageContent({
  cards,
  loading,
  error,
  runningIds,
  onAdd,
  onEdit,
  onRun,
  onDelete,
  onExpand,
  onTerminate,
  onExport,
  onImport,
  ioBusy,
  onReorder,
  onDismissError,
  hasResult,
}: {
  cards: CommandCard[]
  loading: boolean
  error: string
  runningIds: Set<string>
  onAdd: () => void
  onEdit: (card: CommandCard) => void
  onRun: (card: CommandCard) => void
  onDelete: (card: CommandCard) => void
  onExpand: (card: CommandCard) => void
  onTerminate: () => void
  onExport: () => void
  onImport: () => void
  ioBusy: "export" | "import" | null
  onReorder: (orderedIds: string[]) => void
  onDismissError: () => void
  hasResult: (id: string) => boolean
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = cards.map((c) => c.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = ids.slice()
    next.splice(from, 1)
    next.splice(to, 0, String(active.id))
    onReorder(next)
  }

  const activeCard = activeId ? (cards.find((c) => c.id === activeId) ?? null) : null

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("commandCenter.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("commandCenter.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onImport} disabled={ioBusy !== null}>
            {ioBusy === "import" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {t("commandCenter.io.import")}
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} disabled={ioBusy !== null}>
            {ioBusy === "export" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {t("commandCenter.io.export")}
          </Button>
          <Button onClick={onAdd}>
            <Plus size={16} />
            {t("commandCenter.addCard")}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="flex items-center">
          <AlertDescription className="flex-1">{error}</AlertDescription>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onDismissError}
            className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive ml-auto shrink-0 rounded p-0.5 transition"
          >
            <XCircle size={14} />
          </button>
        </Alert>
      )}

      {loading && cards.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 size={16} className="animate-spin" />
          {t("common.loading")}
        </div>
      ) : cards.length === 0 ? (
        <div className="border-border text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Terminal size={32} className="opacity-40" />
          <p className="text-sm">{t("commandCenter.empty")}</p>
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus size={16} />
            {t("commandCenter.addCard")}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map((card) => (
                <CommandCardTile
                  key={card.id}
                  card={card}
                  running={runningIds.has(card.id)}
                  onRun={onRun}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onExpand={onExpand}
                  onTerminate={onTerminate}
                  peekable={hasResult(card.id)}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeCard ? (
              <div className="border-primary/40 bg-card ring-primary/20 flex min-h-[148px] flex-col rounded-xl border p-3 opacity-90 shadow-lg ring-1">
                <div className="flex items-start gap-2">
                  <span className="bg-muted/60 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
                    {(() => {
                      const Icon = KIND_ICON[activeCard.kind]
                      return <Icon size={15} className="opacity-80" />
                    })()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{activeCard.title}</h3>
                  </div>
                </div>
                <pre className="text-muted-foreground bg-muted/40 mt-2 line-clamp-3 flex-1 overflow-hidden rounded-md p-2 font-mono text-[11px] leading-snug">
                  {activeCard.command}
                </pre>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
