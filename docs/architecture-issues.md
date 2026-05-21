# 架构问题记录

本文档仅记录当前项目中观察到的架构层面问题，不包含代码风格、命名、UI 细节或普通实现瑕疵。

## 修复目标

本次架构加固的目标不是大规模重写，而是建立更清晰的依赖方向和模块边界，让后续新增功能时不会继续把复杂度堆到根组件、全局 store 和 Tauri 入口里。

建议统一成下面的依赖方向：

```text
App shell
  -> feature registry
    -> feature page
      -> feature view store
        -> feature use-cases
          -> platform adapters / repositories
            -> Tauri commands
```

反向依赖应尽量避免：

- `App.tsx` 不直接依赖具体 feature store。
- `components/ui` 不依赖具体 feature。
- `features/*` 不依赖 `components/features/*`。
- `view store` 不直接散落调用 `invoke`、`listen`、dialog、shell。
- Rust `lib.rs` 不承载具体业务流程。

## 推荐改造顺序

1. 先引入 feature registry，收敛 `App.tsx` 中的路由、侧栏和刷新逻辑。
2. 再为每个 feature 拆出 `services` 或 `repositories`，把 Tauri 调用从 store 中移出。
3. 拆分大型 store，先拆副作用和业务流程，再拆纯视图状态。
4. 统一 feature 目录结构，新代码先进入新的垂直切片目录，旧代码逐步迁移。
5. 最后补 IPC 类型契约和 Rust 后端注册拆分。

每一步都应保持小步提交，避免一次性移动过多文件导致难以回归。

## 本轮已落地

- `App.tsx` 已改为通过 feature registry 组合页面与刷新逻辑。
- 页面级实现已迁入 `src/features/<feature>/page.tsx`。
- feature store 已迁入各自目录，并继续下沉到 `services/use-cases`。
- `src/components/features` 的兼容导出已删除。
- `src/lib/tauri/commands` 与 `src/lib/tauri/types` 已按 feature 拆分。
- `SystemInfoData` 已从 `port-manager` 命名空间独立出来。
- Rust 侧 `lib.rs` 已拆出菜单与 command 注册模块。

仍建议后续继续补强：

- IPC schema / codegen 统一来源。
- 更细的 feature 内 use-case 与 selector 分层。
- Rust 后端更明确的 feature module 注册。

## 1. 应用壳层承担了特性调度职责

**位置**

- `src/App.tsx`

**问题**

`App.tsx` 直接 import 多个 feature store，并通过 `window.location.hash` 与 `switch` 判断当前页面，然后调用对应的刷新动作。它同时维护路由、侧栏、菜单事件、弹窗和每个页面的刷新策略。

**影响**

- 新增或调整 feature 时，需要同时修改路由、侧栏、刷新逻辑和菜单逻辑。
- 根组件会逐渐变成特性协调中心，导致 feature 的内部行为向应用壳层泄漏。
- 全局菜单与页面能力强耦合，不利于以后拆分、懒加载或插件化 feature。

**建议方向**

引入 feature registry 或 route manifest。每个 feature 自己声明：

- `path`
- `name`
- `icon`
- `component`
- `refresh`
- 是否需要桌面环境

`App.tsx` 只负责消费这些配置并组合布局，不直接知道每个 feature 的 store 细节。

**建议落地结构**

```text
src/features/registry.tsx
src/features/app-manager/feature.tsx
src/features/port-manager/feature.tsx
src/features/dev-cleaner/feature.tsx
src/features/system-info/feature.tsx
src/features/env-detector/feature.tsx
src/features/hardware/feature.tsx
```

`feature.tsx` 建议导出类似结构：

```ts
export interface AppFeature {
  id: string;
  path: string;
  labelKey: string;
  icon: React.ReactNode;
  component: React.ComponentType<{ active?: boolean }>;
  refresh?: () => void | Promise<void>;
  desktopOnly?: boolean;
}
```

`registry.tsx` 聚合所有 feature：

```ts
export const appFeatures: AppFeature[] = [
  portManagerFeature,
  appManagerFeature,
  devCleanerFeature,
  hardwareFeature,
  systemInfoFeature,
  envDetectorFeature,
];
```

`App.tsx` 中的刷新逻辑应变为：

```ts
const currentFeature = findFeatureByPath(currentPath);
await currentFeature?.refresh?.();
```

**迁移步骤**

