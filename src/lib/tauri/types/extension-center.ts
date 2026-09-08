/**
 * Extension Center DTO / 插件中心 DTO: mirror Rust side; 与 Rust 侧一一对应.
 * 对应 `src-tauri/src/extension_host/commands.rs::ExtensionSummary` 与
 * `src-tauri/src/extension_host/market.rs`（P4 market）。
 */

/** 分发形态（与 Rust `ExtensionDistribution` 一致）。 */
export type ExtensionDistribution = "bundled" | "market"

/** 已安装插件摘要（Rust `ext_list_installed` 返回项）。 */
export interface ExtensionSummary {
  id: string
  version: string
  displayZh: string
  displayEn: string
  distribution: ExtensionDistribution
  enabled: boolean
  /** 宿主版本是否满足 manifest.engines.bench（不兼容时禁止打开）。 */
  compatible: boolean
}

/** market 单版本条目（Rust `MarketVersionDto`；**不含下载 URL** —— D-007 信任边界）。 */
export interface MarketVersionSummary {
  version: string
  enginesBench: string
  size: number
  publishedAt: string | null
  yanked: boolean
  /** 宿主版本是否满足 engines（不满足禁止安装）。 */
  compatible: boolean
  /** 已安装（版本一致）。 */
  installed: boolean
  /** 已装版本更低（可升级）。 */
  updateAvailable: boolean
}

/** market 插件条目（Rust `MarketExtensionDto`）。 */
export interface MarketExtensionSummary {
  id: string
  displayEn: string
  displayZh: string | null
  descriptionEn: string | null
  descriptionZh: string | null
  publisherName: string | null
  versions: MarketVersionSummary[]
}

/** 吊销命中（Rust `RevokedHitDto`；宿主已强制禁用，UI 显著警示）。 */
export interface RevokedHit {
  id: string
  version: string
  reason: string
}

/** 安装预览（Rust `MarketInstallPreview`；A4-1 信任披露数据源）。 */
export interface MarketInstallPreview {
  id: string
  version: string
  displayEn: string
  displayZh: string | null
  publisherName: string | null
  sizeBytes: number
  /** 产物 manifest 申请的宿主命令（ACL 披露）。 */
  aclCommands: string[]
}

/** market 列表（Rust `ext_market_list` 返回）。 */
export interface MarketListing {
  updatedAt: string | null
  extensions: MarketExtensionSummary[]
  revokedHits: RevokedHit[]
}

/** 插件诊断（Rust `ext_diagnostics` 返回；JSONL 尾部行）。 */
export interface ExtensionDiagnostics {
  audit: string[]
  runtime: string[]
}
