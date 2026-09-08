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

export type { ExtensionSummary }
