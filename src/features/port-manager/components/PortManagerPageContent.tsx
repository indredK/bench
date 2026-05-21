/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import type { Ref } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { platformConfig } from "@/platform/config";
import { cn } from "@/lib/utils";
import { PortManagerCommonPorts, PortManagerControls, PortManagerPortChip } from "@/features/port-manager/components/PortManagerControls";
import { ProcessTreeView } from "@/features/port-manager/components/ProcessTreeView";
import { chipStatusClasses, commonPorts } from "@/features/port-manager/hooks/usePortManagerController";
import type { PortProcessDetail } from "@/lib/tauri/types/port-manager";
import type { PortScanStatus } from "@/features/port-manager/store";

interface PortManagerPageContentProps {
  t: TFunction;
  inputRef: Ref<HTMLInputElement>;
  scrollContentRef: Ref<HTMLDivElement>;
  inputValue: string;
  showInvalidToast: boolean;
  inputError: string;
  portStates: { port: number; status: PortScanStatus }[];
  portDetails: PortProcessDetail[];
  portKillMessages: Record<number, string[]>;
  error: string;
  killing: boolean;
  isScanning: boolean;
  showEmptyPorts: boolean;
  highlightPort: number | null;
  occupiedCount: number;
  displayedDetails: PortProcessDetail[];
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onScan: () => void;
  onClearInput: () => void;
  onClearAll: () => void;
  onAddCommonPort: (port: number) => void;
  onToggleShowEmptyPorts: () => void;
  onRescanAll: () => void;
  onRescanPort: (port: number) => void;
  onKillAll: () => void;
  onScrollToPort: (port: number) => void;
  onKillPort: (port: number, pids: number[]) => void;
  onRemovePort: (port: number) => void;
  onSetError: (value: string) => void;
  statusIconFor: (status: PortScanStatus) => React.ReactNode;
}

