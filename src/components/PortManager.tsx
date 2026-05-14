import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";

interface KillPidResult {
  pid: number;
  success: boolean;
  message: string;
}

interface KillPortResult {
  port: number;
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

function PortManager() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");
  const [showInvalidToast, setShowInvalidToast] = useState(false);
  const [parsedPorts, setParsedPorts] = useState<number[]>([]);
  const [scanning, setScanning] = useState(false);
  const [portDetails, setPortDetails] = useState<PortProcessDetail[]>([]);
  const [killing, setKilling] = useState(false);
  const [results, setResults] = useState<KillPidResult[]>([]);
  const [killPortResults, setKillPortResults] = useState<KillPortResult[]>([]);
  const [error, setError] = useState("");

  const commonPorts = [3000, 5173, 1420, 8080, 5000, 4200, 8000, 4321, 6006, 1234, 9000];

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

  const doScan = async (ports: number[]) => {
    if (!isTauri()) {
      setError(t("portManager.browserError"));
      return;
    }
    setError("");
    setPortDetails([]);
    setResults([]);
    setKillPortResults([]);
    setScanning(true);
    try {
      const details: PortProcessDetail[] = await invoke("query_port_processes", { ports });
      setPortDetails(details);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to scan ports");
    } finally {
      setScanning(false);
    }
  };

  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (parsedPorts.length > 0) {
      doScan(parsedPorts);
    }
  }, [parsedPorts]);

  const removePort = (port: number) => {
    setParsedPorts((prev) => prev.filter((p) => p !== port));
    setPortDetails((prev) => prev.filter((d) => d.port !== port));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    setInputError("");

    if (/[^0-9,\-]/.test(raw)) {
      handleInvalidInput();
    } else {
      clearInvalidTimer();
      setShowInvalidToast(false);
    }
  };

  const parsePortsFromInput = (input: string): { ports: number[]; errors: string[] } => {
    const ports: Set<number> = new Set();
    const errors: string[] = [];
    const parts = input.split(",").map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes("-")) {
        const rangeParts = part.split("-");
        if (rangeParts.length !== 2) {
          errors.push(`Invalid range: "${part}"`);
          continue;
        }
        const [startStr, endStr] = rangeParts;
        if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
          errors.push(`Invalid range: "${part}"`);
          continue;
        }
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (start > end) {
          errors.push(`Invalid range: ${start} > ${end}`);
          continue;
        }
        if (start < 1 || end > 65535) {
          errors.push(`Ports must be between 1 and 65535`);
          continue;
        }
        for (let p = start; p <= end; p++) {
          ports.add(p);
        }
      } else {
        if (!/^\d+$/.test(part)) {
          errors.push(`Invalid port: "${part}"`);
          continue;
        }
        const port = parseInt(part, 10);
        if (port < 1 || port > 65535) {
          errors.push(`Port ${port} is out of range (1-65535)`);
          continue;
        }
        ports.add(port);
      }
    }

    return { ports: [...ports].sort((a, b) => a - b), errors };
  };

  const commitInput = () => {
    const val = inputValue.trim();
    if (!val) return;
    if (!/^[\d,\-]+$/.test(val)) {
      handleInvalidInput();
      return;
    }
    const { ports: newPorts, errors } = parsePortsFromInput(val);
    if (errors.length > 0) {
      setInputError(errors[0]);
      handleInvalidInput();
      return;
    }
    if (newPorts.length === 0) return;
    clearInvalidTimer();
    setShowInvalidToast(false);
    setInputValue("");
    let added = 0;
    for (const port of newPorts) {
      if (!parsedPorts.includes(port)) {
        setParsedPorts((prev) => [...prev, port].sort((a, b) => a - b));
        added++;
      }
    }
    if (added === 0) {
      setInputError("All ports already added");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitInput();
    }
    if (e.key === " " || e.key === "Space") {
      e.preventDefault();
      commitInput();
    }
    if (e.key === "Backspace" && inputValue.length === 0 && parsedPorts.length > 0) {
      removePort(parsedPorts[parsedPorts.length - 1]);
    }
  };

  const handleScanClick = () => {
    commitInput();
  };

  const addCommonPort = (port: number) => {
    if (port < 1 || port > 65535) return;
    setParsedPorts((prev) => {
      if (prev.includes(port)) return prev;
      return [...prev, port].sort((a, b) => a - b);
    });
  };

  const handleClear = () => {
    clearInvalidTimer();
    setInputValue("");
    setShowInvalidToast(false);
    setInputError("");
    setParsedPorts([]);
    setPortDetails([]);
    setResults([]);
    setKillPortResults([]);
    setError("");
    inputRef.current?.focus();
  };

  const handleKillPort = async (pid: number) => {
    setError("");
    setKilling(true);
    try {
      const result: KillPidResult[] = await invoke("kill_processes", { pids: [pid] });
      setResults((prev) => [...prev, ...result]);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to kill process");
    } finally {
      setKilling(false);
    }
  };

  const handleKillGroup = async (pid: number) => {
    setError("");
    setKilling(true);
    try {
      const result: KillPidResult[] = await invoke("kill_entire_group", { pid });
      setResults((prev) => [...prev, ...result]);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to kill process group");
    } finally {
      setKilling(false);
    }
  };

  const handleKillAll = async () => {
    setError("");
    setKilling(true);
    try {
      const allPids = portDetails.flatMap((d) => d.pids);
      const result: KillPidResult[] = await invoke("kill_processes", { pids: allPids });
      setResults((prev) => [...prev, ...result]);
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to kill processes");
    } finally {
      setKilling(false);
    }
  };

  const hasScanned = portDetails.length > 0;
  const hasResults = results.length > 0;
  const hasKillResults = killPortResults.length > 0;
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const killSuccessCount = killPortResults.filter((r) => r.success).length;
  const killFailCount = killPortResults.filter((r) => !r.success).length;
  const showInputError = inputError.length > 0;

  const clearBtnClass = [
    "form-input-clear",
    (inputValue.length > 0 || parsedPorts.length > 0) ? " visible" : "",
    showInvalidToast ? " warning" : "",
  ].join("");

  return (
    <div>
      <div className="card">
        <div className="card-title">{t("portManager.title")}</div>

        <div className="form-group">
          <label className="form-label">{t("portManager.targetPorts")}</label>

          <div className="form-input-group">
            <div className="form-input-wrapper" style={{ maxWidth: "none", flex: 1, minWidth: 200 }}>
              <input
                ref={inputRef}
                type="text"
                className={`form-input${showInputError ? " has-error" : ""}`}
                style={{ paddingRight: 36 }}
                placeholder={t("portManager.placeholder")}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={scanning || killing}
                autoComplete="off"
              />
              <button
                className={clearBtnClass}
                onClick={handleClear}
                disabled={scanning || killing}
                aria-label="Clear input"
              >
                ✕
                {showInvalidToast && (
                  <span className="clear-bubble">
                    <span>⚠️</span>
                    <span>Only digits, commas, and hyphens allowed</span>
                  </span>
                )}
              </button>
            </div>
            <div className="form-input-buttons">
              <button
                className="btn btn-primary"
                onClick={handleScanClick}
                disabled={!inputValue.trim() || scanning || killing}
                style={{ minWidth: 120, justifyContent: "center" }}
              >
                {scanning ? (
                  <>
                    <span className="btn-spinner" />
                    {t("portManager.scanning")}
                  </>
                ) : (
                  t("portManager.scanButton")
                )}
              </button>
            </div>
          </div>

          {showInputError && (
            <p className="form-hint" style={{ color: "var(--error-color)", marginTop: 4 }}>
              {inputError}
            </p>
          )}

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div className="common-ports-label">
                {(t as (s: string) => string)("portManager.targetPorts") === "Target Port(s)" ? "Quick Add:" : "快速添加:"}
              </div>
              <div className="common-ports-buttons" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {commonPorts.map((port) => (
                  <button
                    key={port}
                    className="btn btn-sm btn-secondary"
                    onClick={() => addCommonPort(port)}
                    disabled={scanning || killing || parsedPorts.includes(port)}
                  >
                    {port}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {parsedPorts.length > 0 && (
            <div className="port-chips" style={{ marginTop: 12 }}>
              {parsedPorts.map((port) => (
                <span key={port} className="port-chip">
                  <span>{port}</span>
                  <button
                    className="port-chip-remove"
                    onClick={() => removePort(port)}
                    disabled={scanning || killing}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <span className="port-chips-count">{parsedPorts.length} port{parsedPorts.length > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="result-list" style={{ marginTop: 12 }}>
            <div className="result-item error">
              <span className="status-dot error" />
              {error}
            </div>
          </div>
        )}
      </div>

      {hasKillResults && (
        <div className="card">
          <div className="card-title">
            {t("portManager.results", { success: killSuccessCount, failed: killFailCount })}
          </div>
          <div className="result-list">
            {killPortResults.map((r) => (
              <div
                key={r.port}
                className={`result-item ${r.success ? "success" : "error"}`}
              >
                <span className={`status-dot ${r.success ? "success" : "error"}`} />
                <strong>{t("portManager.port", { port: r.port })}:</strong> {r.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasScanned && (
        <div className="card">
          <div className="card-title">
            {t("portManager.scanResultsTitle", { count: portDetails.length })}
          </div>

          {portDetails.length > 0 && (
            <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
              <button
                className="btn btn-danger"
                onClick={handleKillAll}
                disabled={killing}
              >
                {killing ? t("portManager.killing") : t("portManager.killAllButton")}
              </button>
            </div>
          )}

          {portDetails.map((detail) => (
            <div key={detail.port} className="port-process-card">
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
                        <span className={`fingerprint-badge fingerprint-${detail.fingerprint.category.toLowerCase()}`}>
                          <span>{detail.fingerprint.icon}</span>
                          <span>{detail.fingerprint.name}</span>
                        </span>
                      )}
                    </div>
                    <div className="port-process-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleKillPort(detail.pids[0])}
                        disabled={killing}
                      >
                        {t("portManager.killButton")}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleKillGroup(detail.pids[0])}
                        disabled={killing}
                      >
                        {t("portManager.killGroupButton")}
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
        </div>
      )}

      {hasResults && (
        <div className="card">
          <div className="card-title">
            {t("portManager.killResultsTitle", { success: successCount, failed: failCount })}
          </div>
          <div className="result-list">
            {results.map((r) => (
              <div
                key={`${r.pid}-${r.success}`}
                className={`result-item ${r.success ? "success" : "error"}`}
              >
                <span className={`status-dot ${r.success ? "success" : "error"}`} />
                <strong>{t("portManager.pid", { pid: r.pid })}:</strong> {r.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PortManager;