1. 新建 `src/features/types.ts`，定义 `AppFeature`。
2. 为现有每个页面创建 `feature.tsx`，先只搬迁 `path`、`icon`、`labelKey`、`component`。
3. 把 `sidebarItems` 改为从 `appFeatures` 派生。
4. 把 `Switch/Route` 改为遍历 `appFeatures` 渲染。
5. 把 `handleRefresh` 改为调用当前 feature 的 `refresh`。
6. 删除 `App.tsx` 中对具体 store 的 imports。

**验收标准**

- `App.tsx` 不再 import `useAppManagerStore`、`useDevCleanerStore`、`useEnvDetectorStore`、`usePortManagerStore`、`useSystemInfoStore`。
- 新增一个 feature 时，只需要新增 feature 文件并加入 registry。
- 全局刷新菜单不需要新增 `switch case`。

## 2. Zustand Store 职责过重，混合了视图状态、业务流程和平台调用

**位置**

- `src/stores/app-manager.ts`
- `src/stores/port-manager.ts`
- `src/stores/dev-cleaner.ts`
- `src/stores/env-detector.ts`

**问题**

当前 store 不只是保存状态，还直接承担了：

- Tauri IPC 调用
- localStorage 持久化
- 业务流程编排
- 弹窗状态
- 表格排序和筛选状态
- 批量操作流程
- 安装、扫描、清理等副作用
- 派生数据生成

其中 `app-manager` 最明显：一个 store 覆盖了扫描、更新检查、安装、卸载、批量操作、历史记录、推荐安装清单、布局状态和弹窗状态。

**影响**

- store 成为巨型模块，难以单独测试业务逻辑。
- UI 状态与平台副作用绑定，后续替换 Tauri adapter 或支持浏览器 fallback 会更困难。
- 页面组件、store、Tauri command 之间边界不清，修改一个流程容易牵动多个层。
- 业务流程无法在非 React 环境中复用。

**建议方向**

按职责拆分为三层：

- `tauri adapter / repository`：只封装 `invoke`、`listen`、dialog、shell 等平台能力。
- `domain use-cases`：处理扫描、刷新、安装、卸载、批量操作等业务流程。
- `view store`：只保存页面需要的状态和调用 use-case。

Zustand store 应尽量成为视图状态容器，而不是业务服务层。

**建议目标分层**

以 App Manager 为例：

```text
src/features/app-manager/
  page.tsx
  store.ts
  services/
    app-manager.repository.ts
    app-manager.use-cases.ts
  model/
    types.ts
    filters.ts
    selectors.ts
  components/
```

职责划分：

- `repository`：封装 Tauri command、dialog、shell、event listen。
- `use-cases`：编排扫描、更新检查、安装、卸载、批量操作、历史记录刷新。
- `store`：保存当前页面状态，调用 use-case，并接收结果。
- `selectors`：筛选、搜索、排序、派生统计。
- `components`：只处理渲染和用户交互。

**App Manager 拆分建议**

优先从 `src/stores/app-manager.ts` 拆出这些内容：

- localStorage 偏好：移动到 `features/app-manager/services/preferences.ts`。
- Tauri 调用：移动到 `features/app-manager/services/app-manager.repository.ts`。
- 推荐安装清单派生：移动到 `features/app-manager/model/install-list.ts` 或继续保留在 `recommended-apps.ts`，但不要由 store 负责 DTO 转换。
- 搜索、分类、系列筛选：移动到 `features/app-manager/model/selectors.ts`。
- `doUpgrade`、`doUninstall`、`doInstall`、`doBatchUpgrade`、`doBatchUninstall`：移动到 use-case 层。

拆分后的 store 应尽量只保留：

```ts
interface AppManagerViewState {
  apps: AppInfo[];
  loading: boolean;
  error: string;
  searchQuery: string;
  activeFilter: AppFilterKey;
  sorting: SortingState;
  selectedAppIds: Set<string>;
  dialogs: DialogState;
  layout: LayoutState;
}
```

**Port Manager 拆分建议**

`doScan`、`killPort`、`killAll` 中的 Tauri 调用和扫描流程应移到：

```text
src/features/port-manager/services/port-manager.repository.ts
src/features/port-manager/services/port-manager.use-cases.ts
```

store 只保留端口列表、扫描状态、错误信息和用户输入状态。

**Dev Cleaner 拆分建议**

