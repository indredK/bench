import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export function queryPortProcesses(ports: number[]) {
  return invokeTauriCommand(TAURI_COMMANDS.portManager.queryPortProcesses, { ports });
}

export function killProcesses(pids: number[]) {
  return invokeTauriCommand(TAURI_COMMANDS.portManager.killProcesses, { pids });
}
