/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 * Clean Space 命令封装。
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type {
  CleanupRecord,
  CleanupItemInput,
  CategoryCleanupResult,
} from "@/lib/tauri/types/clean-space"

export function scanStorageOverview() {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.scanStorageOverview)
}

export function scanStorageStream() {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.scanStorageStream)
}

export function getCategoryItems(categoryId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.getCategoryItems, { categoryId })
}

export function executeCategoryCleanup(items: CleanupItemInput[]): Promise<CategoryCleanupResult> {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.executeCategoryCleanup, {
    items,
  }) as Promise<CategoryCleanupResult>
}

export function scanCustomFolder(folder: string, mtimeDays?: number, includeSubfolders?: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.scanCustomFolder, {
    folder,
    mtimeDays,
    includeSubfolders,
  })
}

export function openSystemStorageSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.openSystemStorageSettings)
}

export function getCleanupRecords() {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.getCleanupRecords)
}

export function addCleanupRecord(record: CleanupRecord) {
  return invokeTauriCommand(TAURI_COMMANDS.cleanSpace.addCleanupRecord, { record })
}
