# Bench 项目代码规范审计报告

> **本次审计**：2026-07-06，Phase 1–6 全量审计。
> **上次审计**：2026-07-05，所有强制项已修复，建议项已评估处理。
>
> **问题统计**：
> | Phase | 强制 | 建议 | 合计 |
> |-------|:----:|:----:|:----:|
> | Phase 1 — 全局结构与目录规范 | 4 | 6 | 10 |
> | Phase 2 — 前端代码与 UI 规范 | 22 | 3 | 25 |
> | Phase 3 — 国际化（i18n） | 3 | 1 | 4 |
> | Phase 4 — 状态管理、异步安全与用户反馈 | 18 | 3 | 21 |
> | Phase 5 — Rust 后端与 IPC 契约 | 10 | 0 | 10 |
> | Phase 6 — 文档对齐与提交规范 | 0 | 1 | 1 |
> | **合计** | **57** | **14** | **71** |
>
> **按规范章节分布（Top 5）**：
> - §6 UI 与性能：22 强制 + 3 建议
> - §7 Rust 后端：10 强制
> - §3 状态与异步：12 强制 + 3 建议
> - §5 用户反馈：4 强制
> - §4 国际化：3 强制 + 1 建议
>
> **本文件用途**：保留"不计违规决策"与"已评估模式"，供后续 AI 审计参考，**避免重复标记已评估过的问题**。已修复条目的详细记录已移除（commit 历史可查）。
>
> **经验沉淀**：可复用的模式与评估标准已写入 [coding-standards.md](./coding-standards.md) §3.1 / §3.2 / §9 与 [development-workflow.md](./development-workflow.md) §3.1，审计时直接参照规范，不在此重复。模块化功能经验在各模块 `roadmap.md`。

---

## 不计违规决策（勿重复标记）

后续审计如遇到以下模式，**不要重复标记为违规**——已评估并决策保留：

1. **`src/data/phone.ts` 纯数据不做国际化**（2026-07-05）
   - 数据层保留中文原始值（~2200 行），展示层通过 `PHONE_*_KEYS` 反向映射表 + `t()` 翻译
   - 新增机型时需同步补映射表条目；`CAMERA_TERM_TO_KEY` 以中文做 key、`str.replace(/\(屏下\)/g, ...)` 正则改中文括号均属同一决策

2. **`src/features/hardware/` 不强制补 `hooks/` / `services/`**
   - `page.tsx` 仅 183 行做组合，无内联编排；`HardwareCompare.tsx` / `HardwareCompareTab.tsx` 已在 `components/` 内

3. **`columns.tsx` 跨模块不强制统一抽取**
   - `app-manager` / `dev-cleaner` / `env-detector` 三个 `columns.tsx` 内容差异大（不同字段、格式化、筛选），统一抽取会过度抽象

4. **`services/*.repository.ts` 在 IPC 已集中时不强制补**
   - Tauri 命令已在 `lib/tauri/commands/*` 集中维护时，feature 内不补纯 re-export facade；仅在需要错误处理 / 缓存 / 参数转换时才补（见 coding-standards §3.1）

5. **`store.ts` 对页面级本地状态不强制补**
   - 无跨页面共享需求时留在 controller 即可（如 token-calculator 的 pricing/汇率，见 coding-standards §3.1）

6. **`src-tauri/src/lib.rs` `tauri::Builder` 链路 `.expect()`**
   - 启动失败本身无法降级，符合"启动期配置读取失败须显式传播"的兜底语义；仅此一处，其他 IPC 路径禁用 `.expect()` / `.unwrap()`

7. **子组件直接 `useXxxStore()` 取 setter 不算违规**
   - setter 引用稳定，无重渲问题；主组件用 controller，子组件可保留 `useXxxStore()` 取 `addTerm` / `updateTerm` 等 setter

---

## 已通过检查项（现状确认，审计时可快速跳过）

以下领域在 2026-07-05 审计中通过，无需逐项重查：

