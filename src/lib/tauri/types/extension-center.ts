/**
 * Extension Center DTO / 插件中心 DTO: mirror Rust side; 与 Rust 侧一一对应.
 * 对应 `src-tauri/src/extension_host/commands.rs::ExtensionSummary`。
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
}
