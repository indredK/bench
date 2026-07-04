# Bench 项目代码规范审计报告

> **审计日期**: 2026-07-04
> **覆盖范围**: Phase 1–6（只读检查 + 报告生成）
> **参考规范**: `docs/coding-standards.md` v1.18.1（12 节规则）
> **问题总数**: 32 项（强制 21 / 建议 11）

## 摘要统计

| Phase | 强制 | 建议 | 小计 |
|-------|------|------|------|
| Phase 1 全局结构与目录 | 5 | 4 | 9 |
| Phase 2 前端代码与 UI | 4 | 1 | 5 |
| Phase 3 国际化 | 5 | 0 | 5 |
| Phase 4 状态/异步/反馈 | 4 | 0 | 4 |
| Phase 5 Rust 后端与 IPC | 2 | 1 | 3 |
| Phase 6 文档对齐与提交 | 1 | 5 | 6 |
| **合计** | **21** | **11** | **32** |

按规范章节：§1–2 结构与目录 9 · §3–4 状态与异步 4 · §4 i18n 5 · §5 用户反馈（合并入 Phase 4）0 · §6 UI 与性能 5 · §7–8 Rust/IPC 3 · §9–12 测试/提交/文档 6。

---

## Phase 1：全局结构与目录规范

### 1.1 TypeScript strict — 通过

- `tsconfig.json:14` 已开启 `strict: true`；同时开启 `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`。✅

### 1.2 模块拆分 — 通过

- 抽样检查 `account-manager`、`app-manager`、`system-settings`、`port-manager`、`dev-cleaner` 等模块，`page.tsx` 仅做组合，状态在 `store.ts`、编排走 `services/*.use-cases.ts`、IPC 在 `lib/tauri/commands/*`。✅

### 1.3 `@/` 别名导入 — 通过

- 全仓库 `src/` 下未检出 `../../` 形式的跨模块导入（仅各模块内部 `./`、`../` 相对路径用于同包测试与子组件，符合规范）。✅

### 1.4 Feature 目录结构 — 违规

- [违反 §2.1] `src/features/dev-toolbox/` — 缺少 `store.ts`、`hooks/`、`services/`，所有状态/编排内联在 `page.tsx`（240+ 行）— 建议按 roadmap v1.17 计划拆 `devtools/`、`diagnostics/`、`info/` 子模块，每个子模块自带 `store.ts` + `hooks/` — **强制**
- [违反 §2.1] `src/features/terminology/` — 缺少 `hooks/`、`services/`；`page.tsx` 直接持有 `useEffect` 编排逻辑、本地编辑态分散在 5+ 个 `useState` — 建议抽出 `hooks/useTerminologyController.ts` 与 `services/terminology.repository.ts` — **强制**
- [违反 §2.1] `src/features/token-calculator/` — 缺少 `store.ts`、`hooks/`；价格 CRUD 与汇率逻辑直接写在 `page.tsx` 与 `api.ts` — 建议补 `store.ts` 集中管理 pricing/汇率状态，控制器抽到 `hooks/` — **强制**
- [违反 §2.1] `src/features/hardware/` — 缺少 `hooks/`、`services/`；`HardwareCompare.tsx` 在 feature 根目录而非 `components/` — 建议把 `HardwareCompare.tsx` 与 `HardwareCompareTab.tsx` 移入 `hardware/components/`，并按需补 `hooks/` — **强制**
- [违反 §2.1] `src/features/quick-launch/` — 缺少 `hooks/`、`services/`；`page.tsx` 800+ 行内联扫描、导出、右键菜单编排 — 建议抽 `hooks/useQuickLaunchController.ts` 与 `services/quick-launch.repository.ts` — **强制**

### 1.5 组件放置 — 违规

