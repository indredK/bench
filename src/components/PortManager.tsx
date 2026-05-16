import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { platformConfig } from "../platform/config";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Search, X } from "lucide-react";

interface KillPidResult {
  pid: number;
  success: boolean;
  message: string;
}

interface ProcessNode {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  children: ProcessNode[];
}

interface ProcessFingerprint {
  category: string;
  name: string;
  icon: string;
}

interface PortProcessDetail {
  port: number;
  pids: number[];
  process_trees: ProcessNode[];
  fingerprint: ProcessFingerprint | null;
  error: string | null;
}

function ProcessTreeView({ node, depth, targetPid }: { node: ProcessNode; depth: number; targetPid: number }) {
  const isTarget = node.pid === targetPid;
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;

  const nodeContent = (
    <div
      className={cn(
        "flex items-center gap-2 rounded px-1 py-0.5 text-[13px] leading-[22px]",
        isTarget && "bg-primary text-primary-foreground"
      )}
      style={{ paddingLeft: 4 + depth * 24 }}
    >
      <span className="w-4 shrink-0 text-center opacity-50">
        {hasChildren ? (expanded ? "▼" : "▶") : " "}
      </span>
      <span className={cn("whitespace-nowrap", isTarget && "font-semibold")}>
        {node.name}
      </span>
      <span className={cn(
        "text-[11px]",
        isTarget ? "text-primary-foreground/70" : "text-muted-foreground"
      )}>
        PID {node.pid}
      </span>
      {isTarget && (
        <span className="rounded-[10px] bg-white/20 px-1.5 py-px text-[10px]">
          PORT OWNER
        </span>
      )}
      {!isTarget && node.pid === node.ppid && (
        <span className="rounded-[10px] border px-1.5 py-px text-[10px] text-muted-foreground">
          ROOT
        </span>
      )}
    </div>
  );

  if (!hasChildren) {
    return nodeContent;
  }

  return (
    <div>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="w-full cursor-pointer">
          {nodeContent}
        </CollapsibleTrigger>
        <CollapsibleContent>
          {node.children.map((child) => (
            <ProcessTreeView key={child.pid} node={child} depth={depth + 1} targetPid={targetPid} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

const PORT_SCAN_STATUS_META = {
  waiting: { labelKey: "portManager.statusWaiting" },
  scanning: { labelKey: "portManager.statusScanning" },
  success: { labelKey: "portManager.statusSuccess" },
  empty: { labelKey: "portManager.statusEmpty" },
  error: { labelKey: "portManager.statusError" },
  ended: { labelKey: "portManager.statusEnded" },
} as const;

type PortScanStatus = keyof typeof PORT_SCAN_STATUS_META;

interface PortState {
  port: number;
  status: PortScanStatus;
}

const chipStatusClasses: Record<PortScanStatus, string> = {
  waiting: "opacity-65 bg-muted border-muted-foreground/20 text-muted-foreground",
  scanning: "bg-indigo-50 border-indigo-300 text-indigo-600 animate-pulse",
  success: "bg-emerald-50 border-emerald-300 text-emerald-700",
  empty: "bg-blue-50 border-blue-300 text-blue-700",
  error: "bg-red-50 border-red-300 text-red-800",
  ended: "opacity-50 bg-muted border-dashed border-muted-foreground/30 text-muted-foreground",
};

const chipActionBase = "flex size-5 shrink-0 items-center justify-center rounded-full";

function PortManager() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanSessionRef = useRef(0);
  const [inputValue, setInputValue] = useState("");
  const [showInvalidToast, setShowInvalidToast] = useState(false);
  const [portStates, setPortStates] = useState<PortState[]>([]);
  const [portDetails, setPortDetails] = useState<PortProcessDetail[]>([]);
  const [killing, setKilling] = useState(false);
  const [portKillMessages, setPortKillMessages] = useState<Record<number, string[]>>({});
  const [error, setError] = useState("");
  const [showEmptyPorts, setShowEmptyPorts] = useState(true);
  const [inputError, setInputError] = useState("");

  const commonPorts = [3000, 5173, 1420, 8080, 5000, 4200, 8000, 4321, 6006, 1234, 9000];
  const MAX_PORTS = 100;
  const isScanning = portStates.some((ps) => ps.status === "scanning");

  const clearInvalidTimer = useCallback(() => {
    if (invalidTimerRef.current) {
      clearTimeout(invalidTimerRef.current);
      invalidTimerRef.current = null;
    }
  }, []);

  const handleInvalidInput = useCallback((message?: string) => {
    setShowInvalidToast(true);
    setInputError(message || t("portManager.invalidInput"));
    clearInvalidTimer();
    invalidTimerRef.current = setTimeout(() => {
      setInputValue("");
      setShowInvalidToast(false);
      setInputError("");
      invalidTimerRef.current = null;
    }, 3000);
  }, [clearInvalidTimer, t]);

  useEffect(() => {
    return () => clearInvalidTimer();
  }, [clearInvalidTimer]);

  const doScan = async (portsToScan: number[]) => {
    if (!isTauri()) {
      setError(t("portManager.browserError"));
      return;
    }
    if (portsToScan.length === 0) return;

    const sessionId = scanSessionRef.current;

    setError("");
    setPortDetails((prev) => prev.filter((d) => !portsToScan.includes(d.port)));
    setPortKillMessages({});

    for (const port of portsToScan) {
      if (scanSessionRef.current !== sessionId) {
        setPortStates((prev) =>
          prev.map((ps) =>
            portsToScan.includes(ps.port) && (ps.status === "waiting" || ps.status === "scanning")
              ? { ...ps, status: "ended" }
              : ps
          )
        );
        break;
      }

      setPortStates((prev) =>
        prev.map((ps) => (ps.port === port ? { ...ps, status: "scanning" } : ps))
      );

      try {
        const details: PortProcessDetail[] = await invoke("query_port_processes", { ports: [port] });

        if (scanSessionRef.current !== sessionId) {
          setPortStates((prev) =>
            prev.map((ps) => (ps.port === port ? { ...ps, status: "ended" } : ps))
          );
          break;
        }

        const portDetail = details.find((d) => d.port === port);
        const isOccupied = portDetail && !portDetail.error && portDetail.pids.length > 0;

        setPortDetails((prev) => [...prev, ...details]);
        setPortStates((prev) =>
          prev.map((ps) =>
            ps.port === port ? { ...ps, status: isOccupied ? "success" : "empty" } : ps
          )
        );
      } catch (e) {
        if (scanSessionRef.current !== sessionId) break;
        setPortStates((prev) =>
          prev.map((ps) => (ps.port === port ? { ...ps, status: "error" } : ps))
        );
      }
    }

    setPortDetails((prev) => [...prev].sort((a, b) => a.port - b.port));
  };

  const removePort = (port: number) => {
    setPortStates((prev) => prev.filter((ps) => ps.port !== port));
    setPortDetails((prev) => prev.filter((d) => d.port !== port));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    if (/[^0-9,\-]/.test(raw)) {
      handleInvalidInput();
    } else {
      clearInvalidTimer();
      setShowInvalidToast(false);
    }
  };

  const parsePortsFromInput = (input: string): { ports: number[]; hasError: boolean; error?: string } => {
    const ports: Set<number> = new Set();
    let hasError = false;
    let error: string | undefined;
    const parts = input.split(",").map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes("-")) {
        const rangeParts = part.split("-");
        if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
          hasError = true;
          error = error || t("portManager.invalidRangeFormat");
          continue;
        }
        const [startStr, endStr] = rangeParts;
        if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
          hasError = true;
          error = error || t("portManager.invalidPortNumber");
          continue;
        }
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (start > end) {
          hasError = true;
          error = error || t("portManager.rangeStartGtEnd");
          continue;
        }
        if (start < 1 || end > 65535) {
          hasError = true;
          error = error || t("portManager.portOutOfRange");
          continue;
        }
        const rangeSize = end - start + 1;
        if (ports.size + rangeSize > MAX_PORTS) {
          hasError = true;
          error = error || t("portManager.tooManyPorts");
          continue;
        }
        for (let p = start; p <= end; p++) {
          ports.add(p);
        }
      } else {
        if (!/^\d+$/.test(part)) {
          hasError = true;
          error = error || t("portManager.invalidPortFormat");
          continue;
        }
        const port = parseInt(part, 10);
        if (port < 1 || port > 65535) {
          hasError = true;
          error = error || t("portManager.portOutOfRange");
          continue;
        }
        if (ports.size >= MAX_PORTS) {
          hasError = true;
          error = error || t("portManager.tooManyPorts");
          continue;
        }
        ports.add(port);
      }
    }

    return { ports: [...ports].sort((a, b) => a - b), hasError, error };
  };

  const commitInput = () => {
    const val = inputValue.trim();
    if (!val) return;
    if (!/^[\d,\-]+$/.test(val)) {
      handleInvalidInput(t("portManager.invalidInput"));
      return;
    }
    const { ports: newPorts, hasError, error } = parsePortsFromInput(val);
    if (hasError) {
      handleInvalidInput(error || t("portManager.invalidInput"));
      return;
    }
    if (newPorts.length === 0) return;

    const existingPorts = portStates.map((ps) => ps.port);
    const portsToAdd = newPorts.filter((p) => !existingPorts.includes(p));
    if (portsToAdd.length === 0) {
      handleInvalidInput(t("portManager.portsAlreadyAdded"));
      return;
    }

    clearInvalidTimer();
    setShowInvalidToast(false);
    setInputValue("");

    setPortStates((prev) => {
      if (prev.length >= MAX_PORTS) return prev;
      const updated = [...prev];
      for (const port of portsToAdd) {
        if (updated.length >= MAX_PORTS) break;
        updated.push({ port, status: "waiting" });
      }
      return updated.sort((a, b) => a.port - b.port);
    });

    doScan(portsToAdd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitInput();
    }
    if (e.key === "Backspace" && inputValue.length === 0 && portStates.length > 0) {
      removePort(portStates[portStates.length - 1].port);
    }
  };

  const handleScanClick = () => {
    commitInput();
  };

  const addCommonPort = (port: number) => {
    if (port < 1 || port > 65535) return;
    const exists = portStates.some((ps) => ps.port === port);
    if (exists) return;
    setPortStates((prev) => [...prev, { port, status: "waiting" as PortScanStatus }].sort((a, b) => a.port - b.port));
    doScan([port]);
  };

  const handleClearInput = () => {
    clearInvalidTimer();
    setInputValue("");
    setShowInvalidToast(false);
    setInputError("");
    inputRef.current?.focus();
  };

  const handleClearAll = () => {
    scanSessionRef.current += 1;
    clearInvalidTimer();
    setInputValue("");
    setShowInvalidToast(false);
    setInputError("");
    setPortStates([]);
    setPortDetails([]);
    setPortKillMessages({});
    setError("");
  };

  const handleRescanAll = () => {
    const allPorts = portStates.map((ps) => ps.port);
    if (allPorts.length > 0) {
      setPortStates((prev) => prev.map((ps) => ({ ...ps, status: "waiting" })));
      doScan(allPorts);
    }
  };

  const handleKillPort = async (port: number, pid: number) => {
    setError("");
    setKilling(true);
    try {
      const result: KillPidResult[] = await invoke("kill_processes", { pids: [pid] });
      const messages = result.map((r) => (r.success ? `PID ${r.pid} killed` : `PID ${r.pid}: ${r.message}`));
      setPortKillMessages((prev) => ({ ...prev, [port]: messages }));
      doScan([port]);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to kill process");
    } finally {
      setKilling(false);
    }
  };

  const handleKillAll = async () => {
    setError("");
    setKilling(true);
    try {
      const allPids = portDetails.flatMap((d) => d.pids);
      const portsToRescan = portDetails.map((d) => d.port);
      await invoke<KillPidResult[]>("kill_processes", { pids: allPids });
      if (portsToRescan.length > 0) {
        doScan(portsToRescan);
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to kill processes");
    } finally {
      setKilling(false);
    }
  };

  const scrollContentRef = useRef<HTMLDivElement>(null);
  const [highlightPort, setHighlightPort] = useState<number | null>(null);

  const scrollToPort = (port: number) => {
    if (!scrollContentRef.current) return;
    const el = scrollContentRef.current.querySelector(`[data-port="${port}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightPort(port);
    setTimeout(() => setHighlightPort(null), 2000);
  };

  const occupiedCount = portDetails.filter((d) => !d.error && d.pids.length > 0).length;
  const displayedDetails = showEmptyPorts ? portDetails : portDetails.filter((d) => !d.error && d.pids.length > 0);

  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="flex flex-col overflow-visible">
        <CardHeader>
          <CardTitle>{t("portManager.title")}</CardTitle>
        </CardHeader>
        <CardContent className="mt-2 flex flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex flex-wrap items-start gap-2.5">
              <div className="relative flex-1" style={{ minWidth: 200 }}>
                <Input
                  ref={inputRef}
                  id="port-input"
                  className="pr-9"
                  placeholder={t("portManager.placeholder")}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={killing}
                  autoComplete="off"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Tooltip open={showInvalidToast}>
                    <TooltipTrigger>
                      <button
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          inputValue.length > 0
                            ? showInvalidToast
                              ? "animate-pulse bg-yellow-500 text-white opacity-100 hover:bg-yellow-600"
                              : "bg-muted-foreground text-white opacity-60 hover:bg-foreground hover:opacity-100"
                            : "opacity-0 pointer-events-none"
                        )}
                        onClick={handleClearInput}
                        disabled={killing}
                        aria-label="Clear input"
                      >
                        <X size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{inputError || t("portManager.invalidInput")}</TooltipContent>
                  </Tooltip>
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="default"
                  onClick={handleScanClick}
                  disabled={!inputValue.trim() || killing || isScanning}
                  className="min-w-[120px] justify-center"
                >
                  {isScanning && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  {t("portManager.scanButton")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleClearAll}
                  disabled={portStates.length === 0 || killing}
                  className="min-w-[130px]"
                >
                  {t("portManager.clearSelectedPorts")}
                  {portStates.length > 0 && (
                    <span className="ml-0.5 text-xs opacity-60">{portStates.length}</span>
                  )}
                </Button>
              </div>
            </div>

          <div className="flex flex-wrap gap-1.5">
            {commonPorts.map((port) => (
              <Button
                key={port}
                variant="secondary"
                size="sm"
                className="rounded-lg"
                onClick={() => addCommonPort(port)}
                disabled={killing || portStates.some((ps) => ps.port === port)}
              >
                {port}
              </Button>
            ))}
          </div>

          <div className="min-h-20 max-h-40 overflow-y-auto rounded-lg border bg-muted/30 p-1.5">
            {portStates.length === 0 ? (
              <div className="flex min-h-[44px] items-center justify-center p-2">
                <p className="text-center text-[13px] text-muted-foreground">{t("portManager.emptyChips")}</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {portStates.map((ps) => (
                  <span
                    key={ps.port}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-[13px] font-medium leading-[22px] whitespace-nowrap transition-colors animate-[chip-in_0.12s_ease-out]",
                      chipStatusClasses[ps.status]
                    )}
                    onClick={() => scrollToPort(ps.port)}
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="flex size-3 shrink-0 items-center justify-center">
                            <span
                              className={cn(
                                "rounded-full",
                                ps.status === "waiting" && "size-2 opacity-0",
                                ps.status === "scanning" && "size-3 animate-spin border-2 border-indigo-200 border-t-indigo-500",
                                ps.status === "success" && "size-2 bg-emerald-500",
                                ps.status === "empty" && "size-2 bg-blue-400",
                                ps.status === "error" && "size-2 bg-red-500",
                                ps.status === "ended" && "size-2 bg-muted-foreground",
                              )}
                            />
                          </span>
                        }
                      />
                      <TooltipContent>{t(PORT_SCAN_STATUS_META[ps.status].labelKey)}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger render={<span>{ps.port}</span>} />
                      <TooltipContent>{t("portManager.chipScrollTo", { port: ps.port })}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <button
                          className={cn(chipActionBase, "group transition hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
                          onClick={(e) => {
                            e.stopPropagation();
                            doScan([ps.port]);
                          }}
                        >
                          <RefreshCw size={13} className="transition-transform group-hover:rotate-180" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("portManager.rescan")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <button
                          className={cn(chipActionBase, "text-yellow-600 transition hover:bg-yellow-600 hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
                          onClick={(e) => {
                            e.stopPropagation();
                            removePort(ps.port);
                          }}
                        >
                          <X size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("portManager.removePort", { port: ps.port })}</TooltipContent>
                    </Tooltip>
                  </span>
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
              <TooltipTrigger>
                <button
                  className={cn(chipActionBase, "transition hover:bg-destructive/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
                  onClick={() => setError("")}
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
                <TooltipTrigger>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-lg min-w-[110px] shrink-0"
                    onClick={() => setShowEmptyPorts(!showEmptyPorts)}
                  >
                    {showEmptyPorts ? t("portManager.hideEmpty") : t("portManager.showEmpty")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{showEmptyPorts ? t("portManager.hideEmpty") : t("portManager.showEmpty")}</TooltipContent>
              </Tooltip>
            )}
            {portDetails.length > 0 && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-lg shrink-0"
                    onClick={handleRescanAll}
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
                <TooltipTrigger>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-lg min-w-[110px] shrink-0"
                    onClick={handleKillAll}
                    disabled={killing || occupiedCount === 0}
                  >
                    {killing && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {t("portManager.killAllButton")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {occupiedCount === 0 ? t("portManager.killAllDisabledHint") : t("portManager.killAllCommandHint")}
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
                      highlightPort === detail.port && "border-indigo-400 bg-indigo-50 shadow-[0_0_0_3px_rgba(79,70,229,0.15)]"
                    )}
                  >
                    {detail.error ? (
                      <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-[13px] text-blue-700">
                        <span className="size-2 shrink-0 rounded-full bg-blue-500" />
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
                              <span className="rounded bg-yellow-50 px-2 py-0.5 text-xs text-yellow-700">
                                {portKillMessages[detail.port].join(", ")}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5">
                            <Tooltip>
                            <TooltipTrigger>
                              <Button
                                variant="default"
                                size="sm"
                                className="rounded-lg bg-amber-600 hover:bg-amber-700"
                                onClick={() => handleKillPort(detail.port, detail.pids[0])}
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

export default PortManager;