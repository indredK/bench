/**
 * Use Case / 用例层: coordinate business rules; 只编排业务规则.
 */
import type { KillPidResult, KillTarget, PortProcessDetail } from "@/lib/tauri/types/port-manager";
import { portManagerRepository } from "@/features/port-manager/services/port-manager.repository";
import { canUseDesktopFeatures } from "@/platform/capabilities";

export const portManagerUseCases = {
  isAvailable() {
    return canUseDesktopFeatures();
  },

  queryPortProcesses(ports: number[]): Promise<PortProcessDetail[]> {
    return portManagerRepository.queryPortProcesses(ports);
  },

  killProcesses(targets: KillTarget[]): Promise<KillPidResult[]> {
    return portManagerRepository.killProcesses(targets);
  },

  /**
   * Walk every focused process tree to map pid -> name, then pair each
   * requested pid with the name we observed at scan time. The backend uses
   * the expected_name to reject PID-reuse mismatches before sending SIGKILL.
   */
  buildKillTargets(pids: number[], portDetails: PortProcessDetail[]): KillTarget[] {
    const nameByPid = new Map<number, string>();
    const visit = (nodes: { pid: number; name: string; children?: unknown }[]) => {
      for (const node of nodes) {
        if (!nameByPid.has(node.pid) && node.name) {
          nameByPid.set(node.pid, node.name);
        }
        const children = (node as { children?: typeof nodes }).children;
        if (children?.length) visit(children);
      }
    };
    for (const detail of portDetails) {
      visit(detail.process_trees);
    }
    return pids.map((pid) => ({ pid, expected_name: nameByPid.get(pid) ?? null }));
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
