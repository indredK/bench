# Integrations（跨端接入）

代码：`src/features/integrations/` · 后端复用 `src-tauri/src/browser_ext/` 与 `src-tauri/src/extension_host/market.rs` 中的原生应用命令（IPC 契约不变）。

定位：Bench 与「桌面应用之外」的连接，三块互相独立、都**不是 Bench 插件**：

| 区块             | 内容                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| 浏览器扩展       | 导出 bench-companion、注册 Native Messaging、打开各浏览器扩展管理页                 |
| AI 客户端（MCP） | 探测本机 MCP 客户端，一键写入 bench-host 配置（保留既有配置，写入前备份）           |
| 自用原生应用     | 私有仓库 `indredK/bench-native-apps` 的 macOS CI Artifact，宿主校验后安装/打开/卸载 |

> 这三块原先挤在插件中心里（2026-11-03 拆出，见 [D-043](../../explanation/decisions.md)）。插件中心现在只管 Bench 插件。

| 文档                       | 说明   |
| -------------------------- | ------ |
| [roadmap.md](./roadmap.md) | 路线图 |
