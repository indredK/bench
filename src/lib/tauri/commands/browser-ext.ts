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

/**
 * 导出 bench-companion 扩展（宿主弹原生目录选择器让用户选位置，并记住上次位置）。
 *
 * 返回 `null` 表示用户取消了选择 —— 不是失败，调用方不得报错、也不得继续去
 * 打开浏览器扩展管理页。路径只由宿主决定，renderer 无法指定任意目录。
 */
export function exportBrowserExtension(): Promise<BrowserExtensionExport | null> {
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
