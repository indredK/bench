/**
 * Port history / 端口历史: localStorage-backed recent port list (max 10).
 */
import { useCallback } from "react";

const PORT_HISTORY_KEY = "port-manager.ports.history.v1";
const MAX_HISTORY = 10;

export function usePortHistory() {
  const readPortHistory = useCallback((): number[] => {
    try {
      const raw = localStorage.getItem(PORT_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x) => typeof x === "number" && Number.isFinite(x))
        : [];
    } catch {
      return [];
    }
  }, []);

  const pushPortsHistory = useCallback(
    (ports: number[]) => {
      if (ports.length === 0) return;
      try {
        const current = readPortHistory();
        const filtered = current.filter((p) => !ports.includes(p));
        const next = [...ports, ...filtered].slice(0, MAX_HISTORY);
        localStorage.setItem(PORT_HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* localStorage 不可用时静默忽略 */
      }
    },
    [readPortHistory]
  );

  return { readPortHistory, pushPortsHistory };
}
