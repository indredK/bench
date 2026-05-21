import { invoke } from "@tauri-apps/api/core";
import type {
  KillPidResult,
  PortProcessDetail,
} from "@/lib/tauri/types/port-manager";

export function queryPortProcesses(ports: number[]) {
  return invoke<PortProcessDetail[]>("query_port_processes", { ports });
}

export function killProcesses(pids: number[]) {
  return invoke<KillPidResult[]>("kill_processes", { pids });
}
