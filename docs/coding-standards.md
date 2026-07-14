# 编码规范

> 基于仓库既有实现的约定，非外部引入的规则。

规则级别：**强制** = 必须遵守 / **建议** = 有收益但不硬门槛。

---

## 1. 通用

- **强制**: TypeScript `strict` 通过，禁止未使用的局部变量、参数、导出。
- **强制**: 模块按职责拆分，避免一个文件同时承担视图、状态、业务编排和平台调用。
- **强制**: 导入使用 `@/` 别名。
- **建议**: 注释只写职责边界、约束原因和非直观实现。

## 2. 前端目录

### 2.1 Feature 组织

- **强制**: 新功能落在 `features/<domain>/` 内，默认包含 `page.tsx`、`feature.tsx`、`store.ts`、`hooks/`、`services/`。
- **强制**: 通用 UI 基元放 `components/ui/`，壳层布局放 `components/layout/`，跨功能共享逻辑放 `shared/`。
- **强制**: 纯工具函数放 `lib/`，平台能力封装放 `platform/`。

### 2.2 组件放置

- **强制**: 跨功能复用的基础组件放 `components/ui/`。
- **强制**: 单功能内部复用的组件放 feature 内 `components/`。
- **建议**: 只被一个页面使用的组件就地放置，不提前抽象。第二个使用方出现后上提到模块共享层，跨模块复用上提到全局共享层。

### 2.3 命名约定

- **强制**: 状态文件 `store.ts`，业务编排 `*.use-cases.ts`，外部适配 `*.repository.ts`，控制器 `useXxxController`。
- **强制**: Rust 后端命令入口 `commands.rs`，类型定义 `types.rs`，状态管理 `state.rs`。

## 3. 状态与异步

### 3.1 状态归属

- **强制**: `store.ts` 只放状态和简单动作，复杂业务编排放 `*use-cases.ts`。
- **强制**: Tauri 调用、存储访问放 `*repository.ts` 或 `lib/tauri/commands/*`。
- **强制**: 组件层消费 controller 或 use case，不直接堆叠平台调用。
- **建议**: `store.ts` 是否补建按实际共享范围决定：状态被多个页面/组件共享时补 `store.ts`；页面级本地状态（如 token-calculator 的 pricing/汇率）留在 controller 即可，不强制补 `store.ts` 避免过度抽象。
- **建议**: `services/*.repository.ts` 是否补建按 IPC 集中度决定：Tauri 命令已在 `lib/tauri/commands/*` 集中维护时，feature 内不强制补 `*.repository.ts` 作为纯 re-export facade；仅在需要错误处理 / 缓存 / 参数转换等附加逻辑时才补。

### 3.2 Zustand Controller

- **强制**: Controller 中异步编排（初始加载、提交、轮询等）通过 `useXxxStore.getState()` 读写 store，**不得**把无 selector 的 `useXxxStore()` 返回值放进 `useCallback` / `useMemo` / `useEffect` 依赖。整 store 订阅在每次 state 更新时都会产生新引用，易导致 effect 无限重跑（例如首屏一直「加载中」）。
- **强制**: UI 需要的 store 字段用 selector 订阅，或 `useShallow` 取多字段；参考 `useAppManagerController.ts` + `useAppManagerViewState.ts`。
- **建议**: Controller 内避免 `const store = useXxxStore()` 无 selector 订阅整 store；仅 actions 可用 `useXxxStore((s) => s.setFoo)` 等形式按需订阅。
- **建议**: `useShallow` 批量订阅 vs 精细 selector 的选择按字段数与稳定性决定：
  - 字段多（≥20）且 controller 需大量暴露给 page.tsx 时用 `useShallow` 一次性批量订阅（如 account-manager 36 字段）；
  - 字段少（≤15）时优先逐个 `useXxxStore((s) => s.foo)` 精细 selector，订阅意图更清晰（如 terminology 12 字段）。
- **建议**: Controller 抽取采用「最小化方案」：把 `page.tsx` 的 store 订阅、本地 UI 状态、派生数据（`useMemo`）、effect、handler（`useCallback`）集中迁入 `hooks/useXxxController.ts`，page.tsx 只保留 JSX 渲染与 `t()` 调用。子组件可保留原样直接从 `./store` import `useXxxStore`——setter 引用稳定，无重渲问题，不必强行迁出。
- **建议**: Controller 返回值只暴露 page.tsx 实际消费的字段；内部使用但页面不需要的字段（如 `appManagerLoading` 仅用于 effect 同步）不要返回，避免 page.tsx 解构后未使用触发 lint。