- TypeScript `strict` + `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`
- `@/` 别名导入，无 `../../` 跨模块导入
- shadcn/ui 复用，`cn()` 类名拼接（33 处历史违规已修复）
- 大列表虚拟化已接入（`@tanstack/react-virtual`，port-manager / hardware / app-manager）
- locale key `zh` / `en` 同步（各 1983 key，`scripts/quality/check-i18n-guards.mjs` 接入 `lint:fe` 门禁）
- 无模块顶层 / 静态常量 / store 初始值里的 `t()` 调用
- store 分层：状态在 `store.ts`，编排在 `*use-cases.ts`，IPC 在 `lib/tauri/commands/*`
- 重入保护普遍使用 `useGuardedAsync` / `useGuardedAsyncSet`
- Effect 清理完整（事件 / 定时器 / 订阅）
- 平台边界走 `canUseDesktopFeatures()` / `canUseTauriCommands()` / `canUseTauriWindow()`，无 `window.__TAURI__` 散落
- 写操作 toast 反馈 + 加载态；空状态 / 失败态 UI 完整
- `DestructiveConfirmDialog` 危险操作二次确认
- Rust 后端按领域分目录，`commands.rs` 仅作注册表
- IPC 契约集中维护（168 个 `defineTauriCommand`，TS↔Rust 字段一致）
- 批量与取消接口幂等
- 提交历史 Conventional Commits

---

## 审查记录

> 本章节是 `/review` workflow 的**结果落盘区**——每次审查（commit / PR / 文件 / 全量）都追加一条记录，防止跨会话遗忘。
>
> 格式：`### YYYY-MM-DD — <审查范围>` + 逐条违规（或 `✅ 无违规`）。
> 违规修复后在行尾追加 `✅ 已修复`。

<!-- 新审查记录追加在此下方 -->

### 2026-07-06 — 全量审计 Phase 1–2

#### Phase 1：全局结构与目录规范

**强制违规**

- [§2.3] `src-tauri/src/app_preferences/` — 缺少 `types.rs`，Rust 后端类型定义未按规范命名 — 创建 `app_preferences/types.rs` 并迁移类型 — **强制**
- [§2.3] `src-tauri/src/window_theme/` — 缺少 `types.rs` — 创建 `window_theme/types.rs` 并迁移类型 — **强制**
- [§3.4] `src/features/system-settings/components/sections/AppAuthorizeSection.tsx:5` — 静态导入 `@tauri-apps/plugin-notification`（`sendNotification`），平台 API 调用混入视图组件 — 改为通过 `platform/` 封装或 controller 透传 — **强制**
- [§3.4] `src/features/system-settings/components/sections/AppAuthorizeSection.tsx:105` — `platformName !== "macos"` 平台判断散落在 JSX 中 — 使用 `canUseDesktopFeatures()` 替代 — **强制**

**建议**

- [§2.3] `src/features/token-calculator/services/exchange-rate.ts` — 文件在 `services/` 目录下但不遵循 `*.use-cases.ts` 或 `*.repository.ts` 命名 — **建议**
- [§2.3] `src/features/quick-launch/scenes.ts` — 承担业务编排职能但未按 `*.use-cases.ts` 命名 — **建议**
- [§2.1] `src/features/dev-toolbox/` — 缺少 `store.ts` 和 `services/`；如属 Tab hub 特殊设计应在规范中注明豁免 — **建议**
- [§2.1] `src/features/quick-launch/` — 缺少 `services/`，`scenes.ts` 业务编排应移入 `services/` — **建议**
- [§2.1] `src/features/terminology/` — 缺少 `services/` — **建议**
- [§2.1] `src/features/updater/` — 缺少 `page.tsx`、`feature.tsx`、`services/`；如属背景模块应在 `README.md` 中说明 — **建议**

#### Phase 2：前端代码与 UI 规范

**强制违规**

