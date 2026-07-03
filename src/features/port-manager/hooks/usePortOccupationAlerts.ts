/**
 * Port occupation alerts / 端口占用告警: 30s 轮询检测 free → occupied 转换并发送系统通知。
 * 告警在 local/remote 模式都生效;首次轮询只建立 baseline,不发送通知。
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { portManagerUseCases } from "@/features/port-manager/services/port-manager.use-cases";
import { usePortManagerStore } from "@/features/port-manager/store";
import { canUseDesktopFeatures } from "@/platform/capabilities";

const POLL_INTERVAL_MS = 30_000;

export function usePortOccupationAlerts() {
  const { t } = useTranslation();
  const alertsEnabled = usePortManagerStore((s) => s.alertsEnabled);
  const prevOccupiedRef = useRef<Set<number>>(new Set());
  const isFirstPollRef = useRef(true);

  useEffect(() => {
    if (!alertsEnabled || !canUseDesktopFeatures()) return;

    isFirstPollRef.current = true;
    prevOccupiedRef.current = new Set();

    const poll = async () => {
      const { portStates, scanMode, remoteHost } = usePortManagerStore.getState();
      const ports = portStates.map((ps) => ps.port);
      if (ports.length === 0) return;

      let occupiedPorts: number[] = [];
      try {
        if (scanMode === "remote") {
          const host = remoteHost.trim();
          if (!host) return;
          const results = await portManagerUseCases.portCheck(host, ports);
          occupiedPorts = results
            .filter((r) => r.open && !r.error)
            .map((r) => r.port);
        } else {
          const details = await portManagerUseCases.queryPortProcesses(ports);
          occupiedPorts = details
            .filter((d) => !d.error && d.pids.length > 0)
            .map((d) => d.port);
        }
      } catch {
        return;
      }

      const prevOccupied = prevOccupiedRef.current;
      const currentOccupied = new Set(occupiedPorts);

      if (isFirstPollRef.current) {
        isFirstPollRef.current = false;
      } else {
        for (const port of occupiedPorts) {
          if (!prevOccupied.has(port)) {
            try {
              sendNotification({
                title: t("portManager.occupationAlertTitle"),
                body: t("portManager.occupationAlertBody", { port }),
              });
            } catch {
              /* 权限拒绝或环境不支持时静默忽略 */
            }
          }
        }
      }
      prevOccupiedRef.current = currentOccupied;
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [alertsEnabled, t]);
}