### 3.3 异步安全

- **强制**: 可重复点击/提交/启动的异步动作必须做重入保护。
- **强制**: `useEffect` 中注册的事件、定时器、订阅必须有清理逻辑。
- **强制**: Rust 阻塞 I/O 通过 `spawn_blocking` 执行，不得卡在 async 命令主路径。
- **强制**: 可变后端操作必须明确并发策略：是否可重入、是否需要锁、是否支持取消。
- **强制**: 被多个 feature 共享的扫描/刷新任务必须只有一个任务所有者，采用 single-flight 或显式替换旧任务；禁止多个 controller 复制同一套 IPC + event + store 写入编排。
- **强制**: 长任务事件必须携带 `taskId`（共享数据任务同时携带 `revision`），前端只接收当前任务事件，禁止不同请求共用无身份的进度事件。
- **强制**: 取消使用可持久观察的 token/state；一次性通知不得作为唯一取消状态。进入不可取消临界区前必须更新任务状态并反馈 UI。

### 3.4 平台边界

- **强制**: 平台判断走 `canUseDesktopFeatures()` / `canUseTauriCommands()`，不散落在 JSX 和业务代码里。
- **强制**: 浏览器降级、桌面能力缺失、IPC 不可用在边界层处理，不留给页面兜底。

## 4. 国际化

- **强制**: 所有用户可见文案进入 `src/i18n/locales/`，不硬编码到组件/toast/弹窗/菜单。
- **强制**: 新增 key 时同步维护 `zh` 和 `en`。
- **强制**: locale 两侧的 key、叶子值类型、插值参数和 plural family 保持一致；默认禁止空文案，确需空回退时在 i18n guard 中登记 key 与理由。
- **强制**: JSX 文本、`title`/`placeholder`/`aria-label`/`alt` 和 toast/alert 文案通过 AST 硬编码门禁；协议、币种、算法和公式单位只允许进入带理由的技术 token 白名单，禁止用宽泛正则豁免英文。
- **强制**: 动态翻译 key 必须至少匹配现有 key family；可枚举状态优先使用受类型约束的 canonical value，不拼接用户输入生成 key。
- **强制**: 不在模块顶层、静态常量或 store 初始值里执行 `t()`。需翻译的 label/header/filter option 应在渲染期、`useMemo` 或工厂函数中计算。
- **强制**: 静态数据层使用语言无关 canonical value，展示层映射到 locale；禁止中文原始值做英文界面回退。
- **建议**: 组件内直接调用 `useTranslation()` 获取 `t`，不通过 prop 透传。`useTranslation()` 与 `useXxxStore()` 同级，不破坏"纯组件"约定。工厂/工具函数因不在 React 树内，仍通过参数传入 `t`。

## 5. 用户反馈

- **强制**: 写操作必须给成功/失败反馈，异步操作须有加载态。
- **强制**: 用户输入被过滤/忽略/拒绝时必须明确提示，禁止静默吞掉。
- **强制**: 空状态、失败态保证页面语义清晰，不让用户面对无解释空白区。
- **强制**: 空结果、未支持、部分成功、失败必须是不同状态；后端/前端禁止把 `unsupported` 或 provider 失败折叠为空数组后显示“全部完成/全部最新”。
- **强制**: 危险操作（关机、重启、清空、释放端口、删除数据、重置权限等）须二次确认；统一使用 `src/components/common/DestructiveConfirmDialog.tsx`，含后果说明 callout。

## 6. UI 与性能

> 详细的 UX 规范（布局模式、加载状态、文本溢出处理、紧凑化设计等）见 `docs/UX-STANDARDS.md`。

- **强制**: 基础组件优先复用 shadcn/ui + Lucide 图标。类名拼接统一 `cn()`。
- **强制**: 新增大列表/大表格优先评估虚拟化，不默认全量渲染。
- **建议**: 传给重组件的配置对象、回调和派生数据使用 `useMemo` / `useCallback`。
- **强制**: 大数据模块和低频页面不能默认首屏同步打包，必须评估按路由/模块拆分。
- **强制**: 共享 store 被多个子页面复用时，必须明确作用域；不同数据域不共享筛选条件。
- **强制**: z-index 必须使用 `UI_LAYERS` 语义常量（`src/lib/ui-layers.ts`）或 Tailwind 工具类（`z-sticky-table-corner` / `z-drawer-panel` 等，由 `tokens.css` 的 `--z-index-*` 生成），禁止 `z-[N]` 魔法数字。shadcn/ui 组件内置的 `z-10` / `z-50` 等 Tailwind 标准档位不受此限制。

