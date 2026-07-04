/**
 * IPC Commands / 通信命令: bootstrap handshake; 只封装启动握手调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import { canUseTauriCommands } from "@/platform/capabilities"
import type { StartupIssue } from "@/lib/tauri/types/bootstrap"

export function markMainReady() {
  if (!canUseTauriCommands()) return Promise.resolve()
  return invokeTauriCommand(TAURI_COMMANDS.bootstrap.markMainReady)
}

export function isMainReady() {
  if (!canUseTauriCommands()) return Promise.resolve(false)
  return invokeTauriCommand(TAURI_COMMANDS.bootstrap.isMainReady)
}

export function listStartupIssues(): Promise<StartupIssue[]> {
  if (!canUseTauriCommands()) return Promise.resolve([])
  return invokeTauriCommand(TAURI_COMMANDS.bootstrap.listStartupIssues)
}
