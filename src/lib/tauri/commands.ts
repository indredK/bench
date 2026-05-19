import { invoke } from "@tauri-apps/api/core";
import type {
  CleanupResult,
  EnvTool,
  KillPidResult,
  PortProcessDetail,
  ProjectInfo,
  ScanResult,
  SystemInfoData,
} from "@/lib/tauri/types";

export function queryPortProcesses(ports: number[]) {
  return invoke<PortProcessDetail[]>("query_port_processes", { ports });
}

export function killProcesses(pids: number[]) {
  return invoke<KillPidResult[]>("kill_processes", { pids });
}

export function scanDevProjects(rootPath: string) {
  return invoke<ScanResult>("scan_dev_projects", { rootPath });
}

export function stopDevProjectScan() {
  return invoke<void>("stop_scan");
}

export function cleanupProjects(projects: ProjectInfo[]) {
  return invoke<CleanupResult>("cleanup_projects", { projects });
}

export function getSystemInfo() {
  return invoke<SystemInfoData>("get_system_info");
}

export function detectEnvTools() {
  return invoke<void>("detect_env_tools");
}

export type { EnvTool };

