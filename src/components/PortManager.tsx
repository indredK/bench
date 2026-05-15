import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { platformConfig } from "../platform/config";
import { invoke, isTauri } from "@tauri-apps/api/core";

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

  return (
    <div>
      <div
        className="process-tree-node"
        style={{
          paddingLeft: depth * 24,
          background: isTarget ? "var(--primary-color)" : "transparent",
          color: isTarget ? "#fff" : undefined,
          borderRadius: isTarget ? "4px" : undefined,
          margin: "2px 0",
          padding: `${2}px ${4 + depth * 24}px`,
          cursor: hasChildren ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          lineHeight: "22px",
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <span style={{ width: 16, textAlign: "center", flexShrink: 0, opacity: 0.5 }}>
          {hasChildren ? (expanded ? "▼" : "▶") : " "}
        </span>
        <span style={{ fontWeight: isTarget ? 600 : 400, whiteSpace: "nowrap" }}>
          {node.name}
        </span>
        <span style={{ color: isTarget ? "rgba(255,255,255,0.7)" : "var(--text-secondary)", fontSize: 11 }}>
          PID {node.pid}
        </span>
        {isTarget && (
          <span style={{ fontSize: 10, background: "rgba(255,255,255,0.2)", padding: "1px 6px", borderRadius: 10 }}>
            PORT OWNER
          </span>
        )}
        {!isTarget && node.pid === node.ppid && (
          <span style={{ fontSize: 10, color: "var(--text-secondary)", padding: "1px 6px", borderRadius: 10, border: "1px solid var(--border-color)" }}>
            ROOT
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <ProcessTreeView key={child.pid} node={child} depth={depth + 1} targetPid={targetPid} />
          ))}
        </div>
      )}
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

  const commonPorts = [3000, 5173, 1420, 8080, 5000, 4200, 8000, 4321, 6006, 1234, 9000];
  const MAX_PORTS = 100;
  const isScanning = portStates.some((ps) => ps.status === "scanning");

  const clearInvalidTimer = useCallback(() => {
    if (invalidTimerRef.current) {
      clearTimeout(invalidTimerRef.current);
      invalidTimerRef.current = null;
    }
  }, []);

  const handleInvalidInput = useCallback(() => {
    setShowInvalidToast(true);
    clearInvalidTimer();
    invalidTimerRef.current = setTimeout(() => {
      setInputValue("");
      setShowInvalidToast(false);
      invalidTimerRef.current = null;
    }, 3000);
  }, [clearInvalidTimer]);

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

  const parsePortsFromInput = (input: string): { ports: number[]; hasError: boolean } => {
    const ports: Set<number> = new Set();
    let hasError = false;
    const parts = input.split(",").map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes("-")) {
        const rangeParts = part.split("-");
        if (rangeParts.length !== 2) {
          hasError = true;
          continue;
        }
        const [startStr, endStr] = rangeParts;
        if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
          hasError = true;
          continue;
        }
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (start > end || start < 1 || end > 65535) {
          hasError = true;
          continue;
        }
        const rangeSize = end - start + 1;
        if (ports.size + rangeSize > MAX_PORTS) {
          hasError = true;
          continue;
        }
        for (let p = start; p <= end; p++) {
          ports.add(p);
        }
      } else {
        if (!/^\d+$/.test(part)) {
          hasError = true;
          continue;
        }
        const port = parseInt(part, 10);
        if (port < 1 || port > 65535) {
          hasError = true;
          continue;
        }
        if (ports.size >= MAX_PORTS) {
          hasError = true;
          continue;
        }
        ports.add(port);
      }
    }

    return { ports: [...ports].sort((a, b) => a - b), hasError };
  };

  const commitInput = () => {
    const val = inputValue.trim();
    if (!val) return;
    if (!/^[\d,\-]+$/.test(val)) {
      handleInvalidInput();
      return;
    }
    const { ports: newPorts, hasError } = parsePortsFromInput(val);
    if (hasError) {
      handleInvalidInput();
      return;
    }
    if (newPorts.length === 0) return;

    const existingPorts = portStates.map((ps) => ps.port);
    const portsToAdd = newPorts.filter((p) => !existingPorts.includes(p));
    if (portsToAdd.length === 0) {
      handleInvalidInput();
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
    inputRef.current?.focus();
  };

  const handleClearAll = () => {
    scanSessionRef.current += 1;
    clearInvalidTimer();
    setInputValue("");
    setShowInvalidToast(false);
    setPortStates([]);
    setPortDetails([]);
    setPortKillMessages({});
    setError("");
  };

  const handleRescanAll = () => {
    const allPorts = portStates.map((ps) => ps.port);
    if (allPorts.length > 0) {
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

  const portDetailsRef = useRef<HTMLDivElement>(null);
  const [highlightPort, setHighlightPort] = useState<number | null>(null);

  const scrollToPort = (port: number) => {
    if (!portDetailsRef.current) return;
    const el = portDetailsRef.current.querySelector(`[data-port="${port}"]`);
    if (!el) {
      const cardEl = portDetailsRef.current.closest(".card");
      cardEl?.querySelector(".port-details-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightPort(port);
    setTimeout(() => setHighlightPort(null), 2000);
  };

  const occupiedCount = portDetails.filter((d) => !d.error && d.pids.length > 0).length;
  const displayedDetails = showEmptyPorts ? portDetails : portDetails.filter((d) => !d.error && d.pids.length > 0);

  const clearBtnClass = [
    "form-input-clear",
    inputValue.length > 0 ? " visible" : "",
    showInvalidToast ? " warning" : "",
  ].join("");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div className="card" style={{ flex: "0 0 40%", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 360 }}>
        <div className="card-title">{t("portManager.title")}</div>

        <div className="form-group" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <label className="form-label">{t("portManager.targetPorts")}</label>

          <div className="form-input-group">
            <div className="form-input-wrapper" style={{ maxWidth: "none", flex: 1, minWidth: 200 }}>
              <input
                ref={inputRef}
                type="text"
                className="form-input"
                style={{ paddingRight: 36 }}
                placeholder={t("portManager.placeholder")}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={killing}
                autoComplete="off"
              />
              <button
                className={clearBtnClass}
                onClick={handleClearInput}
                disabled={killing}
                aria-label="Clear input"
              >
                ✕
                {showInvalidToast && (
                  <span className="clear-bubble">
                    <span>⚠️</span>
                    <span>{t("portManager.invalidInput")}</span>
                  </span>
                )}
              </button>
            </div>
            <div className="form-input-buttons">
                <button
                  className="btn btn-primary"
                  onClick={handleScanClick}
                  disabled={!inputValue.trim() || killing}
                  style={{ minWidth: 120, justifyContent: "center" }}
                >
                  {isScanning ? (
                    <>
                      <span className="btn-spinner" />
                      {t("portManager.scanning")}
                    </>
                  ) : (
                    t("portManager.scanButton")
                  )}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleClearAll}
                  disabled={portStates.length === 0 || killing}
                  style={{ minWidth: 130 }}
                >
                  {portStates.length > 0 ? t("portManager.clearSelectedPortsCount", { count: portStates.length }) : t("portManager.clearSelectedPorts")}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
                <div className="common-ports-buttons" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {commonPorts.map((port) => (
                    <button
                      key={port}
                      className="btn btn-sm btn-secondary common-ports-btn"
                      onClick={() => addCommonPort(port)}
                      disabled={killing || portStates.some((ps) => ps.port === port)}
                    >
                      {port}
                    </button>
                  ))}
                </div>
            </div>

            <div className="port-chips-scroll" style={{ flex: 1, overflowY: "auto", marginTop: 8, minHeight: 0 }}>
              {portStates.length === 0 ? (
                <div className="chips-empty">
                  <p>{t("portManager.emptyChips")}</p>
                </div>
              ) : (
                <div className="port-chips">
                  {portStates.map((ps) => (
                    <span
                      key={ps.port}
                      className={`port-chip port-chip-${ps.status}`}
                      onClick={() => scrollToPort(ps.port)}
                      title={t("portManager.chipScrollTo", { port: ps.port })}
                      style={{ cursor: "pointer" }}
                    >
                      <span className={`port-chip-indicator port-chip-indicator-${ps.status}`} title={t(PORT_SCAN_STATUS_META[ps.status].labelKey)} />
                      <span className="port-chip-label">{ps.port}</span>
                      <button
                        className="port-chip-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePort(ps.port);
                        }}
                        title={t("portManager.removePort", { port: ps.port })}
                      >
                        ✕
                      </button>
                      <button
                        className="port-chip-rescan"
                        onClick={(e) => {
                          e.stopPropagation();
                          doScan([ps.port]);
                        }}
                        title={t("portManager.rescan")}
                      >
                        ↻
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="result-list" style={{ marginTop: 12 }}>
            <div className="result-item error" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="status-dot error" />
                {error}
              </div>
              <button
                className="port-chip-remove"
                onClick={() => setError("")}
                title={t("portManager.dismissError")}
                style={{ flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

      <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>
            {t("portManager.scanResultsTitle", { count: portDetails.length })}
            {portDetails.length > 0 && (
              <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
                {t("portManager.occupiedCount", { occupied: occupiedCount })}
              </span>
            )}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {portDetails.length > 0 && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setShowEmptyPorts(!showEmptyPorts)}
                title={showEmptyPorts ? t("portManager.hideEmpty") : t("portManager.showEmpty")}
                style={{ flexShrink: 0, minWidth: 110 }}
              >
                {showEmptyPorts ? t("portManager.hideEmpty") : t("portManager.showEmpty")}
              </button>
            )}
            {portDetails.length > 0 && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={handleRescanAll}
                disabled={isScanning || killing}
                title={t("portManager.rescanAll")}
                style={{ flexShrink: 0 }}
              >
                ↻
              </button>
            )}
            {portDetails.length > 0 && (
              <button
                className="btn btn-sm btn-danger"
                onClick={handleKillAll}
                disabled={killing || occupiedCount === 0}
                title={occupiedCount === 0 ? t("portManager.killAllDisabledHint") : t("portManager.killAllCommandHint")}
                style={{ flexShrink: 0, minWidth: 110 }}
              >
                {killing ? t("portManager.killing") : t("portManager.killAllButton")}
              </button>
            )}
          </div>
        </div>

        <div className="port-details-scroll" ref={portDetailsRef} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {portDetails.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔍</span>
              <p>{t("portManager.emptyResults")}</p>
            </div>
          ) : displayedDetails.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 20px" }}>
              <span className="empty-icon">🔍</span>
              <p>{t("portManager.emptyOnly")}</p>
            </div>
          ) : (
            <>
              {displayedDetails.map((detail) => (
              <div
                key={detail.port}
                data-port={detail.port}
                className={`port-process-card${highlightPort === detail.port ? " port-process-card-highlight" : ""}`}
              >
                {detail.error ? (
                  <div className="result-item info" style={{ marginBottom: 8 }}>
                    <span className="status-dot info" />
                    {t("portManager.port", { port: detail.port })}: {detail.error}
                  </div>
                ) : (
                  <>
                    <div className="port-process-header">
                      <div>
                        <span className="port-process-port">
                          {t("portManager.port", { port: detail.port })}
                        </span>
                        {detail.fingerprint && (
                          <span className={`fingerprint-badge fingerprint-${detail.fingerprint.category.toLowerCase().replace(/\./g, "")}`}>
                            <span>{detail.fingerprint.icon}</span>
                            <span>{detail.fingerprint.name}</span>
                          </span>
                        )}
                        {portKillMessages[detail.port] && (
                          <span className="port-kill-msg">
                            {portKillMessages[detail.port].join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="port-process-actions">
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => handleKillPort(detail.port, detail.pids[0])}
                          disabled={killing}
                          title={t("portManager.freePortHint", {
                            port: detail.port,
                            command: platformConfig.freePortCommandTemplate.replace("{{port}}", String(detail.port)),
                          })}
                        >
                          {t("portManager.killButton")}
                        </button>
                      </div>
                    </div>

                    <div className="process-tree">
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
    </div>
  );
}

export default PortManager;