`handleSelectPath`、`handleScan`、`handleStopScan`、`handleCleanup` 都是平台副作用或业务流程，应从 store 移到 use-case/repository。

特别是 `open` dialog 不应直接出现在 view store 中。

**Env Detector 拆分建议**

`listen("env-scan-done")` 和 `detectEnvTools()` 应封装为一个 repository 方法，例如：

```ts
scanEnvTools(): Promise<{ tools: EnvTool[]; unavailable: EnvTool[] }>
```

这样页面和 store 不需要知道 Tauri event 的实现细节。

**迁移步骤**

1. 每个 feature 先建 `services/*repository.ts`，把 `invoke`、`listen`、dialog、shell 调用搬进去。
2. 保持原 store API 不变，只把内部实现改为调用 repository，降低回归风险。
3. 再建 `use-cases.ts`，把多步骤流程从 store 中搬出。
4. 最后收缩 store 类型，只保留视图状态和少量 action。

**验收标准**

- `src/stores/*` 或迁移后的 `features/*/store.ts` 不直接 import `@tauri-apps/api/*`。
- store 中不直接出现 `invoke`、`listen`、`open` dialog、`shell.open`。
- 业务流程可以在单元测试中通过 mock repository 测试。
- 页面组件不直接调用 `useStore.setState` 修改复杂业务状态。

## 3. Feature 目录边界不清，出现横向目录和纵向模块混用

**位置**

- `src/components/features/*`
- `src/features/*`
- `src/stores/*`

**问题**

项目同时存在两种 feature 组织方式：

- `components/features` 放页面级组件。
- `features/*` 放 columns、分类、筛选、比较逻辑等 feature 内部工具。
- `stores/*` 又单独放 feature 状态。

实际依赖中也存在交叉：例如 App Manager 页面同时依赖 `components/layout`、`components/content`、`stores/app-manager`、`features/app-manager/*`、`lib/tauri/commands`；而 `features/app-manager/columns.tsx` 又依赖 `components/features/AppIcon` 和 store 类型。

**影响**

- 很难判断一个 feature 的完整边界在哪里。
- 迁移、删除或重构某个 feature 时，需要跨多个顶层目录寻找相关代码。
- `features/*` 与 `components/features/*` 的职责容易继续重叠。
- 共享组件和 feature 私有组件之间的边界不稳定。

**建议方向**

采用垂直切片的 feature 结构，例如：

```text
src/features/app-manager/
  page.tsx
  components/
  store.ts
  services/
  model/
  columns.tsx
  hooks/
```

共享 UI 继续保留在：

```text
src/components/ui/
src/components/layout/
src/components/content/
```

这样每个 feature 的页面、状态、服务、模型和私有组件都能在同一边界内演进。

**建议最终目录**

```text
src/
  app/
    App.tsx
    providers.tsx
    menu/
  components/
    ui/
    layout/
    content/
    common/
  features/
    registry.tsx
    types.ts
    app-manager/
      feature.tsx
      page.tsx
      store.ts
      components/
      services/
      model/
      columns.tsx
      __tests__/
    port-manager/
      feature.tsx
      page.tsx
      store.ts
      components/
      services/
      model/
    dev-cleaner/
    system-info/
    env-detector/
    hardware/
  platform/
  lib/
    tauri/
  i18n/
```

**迁移规则**

- 页面级组件从 `src/components/features/*` 迁移到对应 `src/features/*/page.tsx`。
- feature 私有组件放在 `src/features/<feature>/components`。
- feature 私有 hooks 放在 `src/features/<feature>/hooks`。
- feature 私有类型放在 `src/features/<feature>/model/types.ts`。
- 可被多个 feature 复用的 UI 才能进入 `src/components/ui`、`layout`、`content`。
- `src/stores/*` 逐步迁移到对应 feature 内部。

**依赖规则**

```text
features/<feature> -> components/ui
features/<feature> -> components/layout
features/<feature> -> lib/tauri
features/<feature> -> platform

components/ui -> 不依赖 features
components/layout -> 不依赖具体 feature store
lib/tauri -> 不依赖 React
```

**验收标准**

- `src/components/features` 可以最终删除，或只保留临时兼容导出。
- 一个 feature 的页面、store、services、model 能在同一目录下找到。
- `features/app-manager/columns.tsx` 不再依赖 `components/features/AppIcon`，而是依赖本 feature 的组件或共享 UI 组件。
- 测试文件跟随 feature 放置，避免所有测试集中在 `components/__tests__`。

