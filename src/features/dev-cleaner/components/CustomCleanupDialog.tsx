/**
 * Custom Cleanup Dialog / 自定义清理弹窗: command selection, execution, and results.
 */
import { useCallback, useRef } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDevCleanerStore } from "@/features/dev-cleaner/store";
import { cn, formatSize } from "@/lib/utils";
import {
  getCustomCleanupCommands,
  executeCustomCleanup,
  stopCustomCleanup,
} from "@/lib/tauri/commands/dev-cleaner";
import { TAURI_EVENTS } from "@/lib/tauri/contracts";
import { listenToPlatformEvent } from "@/platform/events";
import { canUseDesktopFeatures } from "@/platform/capabilities";
import type { CleanupCommandDef, CustomCleanupProgress, CustomCleanupFinalResult } from "@/lib/tauri/types/dev-cleaner";

export function CustomCleanupDialog() {
  const { t } = useTranslation();
  const canUsePlatform = canUseDesktopFeatures();

  const phase = useDevCleanerStore((s) => s.customCleanupPhase);
  const commands = useDevCleanerStore((s) => s.customCleanupCommands);
  const selectedIds = useDevCleanerStore((s) => s.selectedCommandIds);
  const progresses = useDevCleanerStore((s) => s.customCleanupProgresses);
  const result = useDevCleanerStore((s) => s.customCleanupResult);
  const show = useDevCleanerStore((s) => s.showCustomCleanup);

  const setShow = useDevCleanerStore((s) => s.setShowCustomCleanup);
  const setPhase = useDevCleanerStore((s) => s.setCustomCleanupPhase);
  const setCommands = useDevCleanerStore((s) => s.setCustomCleanupCommands);
  const toggleCommand = useDevCleanerStore((s) => s.toggleCustomCleanupCommand);
  const setProgresses = useDevCleanerStore((s) => s.setCustomCleanupProgresses);
  const setResult = useDevCleanerStore((s) => s.setCustomCleanupResult);
  const resetCustom = useDevCleanerStore((s) => s.resetCustomCleanup);

  const unlistenRef = useRef<(() => void) | null>(null);

  const cleanupListeners = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
  }, []);

  const open = useCallback(async () => {
    setShow(true);
    setPhase("selecting");
    try {
      const cmds = await getCustomCleanupCommands();
      setCommands(cmds);
    } catch {
      setCommands([]);
    }
  }, [setShow, setPhase, setCommands]);

  const handleClose = useCallback(() => {
    cleanupListeners();
    setShow(false);
    resetCustom();
  }, [cleanupListeners, setShow, resetCustom]);

  const handleStartCleanup = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setPhase("running");
    setProgresses([]);
    setResult(null);

    cleanupListeners();

    try {
      const unlistenProgress = await listenToPlatformEvent<CustomCleanupProgress>(
        TAURI_EVENTS.customCleanup.progress,
        (event) => {
          const p = event.payload;
          const state = useDevCleanerStore.getState();
          const prev = state.customCleanupProgresses;
          const idx = prev.findIndex((x) => x.command_id === p.command_id);
          if (idx >= 0) {
            state.updateCustomCleanupProgress(p);
          } else {
            state.setCustomCleanupProgresses([...prev, p]);
          }
        }
      );
      const unlistenCompleted = await listenToPlatformEvent<CustomCleanupFinalResult>(
        TAURI_EVENTS.customCleanup.completed,
        (event) => {
          setResult(event.payload);
          setPhase("completed");
        }
      );
      unlistenRef.current = () => {
        unlistenProgress();
        unlistenCompleted();
      };

      const finalResult = await executeCustomCleanup(ids);
      setResult(finalResult);
      setPhase("completed");
    } catch {
      setPhase("completed");
      setResult({
        success: false,
        total_freed_bytes: 0,
        commands_executed: 0,
        commands_failed: 0,
        details: [],
        aborted: false,
      });
    }
  }, [selectedIds, setPhase, setProgresses, setResult, cleanupListeners]);

  const handleStop = useCallback(async () => {
    try {
      await stopCustomCleanup();
    } catch {
      // best-effort
    }
  }, []);

  const selectedCount = selectedIds.size;

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
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex flex-row items-center justify-between border-b pb-3">
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

        <CardContent className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {(phase === "selecting" || phase === "confirming") && (
            <SelectingPhase
              t={t}
              phase={phase}
              commands={commands}
              selectedIds={selectedIds}
              toggleCommand={toggleCommand}
            />
          )}

          {(phase === "running" || phase === "paused" || phase === "completed") && (
            <RunningPhase
              t={t}
              phase={phase}
              progresses={progresses}
              result={result}
            />
          )}
        </CardContent>

        {/* Footer */}
        <div className="shrink-0 border-t p-4 flex items-center justify-between gap-2">
          {phase === "selecting" && (
            <>
              <div className="text-sm text-muted-foreground">
                {t("devCleaner.customCleanup.selected", { count: selectedCount })}
              </div>
              <Button
                onClick={() => setPhase("confirming")}
                disabled={selectedCount === 0}
              >
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
              <div className="text-sm text-muted-foreground">
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
  );
}