- [§6] `src/features/terminology/page.tsx` — 17 处直接使用 `<button>` 而非 `Button` 组件 — 替换为 `Button` — **强制**
- [§6] `src/features/quick-launch/page.tsx` — 7 处直接使用 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/account-manager/components/shared.tsx:37` — `IconButton` 内部手写 `<button>` — 改用 `Button` — **强制**
- [§6] `src/features/account-manager/components/DetailColumn.tsx:585,622` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/account-manager/components/AccountColumn.tsx:278,414` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/system-settings/page.tsx:905,921,947` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/port-manager/components/PortManagerPageContent.tsx:194` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/port-manager/components/PortManagerControls.tsx:111,213,230` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/dev-toolbox/page.tsx:375` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/dev-cleaner/components/DevCleanerPageContent.tsx:80` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/app-manager/components/CategoryFilter.tsx:104,116` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/app-manager/components/SoftwareUpdateView.tsx:201` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/app-manager/components/AppManagerCatalogView.tsx:155` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/app-manager/components/UpdateGroupSection.tsx:55` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/token-calculator/components/CompareTab.tsx:282` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/components/common/CloseBehaviorDialog.tsx:83` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/components/layout/Sidebar.tsx:110` — 直接 `<button>` — 替换为 `Button` — **强制**
- [§6] `src/features/dev-toolbox/page.tsx:131,167` — 手写 `<select>` — 替换为 `Select` — **强制**
- [§6] `src/features/account-manager/components/DetailColumn.tsx:666` — 手写 `<select>` — 替换为 `Select` — **强制**
- [§6] `src/features/dev-toolbox/page.tsx:84` — 手写 `<textarea>` — 替换为 `Textarea` — **强制**
- [§6] `src/features/token-calculator/components/CompareTab.tsx:498,585` — 手写 `<table>` — 替换为 `Table` — **强制**
- [§6] `src/components/common/CloseBehaviorDialog.tsx:87-92,96-100` — 使用 `.join(" ")` 手动拼接 className，未用 `cn()` — 替换为 `cn(...)` — **强制** ✅ 已修复

**建议**

- [§6] `src/features/terminology/page.tsx:1119` — 术语卡片网格 `.map()`，数据量可能超 50 项，建议评估虚拟化 — **建议**
- [§6] `src/features/system-settings/page.tsx:790,835,862` — 登录项/启动代理列表，若超 50 项建议虚拟化 — **建议**
- [§6] 多处 `.map()` 中内联箭头函数传给子组件，建议评估 `useMemo`/`useCallback` — **建议**

#### Phase 3：国际化（i18n）审计

**强制违规**

- [§4.1] `src/features/account-manager/components/dialogs.tsx:762` — 硬编码 placeholder `"https://example.com"`，应使用 locale key `accountManager.addStationDialog.websitePlaceholder` — **强制**
- [§4.1] `src/features/account-manager/components/dialogs.tsx:788` — 硬编码 placeholder `"user@example.com"`，应使用 locale key `accountManager.addAccountDialog.usernamePlaceholder` — **强制**
- [§4.1] `src/features/account-manager/components/auth-proxy-dialog.tsx:333` — 硬编码 placeholder URL，应抽离到 i18n — **强制**

**建议**

- [§4.2] `src/features/app-manager/recommended-apps.ts:42` (及全文件) — 中文 `description` 作为 `t()` 的 `defaultValue` 回退；新增应用若漏补 locale key，英文界面会展示中文 — 建议新增检查机制或改用英文 canonical value — **建议**

**已通过**

- ✅ locale key `zh` / `en` 完全同步（各 2,250 个全层级 key，0 缺失）
- ✅ 无模块顶层 / 静态常量 / store 初始值的 `t()` 调用
- ✅ 语言无关 canonical value 模式正确（`src/data/*.ts` 数据层映射到 locale key，非用户面向文本）

#### Phase 4：状态管理、异步安全与用户反馈

**强制违规**

