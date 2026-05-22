/**
 * IPC Commands / 通信命令: updater bridge only; 只封装更新相关调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export function checkForAppUpdate() {
  return invokeTauriCommand(TAURI_COMMANDS.updater.checkForAppUpdate);
}

export function downloadAndInstallAppUpdate() {
  return invokeTauriCommand(TAURI_COMMANDS.updater.downloadAndInstallAppUpdate);
}

export function restartAfterUpdate() {
  return invokeTauriCommand(TAURI_COMMANDS.updater.restartAfterUpdate);
}

export function getCurrentAppVersion() {
  return invokeTauriCommand(TAURI_COMMANDS.updater.getCurrentAppVersion);
}