- [违反 §2.2] `src/features/app-manager/CategoryFilter.tsx` — 单功能内部复用组件放在 feature 根目录而非 `app-manager/components/` — 移到 `components/CategoryFilter.tsx` — **强制**
- [违反 §2.2] `src/features/hardware/HardwareCompare.tsx`、`HardwareCompareTab.tsx` — 同上，应放 `hardware/components/` — **强制**
- [违反 §2.3] `src/features/system-settings/useSettingAction.ts` — 命名为 `useXxx` 的 hook 直接放在 feature 根目录；同模块 `hooks/` 目录存在但为空 — 移入 `hooks/useSettingAction.ts` — **强制**
- [违反 §2.3] `src/features/token-calculator/api.ts` — 直接调用 `invokeTauriCommand` 的服务层文件，命名不符合 `*.repository.ts` 约定，也未放进 `services/` — 重命名为 `services/token-calculator.repository.ts` — **建议**

### 1.6 命名约定 — 违规

- [违反 §2.3] `src/features/terminology/api.ts` — 仅 re-export `lib/tauri/commands/terminology`，无独立逻辑；如保留作为 facade 应放 `services/terminology.repository.ts`，否则直接删除让调用方从 `lib/tauri/commands/terminology` 导入 — **建议**
- [违反 §2.3] `src/features/app-manager/app-categories.ts`、`app-series.ts`、`recommended-apps.ts`、`columns.tsx` — 这些是常量/分类数据，命名符合习惯但 `columns.tsx` 类似文件在多个 feature 重复出现（`dev-cleaner/columns.tsx`、`env-detector/columns.tsx`），可考虑统一抽到 `model/columns.tsx` — **建议**

### 1.7 文档目录对齐 — 违规

- [违反 §11.2] `src/features/updater/` 存在（`store.ts`、`hooks/useUpdaterController.ts`、`error-classifier.ts`），但 `docs/modules/updater/` 目录不存在 — 新增 feature 时同步创建模块文档目录，至少 `README.md` + `roadmap.md` — **强制**
- [违反 §11.2] `src/features/refresh.ts`、`src/features/registry.tsx`、`src/features/types.ts` 为 features 元数据，不属于单一 feature；可在 `docs/modules/README.md` 增加一节"功能注册与刷新机制"说明，避免文档缺口 — **建议**

---

## Phase 2：前端代码与 UI 规范

### 2.1 shadcn/ui 复用 — 通过

- `components/ui/` 下已有 button、input、dialog、select、badge、alert-dialog、tabs、tooltip、card 等 shadcn 基元；feature 内未发现手写重复基础组件。✅

### 2.2 `cn()` 类名拼接 — 违规

> 规范 §6 强制："基础组件优先复用 shadcn/ui + Lucide 图标。类名拼接统一 `cn()`。"
> 全仓 `className={`...${var}...`}` 模板字符串拼接检出 33 处，主要分布在：

- [违反 §6] `src/components/common/UpdateDialog.tsx:446`、`:532` — 改用 `cn("size-4 shrink-0 transition-transform", showErrorDetails && "rotate-180")` — **强制**
- [违反 §6] `src/components/layout/Sidebar.tsx:61`、`:85` — 改用 `cn("ml-6 mr-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm leading-relaxed transition", isActive && "...")` — **强制**
- [违反 §6] `src/components/ui/setting-group.tsx:16`、`:18` — 基础 UI 组件本身更应严格使用 `cn()` — **强制**
- [违反 §6] `src/features/token-calculator/page.tsx:169`、`:180`、`:871`、`:882` — 数组拼接 className，改用 `cn(...)` — **强制**
- [违反 §6] `src/features/quick-launch/page.tsx:111`、`:700`、`:794` — 同上 — **强制** ✅ 已修复
- [违反 §6] `src/features/system-settings/page.tsx:585`、`src/features/dev-toolbox/page.tsx:231` — Tab 按钮样式条件拼接，改用 `cn()` — **强制**
- [违反 §6] `src/features/dev-cleaner/components/CustomCleanupDialog.tsx:330`、`:401`、`:448`、`src/features/dev-cleaner/components/DevCleanerPageContent.tsx:210` — 同上 — **强制** ✅ 已修复
- [违反 §6] `src/features/app-manager/CategoryFilter.tsx:91`、`:102` — 同上 — **强制**
- [违反 §6] `src/features/terminology/page.tsx:166`、`:175`、`:177`、`:656`、`:725`、`:795`、`:989`、`:1014`、`:1026`、`:1041`、`:1053` — 11 处模板拼接，量大且集中 — 同上 — **强制**
- [违反 §6] `src/features/system-settings/components/SettingToggle.tsx:29` — 同上 — **强制**

