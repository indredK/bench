# Dev Toolbox（开发工具箱）

> **完备功能规格** → [product-specs/dev-toolbox.md](../../product-specs/dev-toolbox.md)
> **规划功能** → [planned/dev-toolbox.md](../../planned/dev-toolbox.md)

代码：`src/features/dev-toolbox/`（后端命令复用 `src-tauri/src/system_settings/`）

定位：开发者常用小工具聚合——端口/环境/Token 三个整页子 feature，加 JSON/Base64/Hash/UUID/时间戳转换、网络诊断、系统信息等内置工具 Tab。原「开发清理」已迁出为独立模块 [Clean Space](../clean-space/design.md)，网络诊断已独立为 [Network Probe](../network-probe/README.md)。

全局顺序：[2.0 最终路线图](../../ROADMAP.md)
