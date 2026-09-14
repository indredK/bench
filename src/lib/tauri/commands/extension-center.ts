/**
 * Extension Center IPC / 插件中心命令封装.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type {
  ExtensionDiagnostics,
  ExtensionSummary,
  HostCapability,
  MarketInstallPreview,
  MarketListing,
} from "@/lib/tauri/types/extension-center"

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

/** 浏览 market（canonical registry 由后端配置；renderer 不提交下载地址）。 */
export function listMarketExtensions() {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.marketList)
}

/**
 * 安装第一步：下载 → 全量校验 → 解压到预览目录，返回 ACL 披露信息。
 * 用户在信任弹窗确认后调 `commitMarketInstall` 完成落位（spec §6.1 / A4-1）。
 */
export function prepareMarketInstall(extensionId: string, version: string) {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.marketPrepare, { extensionId, version })
}

/** 安装第二步（信任确认后）：重校验 → 版本单调 → 原子落位。 */
export function commitMarketInstall(extensionId: string, version: string) {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.marketCommit, { extensionId, version })
}

/** 读取插件子系统诊断（审计日志 + 运行时错误尾部）。 */
export function getExtensionDiagnostics() {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.diagnostics)
}

/**
 * 返回宿主开放给插件空间的 IPC 命令清单（能力面快照，spec §9.4）。
 *
 * 插件可在运行时拉取后校验自身 `acl.commands`，避免依赖仓库同目录或
 * 试错式调用。命令名集合即 `EXTENSION_ALLOWED_COMMANDS` 的只读视图。
 */
export function getExtensionCapabilities(): Promise<HostCapability> {
  return invokeTauriCommand(TAURI_COMMANDS.extensionHost.capabilities)
}

export type {
  ExtensionSummary,
  MarketListing,
  MarketInstallPreview,
  ExtensionDiagnostics,
  HostCapability,
}