## 7. Rust 后端

### 7.1 模块结构

- **强制**: 后端能力按领域进独立目录，不堆进 `main.rs` 或根级杂项文件。
- **强制**: 复杂模块细分 `installer/`、`storage.rs` 等子目录；简单模块至少明确 `mod.rs`、命令入口、类型归属。

### 7.2 错误边界

- **强制**: IPC 边界优先使用统一错误类型 `AppError`（`src-tauri/src/error.rs`），序列化为 `{ code, message }`。新命令返回 `AppResult<T>`；`code` 用 `SCREAMING_SNAKE_CASE` 让前端可机器判断（如 `FORBIDDEN_PATH`、`UNSUPPORTED`、`INVALID_INPUT`、`IO_ERROR`）。领域错误枚举（如 `TokenCalculatorError`）用 `#[serde(tag = "code")]` 输出同构结构，与之兼容。
- **强制**: 历史 `Result<T, String>` 命令可保留，但前端一律通过 `src/lib/tauri/errors.ts` 的 `parseCommandError` / `getErrorMessage` / `translateError` 解析，禁止 `typeof error === "string"`、`String(error)`、`error instanceof Error` 之类的散装判断。
- **强制**: 需本地化的错误在 `i18n` 的 `errors.<CODE>` 提供文案；`translateError` 会优先取本地化文案，缺失时回退后端 `message`。
- **强制**: 后端不得用 `.expect()` / `.unwrap()` 打穿 IPC；`spawn_blocking` 的 JoinError 转 `AppError::task_failed`，`Mutex` 用 `unwrap_or_else(|e| e.into_inner())` 从 poison 恢复。
- **强制**: 启动期配置读取、迁移、解密失败须显式传播到前端或暴露降级状态，不能仅 `eprintln!` 后继续。

### 7.3 批量与取消

- **强制**: 批量任务和取消接口按幂等设计，重复调用不能导致状态损坏。
- **强制**: 取消后状态必须可恢复至确定的干净状态。
- **强制**: 批量输入先去重并设置数量上限；结果分别统计 succeeded / failed / cancelled，禁止把 cancelled 合并为 failed。
- **强制**: 批量进度、取消入口和最终结果必须端到端接线；仅存在后端 cancel command 不算功能完成。

### 7.4 外部进程与平台适配

- **强制**: 外部进程必须有真实可终止的 timeout、输出上限和稳定错误码；timeout 后必须回收子进程/进程树并释放锁。
- **强制**: 核心跨平台数据不得解析本地化人类表格输出。优先使用原生 API 或 JSON/结构化输出；无法避免时必须固定 locale 并有多语言 fixture。
- **强制**: Windows 禁止把 IPC 输入交给 `cmd /C` / PowerShell 字符串执行；启动传统应用使用 ShellExecute，包应用使用 AUMID/API。

### 7.5 应用清单与更新安全

- **强制**: 应用启动、定位、升级、卸载命令只接受后端稳定 ID；renderer 不得提交可执行路径、package ID 或 shell 参数作为最终执行依据。
- **强制**: 模糊名称/路径匹配只能生成候选，不得授予升级、卸载等破坏性能力；破坏性动作要求 receipt/product code/package ID 等 exact evidence。
- **强制**: 原地更新命令只接受后端生成的 update ID + revision；下载 URL、hash、签名和目标路径必须从后端 canonical cache 获取。
- **强制**: 更新安装前校验应用身份与平台兼容性（bundle/package ID、签名主体、架构、最低系统版本），并设置下载/解压/内存资源上限与可恢复替换策略。

## 8. IPC 契约

- **强制**: Tauri 命令契约集中维护在 `src/lib/tauri/contracts.ts` 和 `src-tauri/src/commands.rs`。
- **强制**: 命令名、参数名、返回 DTO 字段在 TS 与 Rust 两侧保持一致。
- **强制**: 新增命令不能绕开现有契约体系。改一个 command 至少同步检查：Rust 实现、命令注册、TS 契约、TS 类型。
- **强制**: 高风险写操作使用窄请求 DTO（稳定 ID、revision、用户决策），禁止回传读取 DTO 的完整副本作为写入命令参数。

## 9. 测试与门禁

