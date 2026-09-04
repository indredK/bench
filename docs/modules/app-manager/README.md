# App Manager（应用管理）

> **完备功能规格** → [product-specs/app-manager.md](../../product-specs/app-manager.md)
> **规划功能** → [planned/app-manager.md](../../planned/app-manager.md)

代码：`src/features/app-manager/` · `src-tauri/src/app_manager/`

定位：发现本机已装应用并启动 / 定位 / 授权 / 升级 / 卸载，提供推荐应用安装（市场）与多来源软件更新中心；破坏性操作只接受后端解析的稳定 `appId`，升级 / 卸载必须有 exact evidence。

| 文档                     | 说明                           |
| ------------------------ | ------------------------------ |
| [design.md](./design.md) | 跨平台清单、启动和更新安全边界 |