- [§3.1] `src/features/terminology/store.ts:4-18` — store 直接导入并调用 14+ 个 Tauri 命令（`createIndustry`、`deleteTerm` 等），应委派到 `*repository.ts` — **强制**
- [§3.1] `src/features/terminology/store.ts:111-134` — `reloadFromBackend()` 含复杂业务编排（数据加载、选择同步、状态更新），应放入 `*.use-cases.ts` — **强制**
- [§3.1] `src/features/terminology/store.ts:194-264` — store actions（`addIndustry`、`updateCategory`、`deleteTerm` 等）直接做 IPC 调用后 `reloadFromBackend()`，属于业务编排 — **强制**
- [§3.1] `src/features/terminology/store.ts:266-294` — `filteredTerms()` 含复杂筛选/排序逻辑（行业/分类/子分类/搜索 + pinned 优先 + localeCompare），应移至 selector 或 controller 的 `useMemo` — **强制**
- [§3.2] `src/features/system-settings/page.tsx:67` — `const store = useSystemSettingsStore()` 无 selector 订阅整 store，任意字段更新都会触发重渲染 — 改用 `useShallow` 或精细 selector — **强制**
- [§3.2] `src/features/terminology/page.tsx:204` — `const { industries, addTerm, updateTerm, deleteTerm } = useTerminologyStore()` 无 selector 订阅整 store — 改用精细 selector — **强制**
- [§3.2] `src/features/terminology/page.tsx:458` — 同上模式，无 selector 订阅整 store — **强制**
- [§3.3] `src/features/dev-cleaner/hooks/useDevCleanerController.ts:67-101` — `handleScan` 无重入保护，未检查 `isScanning` — 加 early return — **强制** ✅ 已修复
- [§3.3] `src/features/updater/hooks/useUpdaterController.ts:54-93` — `checkUpdates` 无重入保护 — **强制** ✅ 已修复
- [§3.3] `src/features/updater/hooks/useUpdaterController.ts:95-128` — `downloadAndInstall` 无重入保护 — **强制** ✅ 已修复
- [§3.3] `src/features/dev-cleaner/components/CustomCleanupDialog.tsx:83-134` — `handleStartCleanup` 无程序化重入保护 — **强制**
- [§3.3] `src/features/terminology/page.tsx:257-292` — 术语表单 `handleSave` 无防重复提交保护 — **强制**
- [§3.3] `src/features/dev-cleaner/components/CustomCleanupDialog.tsx` — 注册平台事件监听后无 `useEffect` 卸载清理，组件卸载时监听器泄漏 — **强制**
- [§5] `src/features/quick-launch/hooks/useQuickLaunchController.ts:229-235` — `handleResetOverrides` 静默重置覆盖数据，无成功/失败反馈 — 加 toast — **强制**
- [§5] `src/features/terminology/page.tsx:504-527` — `handleAddInd`/`handleAddCat`/`handleAddSubcat` 成功时无 toast 反馈 — **强制**
- [§5] `src/features/quick-launch/hooks/useQuickLaunchController.ts:229-235` — `handleResetOverrides` 立即执行无二次确认，可撤销所有用户自定义分类 — 应使用 `DestructiveConfirmDialog` — **强制**
- [§5] `src/features/dev-cleaner/components/CustomCleanupDialog.tsx:205-209` — 清理操作可删除文件但未使用 `DestructiveConfirmDialog` — **强制**
- [§5] `src/features/terminology/page.tsx:891-909` — 行业/分类/子分类删除用普通 `Dialog` 而非 `DestructiveConfirmDialog` — **强制**

**建议**

- [§3.3] `src/features/dev-cleaner/page.tsx` — 页面级无错误态处理，扫描崩溃时无 fallback UI — **建议**
- [§3.3] `src/features/hardware/page.tsx` — 页面级无错误态/空态处理 — **建议**
- [§3.3] `src/features/system-settings/page.tsx` — 无顶层错误/空态处理，设置加载失败会呈现白页 — **建议**

**已通过**

- ✅ 其他 9 个 feature 的 `store.ts` 分层正确（状态在 store，编排在 use-cases，IPC 在 commands）
- ✅ 其他 controller 全部使用精细 selector 或 `useShallow`（account-manager、app-manager、port-manager、dev-cleaner、env-detector、quick-launch、updater）
- ✅ 平台边界全部走 `canUseDesktopFeatures()` / `canUseTauriCommands()`，无 `window.__TAURI__` 散落
- ✅ 大多数写操作有 toast 反馈 + 加载态（app-manager、port-manager、account-manager、system-settings）
- ✅ 空状态/失败态在多数页面存在（token-calculator、account-manager、terminology、env-detector、app-manager）
- ✅ Effect 清理在其他模块完整（9 处确认，无泄漏）

