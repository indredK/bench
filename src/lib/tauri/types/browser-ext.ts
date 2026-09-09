/**
 * Browser Extension / MCP DTO: mirror Rust side; 与 Rust 侧一一对应.
 * 对应 `src-tauri/src/browser_ext/mod.rs` 与 `browser_ext/commands.rs`。
 */

/** 单个浏览器的 NM 注册结果（Rust `NmRegistration`）。 */
export interface NmRegistration {
  browser: string
  manifestPath: string
  registered: boolean
}

/** 本机浏览器探测（Rust `BrowserInfo`）。 */
export interface BrowserInfo {
  id: string
  name: string
  installed: boolean
}

/** 一键导出结果（Rust `ExportResult`）。 */
export interface BrowserExtensionExport {
  extensionDir: string
  wrapperPath: string
  hostBinPath: string
  nmRegistrations: NmRegistration[]
  browsers: BrowserInfo[]
  extensionId: string
}

/** 导出/注册状态（Rust `BrowserExtStatus`）。 */
export interface BrowserExtensionStatus {
  exported: boolean
  extensionDir: string
  extensionId: string
  hostBinFound: boolean
  hostBinPath: string
  nmRegistrations: NmRegistration[]
  browsers: BrowserInfo[]
}

/** MCP 客户端探测（Rust `McpTargetStatus`）。 */
export interface McpTargetStatus {
  id: string
  name: string
  configPath: string
  installedHint: boolean
  benchConfigured: boolean
}

/** MCP 配置写入结果（Rust `McpInstallResult`）。 */
export interface McpInstallResult {
  targetId: string
  configPath: string
  installed: boolean
  alreadyUpToDate: boolean
  backupPath: string | null
  message: string
}
