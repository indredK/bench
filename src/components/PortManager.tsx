import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";

interface KillResult {
  port: number;
  success: boolean;
  message: string;
}

function PortManager() {
  const { t } = useTranslation();
  const [portInput, setPortInput] = useState("");
  const [parsedPorts, setParsedPorts] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KillResult[]>([]);
  const [error, setError] = useState("");

  const commonPorts = [3000, 5173, 1420, 8080, 5000, 4200, 8000, 4321, 6006, 1234, 9000];

  const parsePorts = (input: string, throwOnError = true): number[] => {
    const trimmed = input.trim();
    if (!trimmed) return [];

    const ports: number[] = [];
    const parts = trimmed.split(/[,，\s]+/);

    for (const part of parts) {
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        if (isNaN(start) || isNaN(end)) {
          if (throwOnError) throw new Error(`Invalid range: "${part}"`);
          continue;
        }
        if (start > end) {
          if (throwOnError) throw new Error(`Invalid range: start (${start}) > end (${end})`);
          continue;
        }
        if (start < 1 || end > 65535) {
          if (throwOnError) throw new Error(`Ports must be between 1 and 65535`);
          continue;
        }

        for (let p = start; p <= end; p++) {
          ports.push(p);
        }
      } else {
        const port = parseInt(part, 10);
        if (isNaN(port)) {
          if (throwOnError) throw new Error(`Invalid port number: "${part}"`);
          continue;
        }
        if (port < 1 || port > 65535) {
          if (throwOnError) throw new Error(`Port must be between 1 and 65535: ${port}`);
          continue;
        }
        ports.push(port);
      }
    }

    if (ports.length === 0 && throwOnError) {
      throw new Error("Please enter at least one valid port number");
    }

    return ports;
  };

  const handleInputChange = (value: string) => {
    setPortInput(value);
    setError("");
    try {
      const ports = parsePorts(value, false);
      setParsedPorts(ports);
    } catch {
      setParsedPorts([]);
    }
  };

  const addCommonPort = (port: number) => {
    const currentPorts = parsePorts(portInput, false);
    if (!currentPorts.includes(port)) {
      const newValue = portInput.trim() ? `${portInput.trim()} ${port}` : `${port}`;
      handleInputChange(newValue);
    }
  };

  const handleKillPorts = async () => {
    setError("");
    setResults([]);

    if (!isTauri()) {
      setError(t("portManager.browserError"));
      return;
    }

    let ports: number[];
    try {
      ports = parsePorts(portInput);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
      return;
    }

    setLoading(true);

    try {
      const result: KillResult[] = await invoke("kill_ports", { ports });
      setResults(result);
    } catch (e) {
      setError(typeof e === "string" ? e : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleKillPorts();
    }
  };

  const groupPorts = (ports: number[]): string[] => {
    if (ports.length === 0) return [];
    
    const sorted = [...ports].sort((a, b) => a - b);
    const groups: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        groups.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    groups.push(start === end ? `${start}` : `${start}-${end}`);
    
    return groups;
  };

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div>
      <div className="card">
        <div className="card-title">{t("portManager.title")}</div>
        
        <div className="form-group">
          <label className="form-label">{t("portManager.targetPorts")}</label>
          <input
            type="text"
            className="form-input"
            placeholder={t("portManager.placeholder")}
            value={portInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <p className="form-hint">{t("portManager.hint")}</p>
        </div>

        {parsedPorts.length > 0 && (
          <div className="port-preview" style={{ marginBottom: 16 }}>
            <div className="port-preview-label">将要终止的端口 ({parsedPorts.length} 个):</div>
            <div className="port-tags">
              {groupPorts(parsedPorts).map((group, index) => (
                <span key={index} className="port-tag">
                  {group}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="common-ports" style={{ marginBottom: 16 }}>
          <div className="common-ports-label">常用端口:</div>
          <div className="common-ports-buttons">
            {commonPorts.map((port) => (
              <button
                key={port}
                className="btn btn-sm btn-secondary"
                onClick={() => addCommonPort(port)}
                disabled={loading || parsedPorts.includes(port)}
              >
                {port}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-danger"
          onClick={handleKillPorts}
          disabled={loading || parsedPorts.length === 0}
        >
          {loading ? t("portManager.killing") : t("portManager.killButton")}
        </button>

        {error && (
          <div className="result-list" style={{ marginTop: 12 }}>
            <div className="result-item error">
              <span className="status-dot error" />
              {error}
            </div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="card-title">
            {t("portManager.results", { success: successCount, failed: failCount })}
          </div>
          <ul className="result-list">
            {results.map((r) => (
              <li
                key={r.port}
                className={`result-item ${r.success ? "success" : "error"}`}
              >
                <span
                  className={`status-dot ${r.success ? "success" : "error"}`}
                />
                <strong>{t("portManager.port", { port: r.port })}:</strong> {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PortManager;