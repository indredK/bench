# Extension Center（插件中心）

> 阶段：P2–P4 插件中心已交付；P4.5 作者工具链位于 [bench-extension-template](https://github.com/kindred-plugin-market/bench-extension-template)。
> 架构边界与工作流见 [extension-workflow.md](../../explanation/extension-workflow.md)；**执行顺序与状态唯一清单见 [roadmap.md](./roadmap.md)**。

## 定位

- 浏览/管理已安装 extension（bundled / market）；
- 浏览 market registry、披露权限、校验签名并安装/升级插件；
- 本 feature 是**宿主前端**的一部分（插件中心本身不是插件）。

## 架构边界

- 前端：`src/features/extension-center/`（page + controller + store）；
- 后端：`src-tauri/src/extension_host/`（manifest schema v2 / ACL 注册表 / IPC 网关 / asset provider / market 安装）；
- 契约：安装列表、开窗、启停、卸载、market registry 与诊断命令在 `contracts.ts` 中登记；
- 插件产物：官方 bundled 插件随宿主资源发布；market 插件经 canonical registry 下载到 `$APPDATA/extensions/<id>/`。

## 安全模型（D-024）

- 插件窗口 label 固定 `ext-<id>`，capability 仅 `core:default`；
- **自定命令 deny-by-default 网关**：`ext-` 窗口只能调用 `extension_host::acl::EXTENSION_ALLOWED_COMMANDS` 注册表内的命令（photo-triage 15 条 + ext 自身）；
- manifest fail-closed：schema 版本不匹配、id/version/entry 非法、ACL 越权或插件不支持当前平台时拒绝加载/安装。

## 关联文档

- [roadmap.md](./roadmap.md) — 执行状态与顺序唯一清单（含行业依据与技术铁律附录）
- [../../extension-spec.md](../../reference/extension-spec.md) — **契约唯一规格**：manifest / 签名 / registry / 产物格式 / ACL / 运行时接口
- [../../extension-workflow.md](../../explanation/extension-workflow.md) — 架构边界、仓库组织、作者侧与宿主侧工作流
- [../../product-specs/extension-center.md](../../reference/product-specs/extension-center.md) — 插件中心功能规格
- [../../planned/extension-center.md](../../roadmap/planned/extension-center.md) — 插件中心未完成项