### 2.3 大列表虚拟化 — 通过

- `port-manager` 已用 `@tanstack/react-virtual`（`usePortManagerController.ts:368`）；`components/content/VirtualGridView.tsx`、`VirtualDataTable.tsx` 提供通用虚拟化能力，hardware/app-manager 已接入。`terminology` 的 industries/categories 列表通常 ≤20 项，无需虚拟化。✅

### 2.4 `useMemo` / `useCallback` — 通过（局部建议）

- controller 层普遍使用 `useCallback` 包装 handler，`useMemo` 处理派生数据（如 `account-manager/hooks/useAccountManagerController.ts`、`port-manager/hooks/usePortManagerController.ts`）。
- [违反 §6 建议] `src/features/dev-toolbox/page.tsx` 内 `runDiagnostic`、各 sub-tab 渲染函数未做 `useCallback`/`useMemo` 包装，每次主组件渲染都会重建 — 建议在拆分模块时一并补上 — **建议**

### 2.5 代码分割 — 违规

- [违反 §6] `src/features/dev-toolbox/page.tsx:19-22` — 静态 `import PortManager / DevCleaner / EnvDetector / TokenCalculatorPage`，4 个子功能同步打包进 dev-toolbox chunk — 改为 `lazy(() => import("@/features/port-manager/page"))` 并在 tab 切换时按需挂载 — **强制**
- [违反 §6] `src/features/registry.tsx:8-18` + `src/App.tsx:60-64` — 所有 11 个 feature 描述符及其 page 通过静态 import 引入，`appFeatures.map` 渲染 `<Route>`，意味着首屏加载即拉取全部 feature 代码 — 建议把 `AppFeature.render` 改为 `lazyComponent: ReactNode` 工厂，在 `<Route>` 内用 `<Suspense>` 包裹 — **强制**

### 2.6 共享 store 作用域 — 通过

- `quick-launch` 复用 `useAppManagerStore`（共享扫描数据），通过 `useAppManagerStore.getState()` 与 selector 取字段，未污染 app-manager 的筛选状态。`hardware` 的 `useHardwareCompareStore` 用 `selectedIdsByScope[scope]` / `filtersByScope[scope]` 做作用域隔离，符合 §6 "不同数据域不共享筛选条件"。✅

---

## Phase 3：国际化（i18n）审计

### 3.1 硬编码文案 — 违规

- [违反 §4] `src/features/quick-launch/page.tsx:222` — JSX 内硬编码中文 `+{apps.length - 6} 更多` — 改为 `t("quickLaunch.moreCount", { count: apps.length - 6 })` 并补 zh/en key — **强制** ✅ 已修复（复用已有 `quickLaunch.showMore` key）
- [违反 §4] `src/features/quick-launch/page.tsx:690` — `title` 属性拼接硬编码中文 `（开发者工具：导出全量分类数据用于优化规则）` — 整段改为 i18n key（如 `quickLaunch.exportOverridesTooltip`） — **强制** ✅ 已修复（复用已有 `quickLaunch.exportOverridesTooltip` key）
- [违反 §4] `src/features/dev-cleaner/components/CustomCleanupDialog.tsx:326` — 业务判断 `cmd.risk.includes("高风险")`，把中文原始值作为 canonical 判断依据 — 后端 `CleanupCommandDef.risk` 应改为 `risk_level: "high" | "medium" | "low"` 枚举，前端按枚举判断并 i18n 展示 — **强制** ✅ 已修复（后端新增 `RiskLevel` 枚举与 `risk_level` 字段，前端 `isHighRisk = cmd.risk_level === "high"`，保留 `risk` 字段作为展示用详细描述）

### 3.2 locale key 同步 — 通过

- 用脚本 flatten `src/i18n/locales/zh.json` 与 `en.json` 后比较：两侧各 1983 key，`zh only` = 0，`en only` = 0。✅

### 3.3 顶层 `t()` 调用 — 通过

