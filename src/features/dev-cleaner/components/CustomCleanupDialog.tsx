/**
 * Custom Cleanup Dialog / 自定义清理弹窗: command selection, execution, and results.
 */
import { useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Shield,
  ShieldAlert,
  Square,
  Trash2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDevCleanerStore } from "@/features/dev-cleaner/store"
import { cn, formatSize } from "@/lib/utils"
import {
  getCustomCleanupCommands,
  executeCustomCleanup,
  stopCustomCleanup,
} from "@/lib/tauri/commands/dev-cleaner"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { listenToPlatformEvent } from "@/platform/events"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import type {
  CleanupCommandDef,
  CustomCleanupProgress,
  CustomCleanupFinalResult,
} from "@/lib/tauri/types/dev-cleaner"

export function CustomCleanupDialog() {
  const { t } = useTranslation()
  const canUsePlatform = canUseDesktopFeatures()

  const phase = useDevCleanerStore((s) => s.customCleanupPhase)
  const commands = useDevCleanerStore((s) => s.customCleanupCommands)
  const selectedIds = useDevCleanerStore((s) => s.selectedCommandIds)
  const progresses = useDevCleanerStore((s) => s.customCleanupProgresses)
  const result = useDevCleanerStore((s) => s.customCleanupResult)
  const show = useDevCleanerStore((s) => s.showCustomCleanup)

  const setShow = useDevCleanerStore((s) => s.setShowCustomCleanup)
  const setPhase = useDevCleanerStore((s) => s.setCustomCleanupPhase)
  const setCommands = useDevCleanerStore((s) => s.setCustomCleanupCommands)
  const toggleCommand = useDevCleanerStore((s) => s.toggleCustomCleanupCommand)
  const setProgresses = useDevCleanerStore((s) => s.setCustomCleanupProgresses)
  const setResult = useDevCleanerStore((s) => s.setCustomCleanupResult)
  const resetCustom = useDevCleanerStore((s) => s.resetCustomCleanup)

  const unlistenRef = useRef<(() => void) | null>(null)

  const cleanupListeners = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }
  }, [])

  const open = useCallback(async () => {
    setShow(true)
    setPhase("selecting")
    try {
      const cmds = await getCustomCleanupCommands()
      setCommands(cmds)
    } catch {
      setCommands([])
    }
  }, [setShow, setPhase, setCommands])

  const handleClose = useCallback(() => {
    cleanupListeners()
    setShow(false)
    resetCustom()
  }, [cleanupListeners, setShow, resetCustom])

  const handleStartCleanup = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    setPhase("running")
    setProgresses([])
    setResult(null)

    cleanupListeners()

    try {
      const unlistenProgress = await listenToPlatformEvent<CustomCleanupProgress>(
        TAURI_EVENTS.customCleanup.progress,
        (event) => {
          const p = event.payload
          const state = useDevCleanerStore.getState()
          const prev = state.customCleanupProgresses
          const idx = prev.findIndex((x) => x.command_id === p.command_id)
          if (idx >= 0) {
            state.updateCustomCleanupProgress(p)
          } else {
            state.setCustomCleanupProgresses([...prev, p])
          }
        },
      )
      const unlistenCompleted = await listenToPlatformEvent<CustomCleanupFinalResult>(
        TAURI_EVENTS.customCleanup.completed,
        (event) => {
          setResult(event.payload)
          setPhase("completed")
        },
      )
      unlistenRef.current = () => {
        unlistenProgress()
        unlistenCompleted()
      }

      const finalResult = await executeCustomCleanup(ids)
      setResult(finalResult)
      setPhase("completed")
    } catch {
      setPhase("completed")
      setResult({
        success: false,
        total_freed_bytes: 0,
        commands_executed: 0,
        commands_failed: 0,
        details: [],
        aborted: false,
      })
    }
  }, [selectedIds, setPhase, setProgresses, setResult, cleanupListeners])

  const handleStop = useCallback(async () => {
    try {
      await stopCustomCleanup()
    } catch {
      // best-effort
    }
  }, [])

  const selectedCount = selectedIds.size

  if (!show) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={open}
        disabled={!canUsePlatform}
        className="shrink-0"
      >
        <Shield size={16} className="mr-1" />
        <span className="hidden sm:inline">{t("devCleaner.customCleanup.button")}</span>
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden">
        <CardHeader className="flex shrink-0 flex-row items-center justify-between border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield size={20} />
            {t("devCleaner.customCleanup.title")}
          </CardTitle>
          {phase !== "running" && phase !== "paused" && (
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <XCircle size={20} />
            </Button>
          )}
        </CardHeader>

        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {(phase === "selecting" || phase === "confirming") && (
            <SelectingPhase
              phase={phase}
              commands={commands}
              selectedIds={selectedIds}
              toggleCommand={toggleCommand}
            />
          )}

          {(phase === "running" || phase === "paused" || phase === "completed") && (
            <RunningPhase phase={phase} progresses={progresses} result={result} />
          )}
        </CardContent>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t p-4">
          {phase === "selecting" && (
            <>
              <div className="text-muted-foreground text-sm">
                {t("devCleaner.customCleanup.selected", { count: selectedCount })}
              </div>
              <Button onClick={() => setPhase("confirming")} disabled={selectedCount === 0}>
                {t("devCleaner.customCleanup.next")}
                <ChevronRight size={16} className="ml-1" />
              </Button>
            </>
          )}

          {phase === "confirming" && (
            <>
              <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                <AlertTriangle size={16} />
                {t("devCleaner.customCleanup.confirmWarning", { count: selectedCount })}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPhase("selecting")}>
                  {t("devCleaner.cancel")}
                </Button>
                <Button variant="destructive" onClick={handleStartCleanup}>
                  <Trash2 size={16} className="mr-1" />
                  {t("devCleaner.customCleanup.startCleanup")}
                </Button>
              </div>
            </>
          )}

          {phase === "running" && (
            <>
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 size={16} className="animate-spin" />
                {t("devCleaner.customCleanup.running")}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPhase("paused")}>
                  <Pause size={16} className="mr-1" />
                  {t("devCleaner.customCleanup.pause")}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleStop}>
                  <Square size={16} className="mr-1" />
                  {t("devCleaner.customCleanup.stop")}
                </Button>
              </div>
            </>
          )}

          {phase === "paused" && (
            <>
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Pause size={16} />
                {t("devCleaner.customCleanup.pausedMessage")}
              </div>
              <div className="flex gap-2">
                <Button variant="default" size="sm" onClick={() => setPhase("running")}>
                  <Play size={16} className="mr-1" />
                  {t("devCleaner.customCleanup.resume")}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleStop}>
                  <Square size={16} className="mr-1" />
                  {t("devCleaner.customCleanup.stop")}
                </Button>
              </div>
            </>
          )}

          {phase === "completed" && (
            <>
              <div className="text-muted-foreground text-sm">
                {result?.aborted
                  ? t("devCleaner.customCleanup.aborted")
                  : t("devCleaner.customCleanup.completed")}
              </div>
              <Button variant="default" onClick={handleClose}>
                {t("devCleaner.customCleanup.done")}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

/** Phase: selecting / confirming — shows command list with checkboxes */
function SelectingPhase({
  phase,
  commands,
  selectedIds,
  toggleCommand,
}: {
  phase: string
  commands: CleanupCommandDef[]
  selectedIds: Set<string>
  toggleCommand: (id: string) => void
}) {
  const { t } = useTranslation()
  const isConfirming = phase === "confirming"
  const displayCommands = isConfirming
    ? commands.filter((cmd) => selectedIds.has(cmd.id))
    : commands

  if (commands.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="text-muted-foreground animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="text-muted-foreground grid grid-cols-[auto_1fr_auto] gap-3 border-b px-2 pb-1 text-xs font-medium">
        <span className="w-5" />
        <div className="grid grid-cols-2 gap-2">
          <span>{t("devCleaner.customCleanup.colName")}</span>
          <span>{t("devCleaner.customCleanup.colDescription")}</span>
        </div>
        <span>{t("devCleaner.customCleanup.colRisk")}</span>
      </div>

      {displayCommands.map((cmd) => {
        const isSelected = selectedIds.has(cmd.id)
        const isHighRisk = cmd.risk_level === "high"
        return (
          <label
            key={cmd.id}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border p-3 transition-colors",
              isConfirming
                ? "border-primary/30 bg-primary/5 cursor-default"
                : cn(
                    "hover:bg-accent/50 cursor-pointer",
                    isSelected ? "border-primary bg-primary/5" : "border-border",
                  ),
            )}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isConfirming}
              onChange={() => toggleCommand(cmd.id)}
              className="border-border accent-primary mt-1 h-4 w-4 cursor-pointer rounded disabled:cursor-default disabled:opacity-60"
            />
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">{cmd.name}</div>
                <div className="text-muted-foreground line-clamp-1 font-mono text-xs break-all">
                  {cmd.command}
                </div>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-muted-foreground text-xs">{cmd.description}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {cmd.environment}
                </Badge>
              </div>
            </div>
            <div className="flex items-start gap-1 text-xs whitespace-nowrap">
              {isHighRisk ? (
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-red-500" />
              ) : (
                <Shield size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              )}
              <span
                className={
                  isHighRisk
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                }
              >
                {cmd.risk}
              </span>
            </div>
          </label>
        )
      })}
    </div>
  )
}