#### Phase 5：Rust 后端与 IPC 契约

**强制违规**

- [§7.2] `src-tauri/src/app_manager/commands.rs` — 18 条 IPC 命令返回 `Result<T, String>` 而非 `AppResult<T>`，错误码丢失 — 迁移到 `AppResult<T>` — **强制**
- [§7.2] `src-tauri/src/system_settings/` ~60 条命令返回 `Result<T, String>` — 迁移到 `AppResult<T>` — **强制**
- [§7.2] `src-tauri/src/app_preferences/commands.rs` — 4 条命令返回 `Result<T, String>` — **强制**
- [§7.2] `src-tauri/src/app_updater/commands.rs` — 2 条命令返回 `Result<T, String>` — **强制**
- [§7.2] `src-tauri/src/dev_cleaner/commands.rs` — 2 条命令返回 `Result<T, String>` — **强制**
- [§7.2] `src-tauri/src/sleep_inhibitor/commands.rs` — 2 条 IPC 命令返回 `Result<T, String>` — **强制**
- [§7.2] `src-tauri/src/window_theme/commands.rs:34` — `set_window_theme` 返回 `Result<T, String>` — **强制**
- [§7.2] `src-tauri/src/tray.rs:143` — `set_tray_labels` 返回 `Result<T, String>` — **强制**
- [§7.2] `src-tauri/src/app_manager/utils.rs:27,29` — `.unwrap()` 在 `run_command_with_timeout()` 的生产代码路径上（`Mutex::lock()`），应用 `unwrap_or_else(|e| e.into_inner())` — **强制**
- [§7.2] `src-tauri/src/error.rs` — `invalid_input()` / `not_found()` / `unsupported()` 三个构造器标注 `#[allow(dead_code)]`，说明迁移至 `AppResult<T>` 未完成 — 逐步消除 `Result<T, String>` 后移除标注 — **强制**

**已通过**

- ✅ IPC 契约完全对齐：TypeScript 168 条 `defineTauriCommand` ↔ Rust 168 条 `generate_handler!` 注册，零缺失
- ✅ 编译时检查确保 `TAURI_COMMAND_CONTRACTS` key 与命令名、分组覆盖一致
- ✅ 前端错误解析全部走 `getErrorMessage()` / `parseCommandError()`，无 `typeof error === "string"` 散装判断
- ✅ 批量与取消接口全部幂等设计（`AtomicBool`、`Notify`）
- ✅ 后端按领域分目录，`main.rs` 仅一行调用，`lib.rs` 职责清晰

#### Phase 6：文档对齐与提交规范

**建议**

- [§11] `docs/modules/system-settings/roadmap.md` — 评价表称"无测试文件"，但 `src/features/system-settings/model/__tests__/app-authorize.test.ts` 已存在 — 更新 roadmap 同步实际状态 — **建议**

**已通过**

- ✅ 提交历史全部 Conventional Commits（近 40 条，`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`）
- ✅ `docs/` 下所有跨文件引用链接有效（零死链）
- ✅ 所有 12 个 feature 有对应 `docs/modules/<id>/`，且含 `README.md` + `roadmap.md`
- ✅ `bugs.md` 按约定省略（无 open bug 时可不建）

---

## 后续审计指引

AI 后续扫描时：

1. **先读本文件**的"不计违规决策"章节，避免重复标记已评估的模式
2. **跳过**"已通过检查项"中的领域，除非有新代码改动
3. **经验已沉淀**到规范文档，不在本文件重复：
   - controller 抽取最小化方案、useShallow vs selector 选择 → `coding-standards.md` §3.2
   - store.ts / repository.ts 评估标准 → `coding-standards.md` §3.1
   - renderHook 测试模式、IPC 契约测试 → `coding-standards.md` §9
   - controller 抽取实操要点（import 清理等）→ `development-workflow.md` §3.1
4. **模块化功能经验**在各模块 `docs/modules/<id>/roadmap.md`，不在本文件重复
5. 发现新违规时，按 `AGENTS.md` Phase 8 流程修复，每个违规项独立 commit
