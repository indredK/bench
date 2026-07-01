/**
 * Quick login history / 快速登录历史: localStorage-backed recent URL list (max 5).
 */
import { useCallback } from "react";

const QUICK_LOGIN_HISTORY_KEY = "account-manager.quick-login.history.v1";

export function useQuickLoginHistory() {
  const readQuickLoginHistory = useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(QUICK_LOGIN_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, []);

  const pushQuickLoginHistory = useCallback(
    (url: string) => {
      try {
        const current = readQuickLoginHistory().filter((u) => u !== url);
        const next = [url, ...current].slice(0, 5);
        localStorage.setItem(QUICK_LOGIN_HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* localStorage 不可用时静默忽略 */
      }
    },
    [readQuickLoginHistory]
  );

  return { readQuickLoginHistory, pushQuickLoginHistory };
}