- **强制**: 涉及 IPC、共享类型、复杂业务编排的改动，须通过相关测试或检查链路。
- **建议**: 优先补行为测试和契约测试；优先按「类型检查 → 单测 → 前端构建 → 后端 check」顺序自检。
- **强制**: i18n 共享组件和品牌文案改动，覆盖切换语言后 UI 更新的行为测试。
- **强制**: 自定义 hook 测试必须用 `renderHook(() => useXxxHook())` + `result.current.xxx()` 模式（从 `@testing-library/react` 导入），**禁止**在测试函数体内直接调用 hook——违反 Rules of Hooks 会抛 `Invalid hook call. Hooks can only be called inside of the body of a function component.`。异步动作包在 `await act(async () => { await result.current.foo(); })` 内，确保 state 更新被 React 调度。参考 `src/features/updater/__tests__/useUpdaterController.test.tsx`。
- **建议**: IPC 契约测试覆盖 DTO 字段一致性：在 `src/lib/tauri/__tests__/contracts.test.ts` 为新增的 Rust ↔ TS 共享类型补字段比对，防止两侧漂移。

## 10. 提交规范

- **强制**: Conventional Commits 格式，commit-msg hook 校验类型/scope/消息格式。
- **强制**: commit body 单行不超过 500 字符。
- **强制**: pre-commit 至少检查暂存区空白和 Prettier；按改动范围执行文档、i18n/TypeScript/前端测试与构建、Rust fmt/check/Clippy/test。
- **强制**: 同一文件同时存在 staged 与 unstaged 修改时停止提交，避免检查工作区版本却提交另一版本；不得用 `--no-verify` 绕过失败门禁。
- **强制**: Git Hook 只提供本地反馈，CI 必须独立执行格式、i18n/类型、Clippy、测试与构建，不能信任客户端 Hook 已运行。
- **强制**: CI/CD runner、构建目标和发布产物只允许 macOS 与 Windows；禁止引入 Linux runner、容器、包格式或发布分支，由 `pnpm run check:ci-platforms` 校验。

## 11. 文档

> 索引：[docs/README.md](./README.md) · 开发流程：[development-workflow.md](./development-workflow.md) · 模块一览：[docs/modules/README.md](./modules/README.md) · 2.0 路线：[ROADMAP.md](./ROADMAP.md)

### 11.1 目录原则

- **强制**: 文档**按模块收纳**，与 `src/features/<id>/` 对齐；禁止同一模块的 roadmap / bugs / 设计稿分散在 `docs/roadmap/`、`docs/bugs/` 等多处目录。
- **强制**: 横切内容只保留在 `docs/` 根；`ROADMAP.md` 是唯一跨模块版本路线图。
- **禁止**: 在旧路径留空壳跳转 stub；移动文档后须更新所有引用链接，指向新路径。

### 11.2 模块目录约定

路径：`docs/modules/<id>/`

| 文件          | 级别 | 说明                                           |
| ------------- | ---- | ---------------------------------------------- |
| `README.md`   | 强制 | 模块文档索引，链到本目录内其余文件             |
| `roadmap.md`  | 强制 | 迭代规划与 checkbox backlog                    |
| `bugs.md`     | 建议 | 已知问题；无 open bug 时可只保留关闭记录或省略 |
| 设计稿 `*.md` | 按需 | PRD、技术方案、候选功能库等                    |

- **强制**: 新增 feature 时同步创建 `docs/modules/<id>/`，至少含 `README.md` + `roadmap.md`。
- **建议**: 设计稿较多时在模块内平铺即可；单模块设计文件超过 ~5 份时再拆 `design/` 子目录。
- **建议**: 模块专属候选库（如 System Settings 开关库）放在该模块目录内；进入当前版本后写入同目录 `roadmap.md`，跨模块依赖才写入 `ROADMAP.md`。

### 11.3 维护

- **强制**: 功能合入后，对应模块 `roadmap.md` 的 Backlog 须与代码一致——已实现的从 Backlog 移除，未实现的保留。
- **强制**: `docs/modules/<id>` 与 `src/features/<id>` 双向对齐，且每个模块含 `README.md` + `roadmap.md`——由 `pnpm run check:docs`（已串入 `lint:fe`）机器校验，不一致即 CI/提交失败。
- **建议**: 跨模块发布顺序只在 `ROADMAP.md` 维护；模块细节留在各 `roadmap.md`。
- **建议**: 危险操作、i18n、IPC 等实现约定以本文件为准；模块设计规范写模块内设计稿，不重复拷贝编码规则。

## 12. 评审聚焦

代码评审优先检查：i18n 漏洞和硬编码文案、状态与异步副作用错位（含 Zustand 整 store 进 hook 依赖）、IPC 契约漂移、重复提交和并发执行问题、大列表渲染退化、平台判断散落、模块顶层冻结 i18n 文案、启动失败只写日志不暴露 UI、**文档路径与 `roadmap.md` 是否与改动同步**。