- 未检出模块顶层 / 静态常量 / store 初始值里的 `t()` 调用；`registry.tsx` 中 `createNavigationItems(t)` / `createConfigItems(t)` 工厂函数在 `App.tsx:148-153` 内以 `useMemo([t])` 调用，符合 §4 "在渲染期 / useMemo / 工厂函数中计算"。✅

### 3.4 语言无关 canonical value — 违规

- [违反 §4] `src/data/phone.ts` — 全文件 ~2200 行，所有 `cpu`、`gpu`、`mainCamera`、`waterproof`、`fingerprint`、`material`、`displayType`、`chipset` 等字段以中文原始值作为 canonical value（如 `material: "玻璃机身 + 钛金属边框"`）；文件末尾的 `MATERIAL_TO_KEY` 等映射表是把中文反向映射到 key，意味着英文界面也在用中文做查表，违反 §4 "禁止中文原始值做英文界面回退" — 应反转数据模型：data 层用 canonical key（`material: "glassTitan"`），展示层 `t("phoneCompare.material.glassTitan")` — **强制**
- [违反 §4] `src/data/phone.ts:2180-2187` — `CAMERA_TERM_TO_KEY` 同样以中文做 key，包含 `徕卡/哈苏/蔡司` 等品牌词 — 改为 canonical key（`leica/hasseblad/zeiss`）后由展示层 i18n — **强制**
- [违反 §4] `src/data/phone.ts:2199` — `str.replace(/\(屏下\)/g, ...)` 在数据层用正则改中文括号注释 — 数据层应输出 canonical，由展示层组合翻译 — **强制**

### 3.5 i18n 检查脚本 — 通过

- `scripts/quality/check-i18n-guards.mjs` 已接入 `lint:fe`，作为提交前门禁。✅

---

## Phase 4：状态管理、异步安全与用户反馈

### 4.1 store 分层 — 通过

- 各 `store.ts` 仅含状态字段与简单 setter；复杂编排均在 `services/*.use-cases.ts`；Tauri 调用集中在 `lib/tauri/commands/*` 与 `services/*.repository.ts`。✅

### 4.2 Zustand Controller — 违规

> 规范 §3.2 强制："不得把无 selector 的 `useXxxStore()` 返回值放进 `useCallback` / `useMemo` / `useEffect` 依赖。"

- [违反 §3.2] `src/features/account-manager/hooks/useAccountManagerController.ts:28` — `const store = useAccountManagerStore();` 无 selector 订阅整 store；随后 `useMemo` 依赖列表里直接列 `store.stations`、`store.accounts`、`store.selectedStationId`、`store.selectedAccountId`（行 99/103/107/111），`useCallback(handleOpenExternalApps, [store])` (行 119) 把整 store 当依赖 — 改为按字段 selector：`const stations = useAccountManagerStore(s => s.stations)` 等；actions 用 `useAccountManagerStore(s => s.setStations)` 形式订阅 — **强制**
- [违反 §3.2] `src/features/system-settings/page.tsx:50` — `const store = useSystemSettingsStore();` 后 `loadTabSettings = useCallback(..., [store, t])` (行 113)、`useEffect(..., [store.activeTab, loadTabSettings])` (行 118) — store 任意字段更新都会让 `loadTabSettings` 重建并触发 effect 重跑 — 改为 selector 取 `activeTab` 与各 setter — **强制**
- [违反 §3.2 建议] `src/features/system-settings/components/sections/DisplaySection.tsx:12`、`KeyboardSection.tsx:12`、`LockScreenSection.tsx:13`、`DockSection.tsx:13`、`SleepSection.tsx:12`、`DisplayDockSection.tsx:19` — 多个 section 组件 `const store = useSystemSettingsStore();` 订阅整 store；虽然未直接进 deps，但每次 store 任意字段变化都会触发整组件重渲 — 改为 selector 精细订阅 — **建议**
- [违反 §3.2 建议] `src/features/terminology/page.tsx:235`、`:468`、`:905` — 三处 `const { ... } = useTerminologyStore();` 解构整 store；同上，性能浪费 — 改为 `useShallow` 或 selector — **建议**

