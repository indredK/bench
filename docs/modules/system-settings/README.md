# System Settings（系统设置）

> **完备功能规格** → [product-specs/system-settings.md](../../product-specs/system-settings.md)
> **规划功能** → [planned/system-settings.md](../../planned/system-settings.md)

代码：`src/features/system-settings/` · `src-tauri/src/system_settings/`

定位：提供**受控的系统开关、快捷入口、设置搜索和应用授权**——不直接复制 macOS 系统设置，只做「常用且可可靠读回」的设置（仅 macOS，Windows 隐藏）。

| 文档                       | 说明                               |
| -------------------------- | ---------------------------------- |
| [design.md](./design.md)   | 平台、权限和键位映射约束           |
| [roadmap.md](./roadmap.md) | 实施路线（未完成项已归入 planned） |

全局顺序：[2.0 最终路线图](../../ROADMAP.md)