/** Phase: running / paused / completed — shows progress per command */
function RunningPhase({
  phase,
  progresses,
  result,
}: {
  phase: string
  progresses: {
    command_id: string
    command_name: string
    status: string
    output: string
    freed_bytes: number
    error: string | null
  }[]
  result: CustomCleanupFinalResult | null
}) {
  const { t } = useTranslation()
  const detailList = result?.details ?? progresses

  return (
    <div className="space-y-3">
      {/* Summary bar when completed */}
      {result && (
        <div
          className={cn(
            "rounded-lg border p-4",
            result.success
              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
              : result.aborted
                ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
          )}
        >
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{formatSize(result.total_freed_bytes)}</div>
              <div className="text-muted-foreground text-xs">
                {t("devCleaner.customCleanup.freedSpace")}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {result.commands_executed}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("devCleaner.customCleanup.successCount")}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {result.commands_failed}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("devCleaner.customCleanup.failedCount")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wait message */}
      {detailList.length === 0 && phase !== "completed" && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
          {t("devCleaner.customCleanup.waiting")}
        </div>
      )}

      {/* Per-command progress */}
      {detailList.map((item) => (
        <div
          key={item.command_id}
          className={cn(
            "space-y-2 rounded-lg border p-3",
            item.status === "running"
              ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20"
              : item.status === "completed"
                ? "border-green-200 dark:border-green-800"
                : item.status === "failed"
                  ? "border-red-200 dark:border-red-800"
                  : "border-border",
          )}
        >
          <div className="flex items-center gap-2">
            {item.status === "running" && (
              <Loader2 size={16} className="animate-spin text-blue-500" />
            )}
            {item.status === "completed" && <CheckCircle2 size={16} className="text-green-500" />}
            {item.status === "failed" && <XCircle size={16} className="text-red-500" />}
            <span className="text-sm font-medium">{item.command_name}</span>
            {item.freed_bytes > 0 && (
              <Badge variant="secondary" className="text-xs">
                {formatSize(item.freed_bytes)}
              </Badge>
            )}
          </div>

          {item.output && (
            <pre className="text-muted-foreground bg-muted/50 max-h-32 overflow-y-auto rounded p-2 font-mono text-xs whitespace-pre-wrap">
              {item.output}
            </pre>
          )}

          {item.error && <div className="text-xs text-red-600 dark:text-red-400">{item.error}</div>}
        </div>
      ))}
    </div>
  )
}
