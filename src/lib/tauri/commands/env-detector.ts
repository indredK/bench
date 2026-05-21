/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export function detectEnvTools() {
  return invokeTauriCommand(TAURI_COMMANDS.envDetector.detectEnvTools);
}
