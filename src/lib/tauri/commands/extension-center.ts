/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type { ExtensionSummary } from "@/lib/tauri/types/extension-center"

export function listInstalledExtensions() {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.listInstalled)
}

export function openExtension(extensionId: string, locale: string) {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.open, { extensionId, locale })
}

export function setExtensionEnabled(extensionId: string, enabled: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.setEnabled, { extensionId, enabled })
}

export function uninstallExtension(extensionId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.uninstall, { extensionId })
}

/**
 * 获取调用方插件窗口的私有数据目录（`$APPDATA/extension-data/<id>/`，spec §9.3）。
 *
 * 仅供 `ext-` 前缀窗口调用：目录从窗口 label 推导，宿主拒绝非插件窗口。
 * 插件 SDK（P4.5 `@bench/ext-sdk`）将封装此命令。
 */
export function getExtensionDataDir() {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.dataDir)
}

export type { ExtensionSummary }
