/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type { ProjectInfo } from "@/lib/tauri/types/dev-cleaner"

export function scanDevProjects(rootPath: string) {
  return invokeTauriCommand(TAURI_COMMANDS.devCleaner.scanDevProjects, { rootPath })
}

export function stopDevProjectScan() {
  return invokeTauriCommand(TAURI_COMMANDS.devCleaner.stopScan)
}

export function cleanupProjects(projects: ProjectInfo[]) {
  return invokeTauriCommand(TAURI_COMMANDS.devCleaner.cleanupProjects, { projects })
}

export function getCustomCleanupCommands() {
  return invokeTauriCommand(TAURI_COMMANDS.devCleaner.getCustomCleanupCommands)
}

export function executeCustomCleanup(commandIds: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.devCleaner.executeCustomCleanup, { commandIds })
}

export function stopCustomCleanup() {
  return invokeTauriCommand(TAURI_COMMANDS.devCleaner.stopCustomCleanup)
}
