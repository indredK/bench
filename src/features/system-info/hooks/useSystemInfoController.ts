/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { systemInfoUseCases } from "@/features/system-info/services/system-info.use-cases";
import { useSystemInfoStore } from "@/features/system-info/store";
import { registerFeatureRefresh } from "@/features/refresh";

export function useSystemInfoController(active: boolean) {
  const { t } = useTranslation();

  const loading = useSystemInfoStore((s) => s.loading);
  const systemInfo = useSystemInfoStore((s) => s.systemInfo);
  const error = useSystemInfoStore((s) => s.error);
  const fetched = useSystemInfoStore((s) => s.fetched);
  const reset = useSystemInfoStore((s) => s.reset);

  const loadSystemInfo = useCallback(async () => {
    useSystemInfoStore.setState({ loading: true, error: "" });
    try {
      const info = await systemInfoUseCases.loadSystemInfo();
      useSystemInfoStore.setState({ systemInfo: info, loading: false, fetched: true });
    } catch (error) {
      useSystemInfoStore.setState({
        error: typeof error === "string" ? error : "Failed to load system info",
        loading: false,
        fetched: true,
      });
    }
  }, []);

  useEffect(() => reset, [reset]);

  useEffect(() => {
    if (active && !fetched) {
      void loadSystemInfo();
    }
  }, [active, fetched, loadSystemInfo]);

  useEffect(() => registerFeatureRefresh("system-info", loadSystemInfo), [loadSystemInfo]);

  return {
    t,
    loading,
    systemInfo,
    error,
    fetched,
    loadSystemInfo,
  };
}

export type SystemInfoController = ReturnType<typeof useSystemInfoController>;