## 4. 前端与 Rust 后端的 IPC 类型是手写双份

**位置**

- `src/lib/tauri/types.ts`
- `src-tauri/src/app_manager/mod.rs`
- `src-tauri/src/port_manager.rs`
- `src-tauri/src/dev_cleaner.rs`
- `src-tauri/src/env_detector.rs`

**问题**

Rust 侧的 DTO 结构体与 TypeScript 侧的接口分别手写维护。字段名、可选性、枚举值和嵌套结构都需要人工同步。

**影响**

- IPC 契约容易漂移，Rust 改字段后 TypeScript 可能仍能编译但运行异常。
- 重构 DTO 时缺少单一事实来源。
- 新增平台能力或复杂响应结构时，同步成本会上升。

**建议方向**

引入类型生成或 schema 契约，选择其中一种作为单一来源：

- 从 Rust DTO 生成 TypeScript 类型。
- 使用 JSON Schema / Zod schema 作为共享契约。
- 至少为 Tauri command 建立集中契约文件和响应校验。

目标是让 IPC 边界可验证、可重构，而不是依赖人工同步。

**建议契约范围**

至少覆盖以下内容：

- 所有 `#[tauri::command]` 的入参。
- 所有 command 的返回 DTO。
- 所有通过 Tauri event 发送的 payload，例如 `env-scan-done`。
- 枚举值，例如 `ProjectType`、`SourceType`、操作状态等。

**可选方案**

方案 A：Rust DTO 作为单一来源。

- Rust 结构体继续使用 `Serialize`、`Deserialize`。
- 增加类型导出工具，将 DTO 生成到 `src/lib/tauri/generated-types.ts`。
- 手写的 `src/lib/tauri/types.ts` 逐步改为 re-export 生成结果。

方案 B：Schema 作为单一来源。

- 使用 JSON Schema 或 Zod 描述 IPC 契约。
- 前端用 schema 校验 command 返回值。
- Rust 侧遵守同一 schema，或通过测试校验序列化结果。

方案 C：短期保守方案。

- 保留手写类型。
- 给每个 command 增加最小运行时校验或契约测试。
- 在 `types.ts` 中按 command 分组，减少一个大文件承载所有 DTO。

**推荐落地步骤**

1. 先把 `src/lib/tauri/types.ts` 按 feature 拆分：

```text
src/lib/tauri/types/
  app-manager.ts
  port-manager.ts
  dev-cleaner.ts
  env-detector.ts
  system-info.ts
  index.ts
```

2. 再把 `commands.ts` 按 feature 拆分：

```text
src/lib/tauri/commands/
  app-manager.ts
  port-manager.ts
  dev-cleaner.ts
  env-detector.ts
  index.ts
```

3. 引入生成或校验方案后，替换手写 DTO。

**验收标准**

- 每个 Tauri command 的入参和返回值都有明确 TypeScript 类型。
- event payload 不再使用散落的内联类型。
- Rust DTO 变更时，前端类型能同步失败或自动更新。
- 不再由一个 `types.ts` 文件承载全部 feature DTO。

## 5. Rust 后端入口逐渐变成中心注册表

**位置**

- `src-tauri/src/lib.rs`

**问题**

`lib.rs` 直接负责：

- 初始化插件
- 管理共享状态
- 构建系统菜单
- 转发菜单事件
- 注册所有 Tauri command

当前规模还能承受，但所有后端 feature command 都集中在 `invoke_handler` 中，菜单逻辑也与应用启动逻辑混在一起。

**影响**

- 新增后端 feature 时会持续修改同一个入口文件。
- 菜单、状态和 command 注册缺少模块边界。
- 后续如果引入更多窗口、权限域或平台特定 setup，入口文件会快速膨胀。

**建议方向**

让每个后端 feature 暴露自己的注册函数，例如：

```rust
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry>;
pub fn setup(app: &mut tauri::App) -> tauri::Result<()>;
```

或者至少拆分：

- `menu.rs`
- `commands.rs`
- `state.rs`
- feature module registration

`lib.rs` 只负责组合这些模块。

**建议拆分方向**

```text
src-tauri/src/
  lib.rs
  menu.rs
  state.rs
  commands.rs
  app_manager/
    mod.rs
    commands.rs
    state.rs
    macos.rs
    windows.rs
    linux.rs
  port_manager/
    mod.rs
    commands.rs
    service.rs
  dev_cleaner/
    mod.rs
    commands.rs
    scanner.rs
    cleanup.rs
  env_detector/
    mod.rs
    commands.rs
    scanner.rs
```

