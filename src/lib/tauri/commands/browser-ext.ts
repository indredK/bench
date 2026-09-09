/**
 * Browser Extension / MCP 命令封装（bench-host 能力出口）。
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type {
  BrowserExtensionExport,
  BrowserExtensionStatus,
  McpInstallResult,
  McpTargetStatus,
} from "@/lib/tauri/types/browser-ext"

export function exportBrowserExtension(): Promise<BrowserExtensionExport> {
  return invokeTauriCommand(TAURI_COMMANDS.browserExt.export)
}

export function getBrowserExtensionStatus(): Promise<BrowserExtensionStatus> {
  return invokeTauriCommand(TAURI_COMMANDS.browserExt.status)
}

export function openBrowserExtensionsPage(browserId: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.browserExt.openExtensionsPage, { browserId })
}

export function getMcpTargetsStatus(): Promise<McpTargetStatus[]> {
  return invokeTauriCommand(TAURI_COMMANDS.browserExt.mcpTargetsStatus)
}

export function installMcpClients(clientIds: string[]): Promise<McpInstallResult[]> {
  return invokeTauriCommand(TAURI_COMMANDS.browserExt.mcpInstallClients, { clientIds })
}
