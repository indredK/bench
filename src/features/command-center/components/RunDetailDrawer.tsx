/**
 * Run Detail Drawer / 运行详情抽屉: 单个常驻抽屉，左实时输出 / 右卡片详情；
 * 只承载一次运行。基于 Radix Sheet，Esc 与点击遮罩由原生处理，避免与编辑/确认弹窗抢层级。
 */
import { useTranslation } from "react-i18next"
import { Copy, ExternalLink, Pencil, Play, ShieldAlert, Square, Terminal } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCommandCenterStore } from "@/features/command-center/store"
import type { CardKind, CommandCard, RunResult } from "@/lib/tauri/types/command-center"
import type { RunStatus } from "@/features/command-center/store"

const KIND_ICON: Record<CardKind, typeof Terminal> = {
  shell: Terminal,
  shellAdmin: ShieldAlert,
  copy: Copy,
  open: ExternalLink,
}

function StatusDot({ status }: { status: RunStatus | undefined }) {
  const base = "size-1.5 rounded-full"
  if (status === "running") return <span className={cn(base, "animate-pulse bg-amber-500")} />
  if (status === "success") return <span className={cn(base, "bg-emerald-500")} />
  if (status === "failed") return <span className={cn(base, "bg-red-500")} />
  return null
}

function OutputBlock({ card, running }: { card: CommandCard; running: boolean }) {
  const { t } = useTranslation()
  const outcome = useCommandCenterStore((s) => s.runOutcome[card.id])
  const result: RunResult | null | undefined = outcome?.result

  if (running) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
        {t("commandCenter.result.running")}
      </div>
    )
  }
  if (!result) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {t("commandCenter.result.noOutput")}
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-xs">
        {result.success
          ? t("commandCenter.result.success")
          : t("commandCenter.result.failed", { code: result.exitCode ?? "?" })}
      </p>
      {result.stdout.trim().length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">
            {t("commandCenter.result.stdout")}
          </p>
          <pre className="overflow-auto rounded-lg bg-neutral-900 p-3.5 font-mono text-xs whitespace-pre-wrap text-neutral-100">
            {result.stdout}
          </pre>
        </div>
      )}
      {result.stderr.trim().length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">
            {t("commandCenter.result.stderr")}
          </p>
          <pre className="overflow-auto rounded-lg bg-neutral-900 p-3.5 font-mono text-xs whitespace-pre-wrap text-red-300">
            {result.stderr}
          </pre>
        </div>
      )}
      {result.stdout.trim().length === 0 && result.stderr.trim().length === 0 && (
        <p className="text-muted-foreground text-sm">{t("commandCenter.result.noOutput")}</p>
      )}
    </div>
  )
}

export function TerminateButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <Square size={13} />
      {t("commandCenter.actions.terminate")}
    </Button>
  )
}

export function RunDetailDrawer({
  card,
  runningIds,
  runStatus,
  onRun,
  onEdit,
  onTerminate,
  onOpenChange,
}: {
  card: CommandCard | null
  runningIds: Set<string>
  runStatus: Record<string, RunStatus>
  onRun: (card: CommandCard) => void
  onEdit: (card: CommandCard) => void
  onTerminate: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const open = card !== null
  const running = card ? runningIds.has(card.id) : false
  const Icon = card ? KIND_ICON[card.kind] : Terminal

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[calc(100vw-2rem)] max-w-none min-w-[360px] flex-col gap-0 sm:w-[50vw]">
        {card && (
          <>
            <div className="flex items-start gap-2 border-b pb-3">
              <span className="bg-muted/60 text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                <Icon size={16} className="opacity-80" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <SheetTitle className="truncate">{card.title}</SheetTitle>
                  <StatusDot status={runStatus[card.id]} />
                </div>
                {card.description && (
                  <SheetDescription className="line-clamp-1">{card.description}</SheetDescription>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-0">
              {/* 上：实时运行输出 */}
              <div className="flex min-h-0 flex-1 flex-col border-b p-4">
                <p className="text-muted-foreground mb-2 shrink-0 text-xs font-medium">
                  {t("commandCenter.result.output")}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <OutputBlock card={card} running={running} />
                </div>
              </div>
              {/* 下：卡片详情 + 操作（命令区最多占抽屉高度一半，超出则内部滚动） */}
              <div className="flex max-h-1/2 min-h-0 shrink-0 flex-col overflow-y-auto p-4">
                <p className="text-muted-foreground mb-1 shrink-0 text-xs font-medium">
                  {t("commandCenter.editor.command." + card.kind)}
                </p>
                <pre className="bg-muted mt-1 overflow-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
                  {card.command}
                </pre>
                <div className="flex items-center gap-2 pt-3">
                  {running ? (
                    <TerminateButton onClick={onTerminate} />
                  ) : (
                    <Button size="sm" onClick={() => onRun(card)}>
                      {card.kind === "copy" ? <Copy size={14} /> : <Play size={14} />}
                      {card.kind === "copy"
                        ? t("commandCenter.actions.copy")
                        : t("commandCenter.actions.run")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onEdit(card)}>
                    <Pencil size={14} />
                    {t("common.edit")}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
