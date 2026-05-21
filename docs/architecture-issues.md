# 架构优化重点

本文档仅保留当前项目仍值得跟进的关键架构优化点。不记录代码风格、命名、UI 细节或普通实现瑕疵。

## 当前结论

项目主架构已经基本健康：`App.tsx` 已通过 feature registry 收敛路由、侧栏和刷新入口，Tauri 调用也基本下沉到 command/repository 层。当前没有发现严重架构断裂，剩余问题主要是少数模块边界还可以继续收口。

## 本轮已落地

- 新增 `src/lib/tauri/contracts.ts`，集中管理 Tauri command 名称、event 名称和前端 command contract 类型。
- 新增 `src/lib/tauri/invoke.ts`，前端 command wrapper 已改为通过 typed invoke 入口调用集中契约，避免参数和返回类型继续散落手写。
- 新增 IPC 契约测试，校验前端 command/event 名称与 Rust command 注册和 event emit 保持一致。
- 新增 `src/features/app-manager/model/operations.ts`，把 App Manager 操作状态、batch patch 和运行态判断从 store 中抽出。
- App Manager 的升级、卸载、安装和批量操作编排已下沉到 `services/app-manager.use-cases.ts`，并补充 mock repository 单测。
- Rust `src-tauri/src/app_manager/mod.rs` 已拆为 `commands.rs`、`state.rs`、`types.rs`、`utils.rs`，`mod.rs` 只负责模块组织和 re-export。
- `src-tauri/tauri.conf.json` 已对齐前端构建脚本，避免 Tauri build 前置命令递归调用自身。

## 1. 建立 IPC 契约单一来源

**问题**

Rust DTO 与 TypeScript 类型仍是双份手写维护，例如：

- `src/lib/tauri/types/*`
- `src-tauri/src/app_manager/mod.rs`
- `src-tauri/src/port_manager.rs`
- `src-tauri/src/dev_cleaner.rs`
- `src-tauri/src/env_detector.rs`

字段名、可选性、枚举值和事件 payload 都依赖人工同步，后续 Rust 侧改字段时，前端可能仍能编译但运行时出错。

**优化方向**

选定一个 IPC 契约单一来源：

- 优先方案：从 Rust DTO 生成 TypeScript 类型。
- 备选方案：用 JSON Schema / Zod 描述契约并做运行时校验。
- 保守方案：保留手写类型，但为 command 返回值和 Tauri event payload 增加契约测试。

**当前状态**

已完成前端 command/event 契约集中化、typed invoke 入口和 command/event 名称契约测试。下一步仍需选择 codegen 或 schema 方案，解决 Rust DTO 与 TypeScript 类型的双份维护问题。

**验收标准**

- Rust DTO 变更能自动反映到前端类型，或通过契约测试失败暴露。
- 所有 `#[tauri::command]` 入参、返回值和 event payload 都有明确契约。
- 前端不再依赖人工维护的大量重复 DTO。

## 2. 继续收窄 App Manager feature 边界

**问题**

`src/features/app-manager/store.ts` 仍然承担过多职责：扫描、更新、安装、卸载、批量操作、历史刷新、推荐安装清单、布局状态、对话框状态和偏好持久化都集中在同一个 store 中。

这会让 App Manager 在 feature 内部形成新的“小型应用壳层”，后续功能增长时，store 会继续变成协调中心。

**优化方向**

继续按职责拆分 App Manager：

```text
src/features/app-manager/
  store.ts                 # 仅保留页面视图状态和轻量 action
  model/
    selectors.ts           # 搜索、筛选、排序、统计等派生逻辑
    preferences.ts         # 偏好读写
  services/
    app-manager.repository.ts
    app-manager.use-cases.ts
  components/
```

优先下沉这些流程：

- `doUpgrade`
- `doUninstall`
- `doInstall`
- `doBatchUpgrade`
- `doBatchUninstall`
- `loadHistory`
- 安装清单派生与筛选统计

**验收标准**

- store 主要保存视图状态，不再编排复杂业务流程。
- use-case 可以通过 mock repository 单独测试。
- 搜索、筛选、排序和统计逻辑集中在 `model/selectors.ts`。

**当前状态**

已抽出操作状态与 batch 状态 patch，并把 `doUpgrade`、`doUninstall`、`doInstall`、batch 操作的核心编排下沉到 use-case 层。下一步可继续拆出 history 刷新、扫描结果映射和安装清单刷新流程，让 store 更接近纯视图状态容器。

## 3. 拆分 Rust App Manager 中心模块

**问题**

`src-tauri/src/app_manager/mod.rs` 仍同时承载 DTO、操作历史、共享状态、command、业务编排和平台分发逻辑。随着 App Manager 功能继续增长，这个模块会持续膨胀。

**优化方向**

将 Rust App Manager 继续拆成更明确的模块：

```text
src-tauri/src/app_manager/
  mod.rs
  commands.rs      # 仅放 #[tauri::command] 和 DTO 转换
  state.rs         # AppManagerState、锁和历史记录
  service.rs       # 平台无关业务流程
  types.rs         # DTO / enum
  macos.rs
  windows.rs
  linux.rs
```

`mod.rs` 只负责导出和组合，不再承载主要业务逻辑。

**验收标准**

- 新增 App Manager command 时主要修改 `commands.rs` 和对应 service。
- 平台实现文件只处理平台差异，不承担 command 注册或全局状态职责。
- `mod.rs` 保持轻量，只做模块组织。

**当前状态**

已完成 `commands.rs`、`state.rs`、`types.rs`、`utils.rs` 拆分。后续如果 App Manager 继续增长，再补 `service.rs`，把平台无关业务流程从 `commands.rs` 中继续下沉。

## 优先级

1. IPC 契约单一来源。
2. App Manager store 继续瘦身。
3. Rust App Manager 模块拆分。

这三项完成后，当前项目的主要架构风险基本就会被收住。
