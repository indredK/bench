# Clean Space（存储空间清理）

代码：`src/features/clean-space/` · `src-tauri/src/clean_space/`

| 文档 | 说明 |
|------|------|
| [design.md](./design.md) | 技术设计文档 |
| [roadmap.md](./roadmap.md) | 迭代规划 |
| [audit-2026-07-09.md](./audit-2026-07-09.md) | 审计报告（2026-07-09） |

## 概述

Clean Space 是顶层存储清理模块，提供以下子工具：

- **存储总览** — 系统磁盘分类扫描 + 可视化
- **开发项目清理** — 嵌入 dev-cleaner 引擎，扫描/清理开发缓存
- **自定义文件夹清理** — 按规则扫描指定目录
- **清理记录** — 历史操作持久化

发布节奏：[release-themes.md](../../roadmap/release-themes.md)
