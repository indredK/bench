# Port Manager（端口管理）

> **完备功能规格** → [product-specs/port-manager.md](../../product-specs/port-manager.md)
> **规划功能** → [planned/port-manager.md](../../planned/port-manager.md)

代码：`src/features/port-manager/` · `src-tauri/src/port_manager/`

定位：macOS/Windows 跨平台桌面模块，批量检查一组端口（本地进程 / 远程连通性），查看占用进程树与指纹并安全释放端口（Local 模式可 Kill）。

| 文档                     | 说明                              |
| ------------------------ | --------------------------------- |
| [design.md](./design.md) | Local/Remote、Kill 安全和性能约束 |

全局顺序：[2.0 最终路线图](../../ROADMAP.md)
