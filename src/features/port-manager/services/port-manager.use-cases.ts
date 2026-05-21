import type { KillPidResult, PortProcessDetail } from "@/lib/tauri/types/port-manager";
import { portManagerRepository } from "@/features/port-manager/services/port-manager.repository";
import { canUseDesktopFeatures } from "@/platform/capabilities";

export const portManagerUseCases = {
  isAvailable() {
    return canUseDesktopFeatures();
  },

  queryPortProcesses(ports: number[]): Promise<PortProcessDetail[]> {
    return portManagerRepository.queryPortProcesses(ports);
  },

  killProcesses(pids: number[]): Promise<KillPidResult[]> {
    return portManagerRepository.killProcesses(pids);
  },

  createKillMessages(results: KillPidResult[]): string[] {
    return results.map((result) =>
      result.success ? `PID ${result.pid} killed` : `PID ${result.pid}: ${result.message}`
    );
  },

  groupKillMessagesByPort(
    results: KillPidResult[],
    portDetails: PortProcessDetail[]
  ): Record<number, string[]> {
    const killMessages: Record<number, string[]> = {};

    for (const result of results) {
      const message = result.success
        ? `PID ${result.pid} killed`
        : `PID ${result.pid}: ${result.message}`;
      const detail = portDetails.find((item) => item.pids.includes(result.pid));
      if (detail) {
        killMessages[detail.port] = [...(killMessages[detail.port] || []), message];
      }
    }

    return killMessages;
  },
};
