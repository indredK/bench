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

### 3.2 Zustand Controller

- **强制**: Controller 中异步编排（初始加载、提交、轮询等）通过 `useXxxStore.getState()` 读写 store，**不得**把无 selector 的 `useXxxStore()` 返回值放进 `useCallback` / `useMemo` / `useEffect` 依赖。整 store 订阅在每次 state 更新时都会产生新引用，易导致 effect 无限重跑（例如首屏一直「加载中」）。
- **强制**: UI 需要的 store 字段用 selector 订阅，或 `useShallow` 取多字段；参考 `useAppManagerController.ts` + `useAppManagerViewState.ts`。
- **建议**: Controller 内避免 `const store = useXxxStore()` 无 selector 订阅整 store；仅 actions 可用 `useXxxStore((s) => s.setFoo)` 等形式按需订阅。

### 3.3 异步安全

- **强制**: 可重复点击/提交/启动的异步动作必须做重入保护。
- **强制**: `useEffect` 中注册的事件、定时器、订阅必须有清理逻辑。
- **强制**: Rust 阻塞 I/O 通过 `spawn_blocking` 执行，不得卡在 async 命令主路径。
- **强制**: 可变后端操作必须明确并发策略：是否可重入、是否需要锁、是否支持取消。

### 3.4 平台边界

- **强制**: 平台判断走 `canUseDesktopFeatures()` / `canUseTauriCommands()`，不散落在 JSX 和业务代码里。
- **强制**: 浏览器降级、桌面能力缺失、IPC 不可用在边界层处理，不留给页面兜底。

## 4. 国际化

- **强制**: 所有用户可见文案进入 `src/i18n/locales/`，不硬编码到组件/toast/弹窗/菜单。
- **强制**: 新增 key 时同步维护 `zh` 和 `en`。
- **强制**: 不在模块顶层、静态常量或 store 初始值里执行 `t()`。需翻译的 label/header/filter option 应在渲染期、`useMemo` 或工厂函数中计算。
- **强制**: 静态数据层使用语言无关 canonical value，展示层映射到 locale；禁止中文原始值做英文界面回退。

## 5. 用户反馈

- **强制**: 写操作必须给成功/失败反馈，异步操作须有加载态。
- **强制**: 用户输入被过滤/忽略/拒绝时必须明确提示，禁止静默吞掉。
- **强制**: 空状态、失败态保证页面语义清晰，不让用户面对无解释空白区。
- **强制**: 危险操作（关机、重启、清空、释放端口、删除数据、重置权限等）须二次确认；统一使用 `src/components/common/DestructiveConfirmDialog.tsx`，含后果说明 callout。

## 6. UI 与性能

- **强制**: 基础组件优先复用 shadcn/ui + Lucide 图标。类名拼接统一 `cn()`。
- **强制**: 新增大列表/大表格优先评估虚拟化，不默认全量渲染。
- **建议**: 传给重组件的配置对象、回调和派生数据使用 `useMemo` / `useCallback`。
- **强制**: 大数据模块和低频页面不能默认首屏同步打包，必须评估按路由/模块拆分。
- **强制**: 共享 store 被多个子页面复用时，必须明确作用域；不同数据域不共享筛选条件。

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

## 8. IPC 契约

- **强制**: Tauri 命令契约集中维护在 `src/lib/tauri/contracts.ts` 和 `src-tauri/src/commands.rs`。
- **强制**: 命令名、参数名、返回 DTO 字段在 TS 与 Rust 两侧保持一致。
- **强制**: 新增命令不能绕开现有契约体系。改一个 command 至少同步检查：Rust 实现、命令注册、TS 契约、TS 类型。

## 9. 测试与门禁

- **强制**: 涉及 IPC、共享类型、复杂业务编排的改动，须通过相关测试或检查链路。
- **建议**: 优先补行为测试和契约测试；优先按「类型检查 → 单测 → 前端构建 → 后端 check」顺序自检。
- **强制**: i18n 共享组件和品牌文案改动，覆盖切换语言后 UI 更新的行为测试。

## 10. 提交规范

- **强制**: Conventional Commits 格式，commit-msg hook 校验类型/scope/消息格式。
- **强制**: commit body 单行不超过 500 字符。

## 11. 文档

> 索引：[docs/README.md](./README.md) · 开发流程：[development-workflow.md](./development-workflow.md) · 模块一览：[docs/modules/README.md](./modules/README.md) · 发布节奏：[docs/roadmap/release-themes.md](./roadmap/release-themes.md)

### 11.1 目录原则

- **强制**: 文档**按模块收纳**，与 `src/features/<id>/` 对齐；禁止同一模块的 roadmap / bugs / 设计稿分散在 `docs/roadmap/`、`docs/bugs/` 等多处目录。
- **强制**: 横切内容仅保留在 `docs/` 根或 `docs/roadmap/`：`coding-standards.md`（本文件）、`release-themes.md`（全局版本主题）。
- **禁止**: 在旧路径留空壳跳转 stub；移动文档后须更新所有引用链接，指向新路径。

### 11.2 模块目录约定

路径：`docs/modules/<id>/`

| 文件 | 级别 | 说明 |
|------|------|------|
| `README.md` | 强制 | 模块文档索引，链到本目录内其余文件 |
| `roadmap.md` | 强制 | 迭代规划与 checkbox backlog |
| `bugs.md` | 建议 | 已知问题；无 open bug 时可只保留关闭记录或省略 |
| 设计稿 `*.md` | 按需 | PRD、技术方案、候选功能库等 |

- **强制**: 新增 feature 时同步创建 `docs/modules/<id>/`，至少含 `README.md` + `roadmap.md`。
- **建议**: 设计稿较多时在模块内平铺即可；单模块设计文件超过 ~5 份时再拆 `design/` 子目录。
- **建议**: 模块专属候选库（如 System Settings 开关库）放在该模块目录内，选品后写入同目录 `roadmap.md`，并在 `release-themes.md` 打勾。

### 11.3 维护

- **强制**: 功能合入后，对应模块 `roadmap.md` 的 checkbox 与「已交付」说明须与代码一致。
- **建议**: 跨模块版本主题（v1.16 Polish 等）只在 `release-themes.md` 维护；模块细节留在各 `roadmap.md`。
- **建议**: 危险操作、i18n、IPC 等实现约定以本文件为准；模块设计规范写模块内设计稿，不重复拷贝编码规则。

## 12. 评审聚焦

代码评审优先检查：i18n 漏洞和硬编码文案、状态与异步副作用错位（含 Zustand 整 store 进 hook 依赖）、IPC 契约漂移、重复提交和并发执行问题、大列表渲染退化、平台判断散落、模块顶层冻结 i18n 文案、启动失败只写日志不暴露 UI、**文档路径与 `roadmap.md` 是否与改动同步**。