### 4.3 重入保护 — 通过

- `account-manager` 使用 `useGuardedAsync` / `useGuardedAsyncSet`（`useAccountManagerController.ts:29-41`）；`system-settings/useSettingAction.ts:34` 用 `applyingKeys.has(key)` 做同 key 防重入；`quick-launch/page.tsx:564-566` 用 `loading` + `useAppManagerStore.getState().loading` 双重检查。✅

### 4.4 Effect 清理 — 通过

- 抽样 `useAccountManagerController.ts:65-70`（清理 `justRefreshedTimersRef` 定时器）、`App.tsx:90-96`（cancelled flag）、`App.tsx:107-113`（unlisten）、`DisplaySection.tsx:33`（`unlisten?.()`）、`quick-launch/page.tsx:431-438`（removeEventListener）均有清理。✅

### 4.5 平台边界 — 通过

- `src/platform/capabilities.ts` 提供 `canUseDesktopFeatures` / `canUseTauriCommands` / `canUseTauriWindow`；`App.tsx`、`DisplaySection.tsx:24`、`HardwareCompareTab.tsx` 等均通过这些 API 判断，未检出 `window.__TAURI__` 散落。✅

### 4.6 写操作反馈 — 通过

- `useSettingAction.ts:40-45` 成功/失败均 toast；`useAccountManagerController.ts` 各 handler 有 `toast.success` / `toast.error`；`useDevCleanerController.ts:124-156` 通过 `cleanupMessage` 状态展示成功/失败/中断三态。✅

### 4.7 空状态/失败态 — 通过

- `terminology/page.tsx:944-960` 有 loading 与 `FeatureLoadError` 失败态；`HardwareCompareTab.tsx:21-48` 有 loadError 重试；`account-manager/page.tsx` 各列表均处理空态。✅

### 4.8 危险操作确认 — 通过

- `DestructiveConfirmDialog` 在 `port-manager/page.tsx:112`、`terminology/page.tsx:436`、`system-settings/page.tsx:634`、`system-settings/components/sections/QuickActionsSection.tsx:76`（reboot/shutdown）、`account-manager/components/external-apps-panel.tsx:157` 均有使用。✅

---

## Phase 5：Rust 后端与 IPC 契约

### 5.1 后端模块结构 — 通过

- `src-tauri/src/` 按领域分目录：`account_manager/`、`app_manager/`、`dev_cleaner/`、`env_detector/`、`port_manager/`、`system_settings/`、`terminology/`、`token_calculator/`、`app_updater/`、`sleep_inhibitor/`、`window_theme/`、`app_preferences/`；`commands.rs` 仅作为 `app_invoke_handler!` 宏的注册表，无业务逻辑堆叠。✅

### 5.2 错误边界 — 违规

- [违反 §7.2] `src-tauri/src/account_manager/commands.rs:1289` — IPC 命令 `set_account_proxy_enabled` 路径上使用 `.expect("account exists")`；前面 1273 行已用 `ok_or_else(|| AccountManagerError::not_found(...))?` 做了 `find` 的失败处理，1287 行的 `.find(...).cloned()` 在已确认存在的账号上调用，理论上不会 panic，但 IPC 路径禁用 `.expect()` — 改为 `ok_or_else(|| AccountManagerError::not_found(...))?` 与上游保持一致 — **强制**
- [违反 §7.2] `src-tauri/src/account_manager/commands.rs:552`、`:558` — IPC 命令 `reorder_stations`（或同类排序命令）中使用 `.expect("reorder_by_ids returns same-length vec")` / `.expect("partition preserved this element")` — 同上，应返回 `AppResult` 或在 `reorder_by_ids` 内部用 `?` 传播错误 — **强制**
- 注：`src-tauri/src/lib.rs:179` `.expect("error while building tauri application")` 在 `tauri::Builder` 启动链路上，启动失败本身无法降级，符合"启动期配置读取失败须显式传播"的兜底语义，不计违规。

### 5.3 前端错误解析 — 违规

