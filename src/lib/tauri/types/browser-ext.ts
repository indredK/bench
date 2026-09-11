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
  /** 本次导出的扩展版本（弹窗/toast 提示用）。 */
  extensionVersion: string
}

/** 导出/注册状态（Rust `BrowserExtStatus`）。 */
export interface BrowserExtensionStatus {
  exported: boolean
  extensionDir: string
  extensionId: string
  /** 扩展版本（来自内嵌 manifest；与浏览器已加载版本核对）。 */
  extensionVersion: string
  hostBinFound: boolean
  hostBinPath: string
  nmRegistrations: NmRegistration[]
  browsers: BrowserInfo[]
  /** 浏览器扩展本地桥是否已就绪：扩展把会话交回 Bench 的唯一通道。 */
  bridgeReady: boolean
  /** 本地桥端口（未就绪时为 null）。 */
  bridgePort: number | null
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