/** Phase: selecting / confirming — shows command list with checkboxes */
function SelectingPhase({
  t,
  phase,
  commands,
  selectedIds,
  toggleCommand,
}: {
  t: TFunction;
  phase: string;
  commands: CleanupCommandDef[];
  selectedIds: Set<string>;
  toggleCommand: (id: string) => void;
}) {
  const isConfirming = phase === "confirming";
  const displayCommands = isConfirming
    ? commands.filter((cmd) => selectedIds.has(cmd.id))
    : commands;

  if (commands.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-3 text-xs font-medium text-muted-foreground px-2 pb-1 border-b">
        <span className="w-5" />
        <div className="grid grid-cols-2 gap-2">
          <span>{t("devCleaner.customCleanup.colName")}</span>
          <span>{t("devCleaner.customCleanup.colDescription")}</span>
        </div>
        <span>{t("devCleaner.customCleanup.colRisk")}</span>
      </div>

      {displayCommands.map((cmd) => {
        const isSelected = selectedIds.has(cmd.id);
        const isHighRisk = cmd.risk_level === "high";
        return (
          <label
            key={cmd.id}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] gap-3 items-start p-3 rounded-lg border transition-colors",
              isConfirming
                ? "border-primary/30 bg-primary/5 cursor-default"
                : cn(
                    "cursor-pointer hover:bg-accent/50",
                    isSelected ? "border-primary bg-primary/5" : "border-border",
                  ),
            )}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isConfirming}
              onChange={() => toggleCommand(cmd.id)}
              className="mt-1 h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:cursor-default disabled:opacity-60"
            />
            <div className="grid grid-cols-2 gap-2 min-w-0">
              <div className="space-y-1 min-w-0">
                <div className="font-medium text-sm">{cmd.name}</div>
                <div className="text-xs text-muted-foreground font-mono break-all line-clamp-1">
                  {cmd.command}
                </div>
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs text-muted-foreground">{cmd.description}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {cmd.environment}
                </Badge>
              </div>
            </div>
            <div className="flex items-start gap-1 text-xs whitespace-nowrap">
              {isHighRisk ? (
                <ShieldAlert size={14} className="text-red-500 mt-0.5 shrink-0" />
              ) : (
                <Shield size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              )}
              <span
                className={
                  isHighRisk
                    ? "text-red-600 dark:text-red-400 font-medium"
                    : "text-muted-foreground"
                }
              >
                {cmd.risk}
              </span>
            </div>
          </label>
        );
      })}
    </div>
  );
}

/** Phase: running / paused / completed — shows progress per command */
function RunningPhase({
  t,
  phase,
  progresses,
  result,
}: {
  t: TFunction;
  phase: string;
  progresses: { command_id: string; command_name: string; status: string; output: string; freed_bytes: number; error: string | null }[];
  result: CustomCleanupFinalResult | null;
}) {
  const detailList = result?.details ?? progresses;

  return (
    <div className="space-y-3">
      {/* Summary bar when completed */}
      {result && (
        <div
          className={cn(
            "rounded-lg border p-4",
            result.success
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
              : result.aborted
                ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
                : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
          )}
        >
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{formatSize(result.total_freed_bytes)}</div>
              <div className="text-xs text-muted-foreground">
                {t("devCleaner.customCleanup.freedSpace")}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {result.commands_executed}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("devCleaner.customCleanup.successCount")}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {result.commands_failed}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("devCleaner.customCleanup.failedCount")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wait message */}
      {detailList.length === 0 && phase !== "completed" && (
        <div className="text-sm text-muted-foreground text-center py-8">
          <Loader2 size={20} className="animate-spin mx-auto mb-2" />
          {t("devCleaner.customCleanup.waiting")}
        </div>
      )}

      {/* Per-command progress */}
      {detailList.map((item) => (
        <div
          key={item.command_id}
          className={cn(
            "rounded-lg border p-3 space-y-2",
            item.status === "running"
              ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20"
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
            {item.status === "completed" && (
              <CheckCircle2 size={16} className="text-green-500" />
            )}
            {item.status === "failed" && <XCircle size={16} className="text-red-500" />}
            <span className="font-medium text-sm">{item.command_name}</span>
            {item.freed_bytes > 0 && (
              <Badge variant="secondary" className="text-xs">
                {formatSize(item.freed_bytes)}
              </Badge>
            )}
          </div>

          {item.output && (
            <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
              {item.output}
            </pre>
          )}

          {item.error && (
            <div className="text-xs text-red-600 dark:text-red-400">{item.error}</div>
          )}
        </div>
      ))}
    </div>
  );
}
