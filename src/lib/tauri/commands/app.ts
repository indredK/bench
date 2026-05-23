/**
 * IPC Commands / 通信命令: app lifecycle bridge only; 只封装应用生命周期调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export function restartApp() {
  return invokeTauriCommand(TAURI_COMMANDS.updater.restartAfterUpdate);
}
