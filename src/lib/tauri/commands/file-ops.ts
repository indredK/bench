/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"

export function writeTextFile(path: string, content: string) {
  return invokeTauriCommand(TAURI_COMMANDS.fileOps.writeTextFile, { path, content })
}
