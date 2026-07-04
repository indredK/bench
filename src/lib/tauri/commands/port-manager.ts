/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type { KillTarget } from "@/lib/tauri/types/port-manager"

export function queryPortProcesses(ports: number[]) {
  return invokeTauriCommand(TAURI_COMMANDS.portManager.queryPortProcesses, { ports })
}

export function killProcesses(targets: KillTarget[]) {
  return invokeTauriCommand(TAURI_COMMANDS.portManager.killProcesses, { targets })
}
