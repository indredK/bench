import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface KillResult {
  port: number;
  success: boolean;
  message: string;
}

function PortManager() {
  const [portInput, setPortInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KillResult[]>([]);
  const [error, setError] = useState("");

  const parsePorts = (input: string): number[] => {
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
          throw new Error(`Invalid range: "${part}"`);
        }
        if (start > end) {
          throw new Error(`Invalid range: start (${start}) > end (${end})`);
        }
        if (start < 1 || end > 65535) {
          throw new Error(`Ports must be between 1 and 65535`);
        }

        for (let p = start; p <= end; p++) {
          ports.push(p);
        }
      } else {
        const port = parseInt(part, 10);
        if (isNaN(port)) {
          throw new Error(`Invalid port number: "${part}"`);
        }
        if (port < 1 || port > 65535) {
          throw new Error(`Port must be between 1 and 65535: ${port}`);
        }
        ports.push(port);
      }
    }

    if (ports.length === 0) {
      throw new Error("Please enter at least one valid port number");
    }

    return ports;
  };

  const handleKillPorts = async () => {
    setError("");
    setResults([]);

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

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div>
      <div className="card">
        <div className="card-title">Kill Port Processes</div>
        <div className="form-group">
          <label className="form-label">Target Port(s)</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. 3000 or 3000-4000 or 3000,8080,9000-9010"
            value={portInput}
            onChange={(e) => {
              setPortInput(e.target.value);
              setError("");
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <p className="form-hint">
            Supports single port, range (e.g. 3000-4000), or comma-separated
            combinations
          </p>
        </div>

        <button
          className="btn btn-danger"
          onClick={handleKillPorts}
          disabled={loading || !portInput.trim()}
        >
          {loading ? "⏳ Killing..." : "🔌 End Port Process(es)"}
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
            Results — {successCount} succeeded, {failCount} failed
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
                <strong>Port {r.port}:</strong> {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PortManager;