export function PortManagerPageContent({
  t,
  inputRef,
  scrollContentRef,
  inputValue,
  showInvalidToast,
  inputError,
  portStates,
  portDetails,
  portKillMessages,
  error,
  killing,
  isScanning,
  showEmptyPorts,
  highlightPort,
  occupiedCount,
  displayedDetails,
  onInputChange,
  onInputKeyDown,
  onScan,
  onClearInput,
  onClearAll,
  onAddCommonPort,
  onToggleShowEmptyPorts,
  onRescanAll,
  onRescanPort,
  onKillAll,
  onScrollToPort,
  onKillPort,
  onRemovePort,
  onSetError,
  statusIconFor,
}: PortManagerPageContentProps) {
  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="flex flex-col overflow-visible">
        <CardHeader>
          <CardTitle>{t("portManager.title")}</CardTitle>
        </CardHeader>
        <CardContent className="mt-2 flex flex-1 flex-col gap-3 overflow-hidden">
          <PortManagerControls
            t={t}
            inputRef={inputRef}
            inputValue={inputValue}
            showInvalidToast={showInvalidToast}
            inputError={inputError}
            killing={killing}
            isScanning={isScanning}
            portCount={portStates.length}
            onInputChange={onInputChange}
            onInputKeyDown={onInputKeyDown}
            onScan={onScan}
            onClear={onClearInput}
            onClearAll={onClearAll}
          />

          <PortManagerCommonPorts
            ports={commonPorts}
            killing={killing}
            portStates={portStates}
            onAddPort={onAddCommonPort}
          />

          <div className="min-h-20 max-h-40 overflow-y-auto rounded-lg border bg-muted/30 p-1.5">
            {portStates.length === 0 ? (
              <div className="flex min-h-[44px] items-center justify-center p-2">
                <p className="text-center text-[13px] text-muted-foreground">
                  {t("portManager.emptyChips")}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {portStates.map((ps) => (
                  <PortManagerPortChip
                    key={ps.port}
                    port={ps.port}
                    statusClassName={chipStatusClasses[ps.status]}
                    statusIcon={statusIconFor(ps.status)}
                    onScrollTo={() => onScrollToPort(ps.port)}
                    onRescan={() => onRescanPort(ps.port)}
                    onRemove={() => onRemovePort(ps.port)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full transition hover:bg-destructive/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  )}
                  onClick={() => onSetError("")}
                >
                  <X size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("portManager.dismissError")}</TooltipContent>
            </Tooltip>
          </AlertDescription>
        </Alert>
      )}

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row flex-nowrap items-center justify-between gap-3">
          <CardTitle className="min-w-0 truncate">
            {t("portManager.scanResultsTitle", { count: portDetails.length })}
            {portDetails.length > 0 && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                {t("portManager.occupiedCount", { occupied: occupiedCount })}
              </span>
            )}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            {portDetails.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-lg min-w-[110px] shrink-0"
                    onClick={onToggleShowEmptyPorts}
                  >
                    {showEmptyPorts ? t("portManager.hideEmpty") : t("portManager.showEmpty")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showEmptyPorts ? t("portManager.hideEmpty") : t("portManager.showEmpty")}
                </TooltipContent>
              </Tooltip>
            )}
            {portDetails.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-lg shrink-0"
                    onClick={onRescanAll}
                    disabled={isScanning || killing}
                  >
                    <RefreshCw size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("portManager.rescanAll")}</TooltipContent>
              </Tooltip>
            )}
            {portDetails.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-lg min-w-[110px] shrink-0"
                    onClick={onKillAll}
                    disabled={killing || occupiedCount === 0}
                  >
                    {killing && <Loader2 className="size-3.5 animate-spin" />}
                    {t("portManager.killAllButton")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {occupiedCount === 0
                    ? t("portManager.killAllDisabledHint")
                    : t("portManager.killAllCommandHint")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">
          <div className="h-full overflow-y-auto px-4 pb-4">
            <div ref={scrollContentRef}>
              {portDetails.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-10 text-center text-muted-foreground">
                  <Search size={48} className="opacity-30" />
                  <p className="text-sm">{t("portManager.emptyResults")}</p>
                </div>
              ) : displayedDetails.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-6 text-center text-muted-foreground">
                  <Search size={48} className="opacity-30" />
                  <p className="text-sm">{t("portManager.emptyOnly")}</p>
                </div>
              ) : (
                <>
                  {displayedDetails.map((detail) => (
                    <div
                      key={detail.port}
                      data-port={detail.port}
                      className={cn(
                        "mb-2.5 rounded-lg border bg-muted/30 p-3 transition",
                        highlightPort === detail.port && "border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 shadow-[0_0_0_3px_rgba(79,70,229,0.15)] dark:shadow-[0_0_0_3px_rgba(129,140,248,0.15)]"
                      )}
                    >
                      {detail.error ? (
                        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-[13px] text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                          <span className="size-2 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400" />
                          {t("portManager.port", { port: detail.port })}: {detail.error}
                        </div>
                      ) : (
                        <>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">
                                {t("portManager.port", { port: detail.port })}
                              </span>
                              {detail.fingerprint && (
                                <Badge variant="outline" className="gap-1">
                                  <span>{detail.fingerprint.icon}</span>
                                  <span>{detail.fingerprint.name}</span>
                                </Badge>
                              )}
                              {portKillMessages[detail.port] && (
                                <span className="rounded bg-yellow-50 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300">
                                  {portKillMessages[detail.port].join(", ")}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="rounded-lg bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                                    onClick={() => onKillPort(detail.port, detail.pids)}
                                    disabled={killing}
                                  >
                                    {t("portManager.killButton")}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("portManager.freePortHint", {
                                    port: detail.port,
                                    command: platformConfig.freePortCommandTemplate.replace("{{port}}", String(detail.port)),
                                  })}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          <div className="overflow-x-auto rounded-md border bg-background px-1 py-1.5 font-mono text-xs">
                            {detail.process_trees.map((tree) => (
                              <ProcessTreeView
                                key={tree.pid}
                                node={tree}
                                depth={0}
                                targetPid={detail.pids[0]}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