- [违反 §7.2] `src/features/updater/error-classifier.ts:102`、`:106` — 自行 `error instanceof Error` 与 `typeof error === "string"` 判断 — 应改为 `parseCommandError(error)` 后基于 `code`/`message` 分类 — **强制** ✅ 已修复（normalizeErrorMessage 改用 getErrorMessage）
- [违反 §7.2] `src/features/updater/hooks/useUpdaterController.ts:108`、`:110` — 同上，`error instanceof Error && error.message` 与 `typeof error === "string"` 散装判断 — 改为 `getErrorMessage(error, t("..."))` — **强制** ✅ 已修复（7 行三元表达式改用 getErrorMessage(error)）
- [违反 §7.2] `src/features/app-manager/services/app-manager.use-cases.ts:51`、`:160`、`:180` — `String(error)` 用于构建错误对象/批量结果 — 改为 `getErrorMessage(error)` — **强制** ✅ 已修复
- [违反 §7.2] `src/features/dev-cleaner/hooks/useDevCleanerController.ts:60`、`:95`、`:154` — `t("...error", { error: String(error) })` — 改为 `{ error: getErrorMessage(error) }` — **强制** ✅ 已修复
- [违反 §7.2] `src/features/app-manager/model/operations.ts:39`、`:63` — `String(error)` 写入操作结果 — 同上 — **强制** ✅ 已修复
- [违反 §7.2] `src/features/app-manager/hooks/useAppManagerController.ts:425` — `toLocalizedError("...", String(error) || undefined)` — 改为 `getErrorMessage(error)` — **强制** ✅ 已修复（同文件 :301 一并修复）
- [违反 §7.2] `src/features/app-manager/components/AppManagerErrorBoundary.tsx:16` — `error: String(error)` — 改为 `getErrorMessage(error)` — **强制** ✅ 已修复

### 5.4 IPC 契约集中维护 — 通过

- `src/lib/tauri/contracts.ts` 集中定义 168 个 `defineTauriCommand` 契约；`src-tauri/src/commands.rs` 通过 `app_invoke_handler!` 宏注册；新增命令需同时改 Rust 实现、宏注册、TS 契约、TS 类型 4 处，未发现绕开契约的散落 invoke。✅

### 5.5 命令名/参数/类型一致性 — 通过（局部建议）

- 抽样比对：`restart_after_update` / `reboot_now` / `shutdown_now` / `scan_installed_apps` / `set_account_proxy_enabled` 等命令名 TS 与 Rust 一致；DTO 字段（`AppUpdateInfo`、`StationAccount`、`ProjectInfo`）两侧字段名一致。
- [违反 §8 建议] `src/lib/tauri/contracts.ts:91` `restart_after_update` 在 TS 侧 `app.ts:8` 又写了一个 `restartApp()` 包装函数，命名与契约不一致 — 建议统一通过 `commands.app.restartAfterUpdate` 调用，避免 `restartApp` 这种语义模糊的别名 — **建议**

### 5.6 批量与取消幂等 — 通过

- `cancel_app_update_download`、`cancel_batch_operation`、`stop_scan`、`stop_custom_cleanup` 均为幂等取消；`batch_upgrade_apps` / `batch_uninstall_apps` 返回 `BatchOperationResult` 含每项成功/失败状态，重复调用不会损坏状态。✅

---

## Phase 6：文档对齐与提交规范

### 6.1 测试覆盖 — 违规

- [违反 §9] `src/features/updater/` — 涉及 IPC（`check_for_app_update`、`download_and_install_app_update`）与共享类型（`AppUpdateInfo`、`UpdaterErrorInfo`），但 `__tests__/` 仅有 `error-classifier.test.ts`，缺少 `useUpdaterController` 行为测试与更新下载/安装流程契约测试 — **强制**
- 注：`src/i18n/` 无独立组件测试，但 `SettingsDialog.test.tsx` 覆盖了语言切换行为，符合 §9 "i18n 共享组件覆盖切换语言后 UI 更新"。

### 6.2 提交历史 — 通过

- `git log` 近 30 条提交均为 Conventional Commits 格式：`feat:`、`fix:`、`docs:`、`refactor:`、`chore:`、`build:`，scope 使用 kebab-case（`macos`、`src-tauri`、`quick-launch`、`github-actions` 等）。✅

