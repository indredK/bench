/**
 * Use Case / 用例层: coordinate business rules; 只编排业务规则.
 */
import type {
  KillPidResult,
  KillTarget,
  PortProcessDetail,
  ProcessChildrenPage,
} from "@/lib/tauri/types/port-manager"
import type { PortCheckResult } from "@/lib/tauri/types/system-settings"
import { portManagerRepository } from "@/features/port-manager/services/port-manager.repository"
import { canUseDesktopFeatures } from "@/platform/capabilities"

export const MAX_KILL_TARGETS = 100

export const portManagerUseCases = {
  MAX_KILL_TARGETS,

  isAvailable() {
    return canUseDesktopFeatures()
  },

  queryPortProcesses(ports: number[]): Promise<PortProcessDetail[]> {
    return portManagerRepository.queryPortProcesses(ports)
  },

  queryProcessChildren(
    pid: number,
    expectedPpid: number,
    expectedName: string,
    expectedIdentity: string | null,
    afterPid: number | null,
  ): Promise<ProcessChildrenPage> {
    return portManagerRepository.queryProcessChildren(
      pid,
      expectedPpid,
      expectedName,
      expectedIdentity,
      afterPid,
    )
  },

  killProcesses(targets: KillTarget[]): Promise<KillPidResult[]> {
    return portManagerRepository.killProcesses(targets)
  },

  /** v1.18 — 远程端口检测:对指定 host 的端口做 TCP 连通性检查。 */
  async portCheck(host: string, ports: number[]): Promise<PortCheckResult[]> {
    const results = await Promise.all(
      ports.map((port) => portManagerRepository.portCheck(host, port)),
    )
    return results
  },

  /** 将 PortCheckResult 映射为 PortProcessDetail(open 端口用 dummy pid 表示占用)。 */
  mapPortCheckToDetail(result: PortCheckResult): PortProcessDetail {
    return {
      port: result.port,
      // 远程模式下无法获取 PID;open=true 时用 [0] 占位以触发 isOccupied 判定。
      pids: result.open && !result.error ? [0] : [],
      process_trees: [],
      fingerprint: null,
      error: result.error,
    }
  },

  /**
   * Walk every focused process tree to map pid -> name, then pair each
   * requested pid with its observed name and opaque process identity. The backend
   * checks both values before sending SIGKILL to reject PID reuse.
   */
  buildKillTargets(pids: number[], portDetails: PortProcessDetail[]): KillTarget[] {
    const nameByPid = new Map<number, string>()
    const identityByPid = new Map<number, string | null>()
    const visit = (
      nodes: { pid: number; name: string; identity?: string | null; children?: unknown }[],
    ) => {
      for (const node of nodes) {
        if (!nameByPid.has(node.pid) && node.name) {
          nameByPid.set(node.pid, node.name)
        }
        if (!identityByPid.has(node.pid)) {
          identityByPid.set(node.pid, node.identity ?? null)
        } else if (identityByPid.get(node.pid) !== (node.identity ?? null)) {
          identityByPid.set(node.pid, null)
        }
        const children = (node as { children?: typeof nodes }).children
        if (children?.length) visit(children)
      }
    }
    for (const detail of portDetails) {
      visit(detail.process_trees)
    }
    const uniquePids = [...new Set(pids)]
    return uniquePids.map((pid) => ({
      pid,
      expected_name: nameByPid.get(pid) ?? null,
      expected_identity: identityByPid.get(pid) ?? null,
    }))
  },

  groupKillResultsByPort(
    results: KillPidResult[],
    portDetails: PortProcessDetail[],
  ): Record<number, KillPidResult[]> {
    const killResults: Record<number, KillPidResult[]> = {}

    for (const result of results) {
      for (const detail of portDetails) {
        if (detail.pids.includes(result.pid)) {
          killResults[detail.port] = [...(killResults[detail.port] || []), result]
        }
      }
    }

    return killResults
  },
}
