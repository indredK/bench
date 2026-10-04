# Extension Center（插件中心）

> 插件中心提供已安装插件与市场的管理入口。阶段状态和待验收项见唯一清单 [roadmap.md](./roadmap.md)；插件契约以 [extension-spec.md](../../reference/extension-spec.md) 为准。

## 定位

- 管理 bundled 与 market 插件：浏览、安装、信任披露、启用/禁用、卸载、更新状态和诊断；
- 插件中心本身是**宿主前端**的一部分，不是插件；
- 插件作者工具与 SDK 由独立公开仓库 [bench-extension-template](https://github.com/kindred-plugin-market/bench-extension-template) 提供。

## 架构边界

- 前端：`src/features/extension-center/`（page + controller + store）；
- 后端：`src-tauri/src/extension_host/`（manifest schema v2、registry、完整性/签名校验、安全解压、ACL 网关和生命周期）；
- IPC 契约集中维护在 `contracts.ts`、Rust handler 和类型化包装中；
- 官方插件源码真源在 [plugin-market](https://github.com/kindred-plugin-market/plugin-market)；宿主从资源包部署 bundled 插件，市场插件由后端 canonical registry 安装。

## 安全模型（D-024）

- 插件窗口 label 固定 `ext-<id>`，capability 仅 `core:default`；
- **自定命令 deny-by-default 网关**：`ext-` 窗口只能调用 `extension_host::acl::EXTENSION_ALLOWED_COMMANDS` 注册表内的命令；
- manifest、平台、ACL、签名和逐文件完整性均 fail-closed；每条宿主 IPC 命令仍由后端按插件 ACL 再次授权。

## 关联文档

- [roadmap.md](./roadmap.md) — 执行状态与顺序唯一清单（含行业依据与技术铁律附录）
- [../../extension-spec.md](../../reference/extension-spec.md) — **契约唯一规格**：manifest / 签名 / registry / 产物格式 / ACL / 运行时接口
- [../../extension-workflow.md](../../explanation/extension-workflow.md) — 架构边界、仓库组织、作者侧与宿主侧工作流
- [../../product-specs/extension-center.md](../../reference/product-specs/extension-center.md) — 插件中心功能规格
- [../../planned/extension-center.md](../../roadmap/planned/extension-center.md) — 插件中心未完成项