短期不一定要立刻全部拆成目录，但至少可以先做三件事：

1. 把菜单构建与菜单事件转发移到 `menu.rs`。
2. 把共享 state 初始化移到 `state.rs` 或各 feature 的 `setup_state`。
3. 把 `generate_handler!` 的列表按 feature 聚合，避免 `lib.rs` 直接列所有 command。

**Rust Feature 模块建议边界**

- `commands.rs`：只放 `#[tauri::command]` 函数和 DTO 转换。
- `service.rs` / `scanner.rs`：放业务逻辑和平台无关逻辑。
- `macos.rs`、`windows.rs`、`linux.rs`：只放平台实现。
- `state.rs`：放 Tauri managed state 和锁。

**验收标准**

- `src-tauri/src/lib.rs` 不直接包含菜单构建细节。
- `lib.rs` 中的 command 注册按模块组织，而不是一长串业务函数。
- 新增后端 feature 时，主要修改 feature 自己的模块。
- 平台实现文件不直接承担 command 注册职责。

## 优先级建议

1. 优先处理 `App.tsx` 的 feature registry 化，阻止根组件继续吸收 feature 细节。
2. 其次拆分 store，把 Tauri adapter 和业务 use-case 从 Zustand 中移出去。
3. 再逐步统一 feature 目录结构，避免新增代码继续分散到多个顶层目录。
4. IPC 类型生成可以在下一次 DTO 变更或新增 command 时顺手引入。
5. Rust 入口拆分可以等后端 command 继续增长前完成。

## 分阶段执行计划

### 阶段 1：建立前端 feature registry

目标：让 `App.tsx` 只负责应用壳层。

任务：

- 新建 `src/features/types.ts`。
- 新建 `src/features/registry.tsx`。
- 为每个现有页面补 `feature.tsx`。
- 从 registry 派生侧栏和路由。
- 从 registry 获取当前页面刷新动作。

完成后检查：

- `App.tsx` 没有具体 feature store import。
- 新增 feature 不需要修改 `handleRefresh`。

### 阶段 2：抽出 Tauri adapter

目标：让 store 不再直接依赖平台 API。

任务：

- 拆分 `src/lib/tauri/commands.ts`。
- 每个 feature 新增 repository。
- store 内部调用 repository，不直接调用 Tauri API。
- 对 repository 做 mock 测试。

完成后检查：

- store 不 import `@tauri-apps/api/*`。
- command 名称集中在 repository 层。

### 阶段 3：抽出 use-case 和 selector

目标：让业务流程和派生数据可测试、可复用。

任务：

- 把多步骤流程从 store 移入 use-case。
- 把筛选、搜索、分类、统计移入 selector/model。
- 页面组件只消费最终数据和 action。

完成后检查：

- store 文件长度明显下降。
- 复杂流程有单元测试。
- 页面组件中不再重复实现业务筛选逻辑。

### 阶段 4：统一 feature 垂直切片

目标：一个 feature 的相关代码集中管理。

任务：

- 将页面组件迁移到 `features/<feature>/page.tsx`。
- 将私有组件迁移到 `features/<feature>/components`。
- 将旧 `src/stores/*` 迁移到对应 feature。
- 保留临时 re-export，减少一次性改动风险。

完成后检查：

- `components/features` 不再新增文件。
- 新 feature 默认按垂直切片创建。

### 阶段 5：加固 IPC 契约和 Rust 注册

目标：降低前后端契约漂移和后端入口膨胀风险。

任务：

- 按 feature 拆分 TypeScript DTO 和 command bindings。
- 选定类型生成或 schema 校验方案。
- 拆出 Rust `menu.rs`。
- 拆出 Rust feature command/state 注册。

完成后检查：

- Rust DTO 变化能被前端类型或契约测试捕获。
- `src-tauri/src/lib.rs` 保持薄入口。

## 不建议在本轮做的事

- 不建议为了架构纯度一次性重写所有页面。
- 不建议同时改 UI 设计和架构边界。
- 不建议在 store 拆分前移动大量组件文件。
- 不建议在没有测试保护的情况下替换所有 IPC 类型。
- 不建议先抽象过度通用的 framework，优先服务当前 feature 规模。