### 6.3 roadmap.md 同步 — 违规

- [违反 §11.3] `docs/modules/dev-toolbox/roadmap.md:13` 评分列写 "性能 ⭐⭐⭐⭐⚬ | 子页懒加载"，但实际 `src/features/dev-toolbox/page.tsx:19-22` 静态 `import PortManager / DevCleaner / EnvDetector / TokenCalculatorPage`，4 个子页同步打包 — 应同步更新评分说明为 "子页同步打包，待 v1.17 拆分时改为 lazy" 或直接修复代码 — **建议**
- [违反 §11.3] `docs/modules/system-settings/roadmap.md:23-29` v1.16 列表里 `[x] useEffect 补充 loadTabSettings 依赖` 已打勾，但 `src/features/system-settings/page.tsx:118` 的 `useEffect` deps 是 `[store.activeTab, loadTabSettings]`，而 `loadTabSettings` 依赖 `[store, t]`，整 store 变化即重跑 —— 修复并未真正解决 effect 重跑问题 — 应把该 checkbox 改回 `[ ]` 并补充说明 "需配合 selector 拆解 store 订阅" — **建议**

### 6.4 bugs.md 维护 — 通过

- 11 个模块 `bugs.md` 均存在，前次报告的问题已标注 "问题已关闭" 或 "暂无违规问题记录"。✅

### 6.5 引用链接 — 违规

- [违反 §11] `docs/roadmap/release-themes.md:45` — 引用 `[product-iteration-reference.md](../product-iteration-reference.md)`，但 `docs/product-iteration-reference.md` 不存在 — 应补建该文件，或移除链接 — **强制**
- [违反 §11] `docs/coding-standards.md:149` — `[product-iteration-reference.md](./product-iteration-reference.md)` 同样指向不存在文件 — 同上 — **强制**
- [违反 §11 建议] `docs/coding-standards.md:122` 索引区写 "方法论背景与未来方向菜单见 product-iteration-reference.md"，与上面两条一致 — 同上 — **建议**

### 6.6 文档目录与代码对齐 — 违规

- 与 Phase 1.7 重复：`src/features/updater/` 存在但 `docs/modules/updater/` 缺失，`docs/modules/README.md` 表格也未列出 updater 行 — **强制**（已在 Phase 1 计入，此处不重复计数）

---

## 修复优先级建议

1. **P0 强制 · i18n**：`quick-launch/page.tsx` 两处硬编码中文、`dev-cleaner/components/CustomCleanupDialog.tsx` `高风险` 判断、`data/phone.ts` canonical value 反转（影响英文界面正确性）
2. **P0 强制 · IPC 安全**：`account_manager/commands.rs` 三处 `.expect()` 改 `?` 传播；前端 7 处 `String(error)` / `error instanceof Error` 改走 `parseCommandError` / `getErrorMessage`
3. **P1 强制 · 状态/异步**：`useAccountManagerController.ts` 与 `system-settings/page.tsx` 的整 store 订阅 + deps 修复（可能正在导致 effect 无限重跑）
4. **P1 强制 · 代码分割**：`registry.tsx` + `App.tsx` 改 lazy 加载，`dev-toolbox/page.tsx` 4 个子页改 `lazy()`
5. **P1 强制 · 文档**：补 `docs/modules/updater/`、修复 `product-iteration-reference.md` 失效链接
6. **P2 强制 · 类名拼接**：33 处 `className={`...${var}...`}` 改 `cn()`（量大但机械化，可分批）
7. **P2 强制 · Feature 目录**：`dev-toolbox` / `terminology` / `token-calculator` / `quick-launch` / `hardware` 补 `hooks/` + `services/`，组件移入 `components/`
8. **P3 建议**：`useSettingAction.ts` 移入 `hooks/`、`api.ts` 重命名为 `*.repository.ts`、roadmap 文案同步、section 组件 selector 化

> Phase 8 修复时按上述优先级逐项独立 commit，不合并、不推送。`data/phone.ts` canonical value 反转与 `registry.tsx` lazy 化属于较大重构，建议先输出方案文档待人工确认后再执行。
