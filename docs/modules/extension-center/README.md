# Extension Center（插件中心）

> 阶段：P2 骨架（[D-024](../../DECISIONS.md#d-024--extension-仓库组织与-photo-triage-试点拆法)）。
> 架构边界与工作流见 [extension-workflow.md](../../extension-workflow.md)；**执行顺序与状态唯一清单见 [roadmap.md](./roadmap.md)**。

## 定位

- 浏览/管理已安装 extension（bundled / market，P2 仅 bundled）；
- 打开/启用/禁用插件；market 下载、签名校验、能力矩阵为 P3+；
- 本 feature 是**宿主前端**的一部分（插件中心本身不是插件）。

## 架构边界

- 前端：`src/features/extension-center/`（page + controller + store）；
- 后端：`src-tauri/src/extension_host/`（manifest schema v1 / ACL 注册表 / IPC 网关 / asset provider）；
- 契约：`ext_list_installed` / `ext_open` / `ext_set_enabled`（contracts.ts 三张表已双写）；
- 插件产物：`extensions/<id>/`（仓库）→ `scripts/plugins/sync-extensions.mjs` → `$APPDATA/extensions/<id>/`（运行时）。

## 安全模型（D-024）

- 插件窗口 label 固定 `ext-<id>`，capability 仅 `core:default`；
- **自定命令 deny-by-default 网关**：`ext-` 窗口只能调用 `extension_host::acl::EXTENSION_ALLOWED_COMMANDS` 注册表内的命令（photo-triage 15 条 + ext 自身）；
- manifest fail-closed：schema 版本不匹配、id/version/entry 非法、ACL 越权一律拒绝加载。

## 关联文档

- [roadmap.md](./roadmap.md) — 执行状态与顺序唯一清单（含行业依据与技术铁律附录）
- [../../extension-spec.md](../../extension-spec.md) — **契约唯一规格**：manifest / 签名 / registry / 产物格式 / ACL / 运行时接口
- [../../extension-workflow.md](../../extension-workflow.md) — 架构边界、仓库组织、作者侧与宿主侧工作流
- [../../product-specs/extension-center.md](../../product-specs/extension-center.md) — 插件中心功能规格
- [../../planned/extension-center.md](../../planned/extension-center.md) — 插件中心未完成项
