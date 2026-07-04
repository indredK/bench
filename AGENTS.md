# Bench 项目 — AI 规范审计工作流

> 基于 `docs/coding-standards.md`（12 节规则）和 `docs/development-workflow.md` 设计的渐进式检查流程。
>
> **用法**：按顺序每次投喂一个 Phase，完成后再给下一个。AI 会自动输出每个违规项的文件路径、违反的规范条款和修改建议。
>
> **报告**：开始前先读取已有的 `docs/audit-report.md`（如有）。每个 Phase 完成后，**将发现的问题追加写入 `docs/audit-report.md`**，按 Phase 分节。全部 Phase 完成后该文件即为完整审计报告，可供其他工具（如 Trae CN）读取。
>
> **提交策略**：Phase 8 修复时**每个违规项独立提交**，不合并、不推送，仅保留本地 commit 历史供人工审查。
>
> **执行建议**：Phase 1–7 可一次性投喂运行（均为只读检查 + 写报告，无副作用）。Phase 8 建议单独分批执行，优先修 **强制** 级别，审查后再修 **建议** 级别，避免单次上下文过长导致中断。

---

## Phase 1：全局结构与目录规范

**参考**: `docs/coding-standards.md §1 通用、§2 前端目录、§11 文档`

请检查项目是否符合以下规范，逐条列出违规项：

1. **TypeScript strict** — 检查 `tsconfig.json` 是否开启 `strict`；搜索源码中是否有未使用的局部变量、参数、导出（提示：tsc 可检测）
2. **模块拆分** — 检查是否有文件同时承担视图 + 状态 + 业务编排 + 平台调用（例如一个 `.tsx` 里同时有 JSX、`useState`、直接调 `invoke`）
3. **`@/` 别名导入** — 搜索是否有 `import` 使用相对路径 `../../` 而非 `@/` 别名
4. **Feature 目录结构** — 遍历 `src/features/` 下每个模块，检查是否包含 `page.tsx`、`feature.tsx`、`store.ts`、`hooks/`、`services/`
5. **组件放置** — 检查 `components/ui/` 和 `components/layout/` 下的组件是否可被跨功能复用；检查 feature 内 `components/` 是否存在只被一个页面使用的组件
6. **命名约定** — 搜索是否有状态文件不叫 `store.ts`、业务编排不叫 `*.use-cases.ts`、外部适配不叫 `*.repository.ts`；检查 Rust 端 `commands.rs`、`types.rs`、`state.rs` 命名
7. **文档目录对齐** — 对比 `src/features/<id>/` 和 `docs/modules/<id>/`，检查是否有 feature 缺少对应文档目录（至少 `README.md` + `roadmap.md`）

**输出格式**：每条问题一行 `[违反 §X] 文件路径:行号 — 问题描述 — 修改建议`

---

## Phase 2：前端代码与 UI 规范

**参考**: `docs/coding-standards.md §2 前端目录（续）、§6 UI与性能`

逐条检查：

1. **shadcn/ui 复用** — 搜索是否有手写的基础组件（如 Button、Input、Dialog、Select、Badge）而不是复用 `components/ui/` 下的 shadcn/ui 组件
2. **`cn()` 类名拼接** — 搜索是否有手动 `className={` `${var1} ${var2}` `}` 而非使用 `cn()`
3. **大列表虚拟化** — 检查是否有直接 `.map()` 渲染长列表的地方（超过 ~50 项），应评估虚拟化方案（如 `react-virtuoso` / `@tanstack/react-virtual`）
4. **`useMemo`/`useCallback`** — 检查传给子组件的对象/回调/派生数据是否缺少记忆化包装
5. **代码分割** — 检查大数据模块或低频页面是否存在首屏同步打包（应通过 `lazy()` / `import()` 动态导入）
6. **共享 store 作用域** — 检查被多个子页面复用的 store 是否明确了作用域、是否存在不同数据域共享筛选条件

**输出格式**：每条问题一行 `[违反 §X] 文件路径:行号 — 问题描述 — 修改建议`

---

## Phase 3：国际化（i18n）审计

**参考**: `docs/coding-standards.md §4 国际化`

严格逐条检查：

1. **硬编码文案** — 全局搜索（排除 `src/i18n/locales/` 和 `.md` 文件）是否有中/英文字符串直接出现在 JSX、组件、toast、弹窗、菜单中
2. **locale key 同步** — 读取 `src/i18n/locales/zh/` 和 `en/`，对比 key 集合，列出缺失项（zh 有 en 无 / en 有 zh 无）
3. **顶层 `t()` 调用** — 搜索模块顶层、静态常量、store 初始值里是否有 `t()`（应在渲染期 / `useMemo` / 工厂函数中计算）
4. **语言无关 canonical value** — 搜索是否有中文原始值作为英文界面回退的情况

**输出格式**：每条问题一行 `[违反 §4] 文件路径:行号 — 问题描述 — 修改建议`

---

## Phase 4：状态管理、异步安全与用户反馈

**参考**: `docs/coding-standards.md §3 状态与异步、§5 用户反馈`

逐条检查：

1. **store 分层** — `store.ts` 是否有复杂业务编排（应放 `*use-cases.ts`）；是否有 Tauri 调用直接写在 store 里（应放 `*repository.ts` / `lib/tauri/commands/`）
2. **Zustand Controller** — 搜索 controller 中无 selector 订阅整 store，把 `useXxxStore()` 返回值放进 `useCallback`/`useMemo`/`useEffect` 依赖（会导致 effect 无限重跑）
3. **重入保护** — 可重复点击/提交/启动的异步函数是否有防重入保护（`useGuardedAsync`、loading 状态检查等）
4. **Effect 清理** — `useEffect` 中注册的事件/定时器/订阅是否有对应的清理逻辑
5. **平台边界** — 搜索是否有 `window.__TAURI__` 或平台判断硬编码在 JSX 中（应使用 `canUseDesktopFeatures()` / `canUseTauriCommands()`）
6. **写操作反馈** — 增删改等写操作是否有成功/失败反馈和加载态
7. **空状态/失败态** — 列表页、详情页是否有空状态和错误状态的 UI
8. **危险操作确认** — 关机/重启/清空/释放端口/删除数据/重置权限等场景是否使用 `DestructiveConfirmDialog` 二次确认

**输出格式**：每条问题一行 `[违反 §X] 文件路径:行号 — 问题描述 — 修改建议`

---

## Phase 5：Rust 后端与 IPC 契约

**参考**: `docs/coding-standards.md §7 Rust后端、§8 IPC契约`

逐条检查：

1. **后端模块结构** — `src-tauri/src/` 下是否按领域分目录，是否有逻辑堆在 `main.rs` 或根级杂项文件
2. **错误边界** — IPC 命令是否使用 `AppResult<T>` 而非 `Result<T, String>`；搜索 `.expect()` / `.unwrap()` 是否在 IPC 路径上
3. **前端错误解析** — 搜索 `typeof error === "string"`、`String(error)`、`error instanceof Error` 散装判断（应使用 `parseCommandError` / `getErrorMessage` / `translateError`）
4. **IPC 契约集中维护** — `src/lib/tauri/contracts.ts` 和 `src-tauri/src/commands.rs` 是否同步；是否有新命令绕开契约体系
5. **命令名/参数/类型一致性** — 对比 TS 侧和 Rust 侧的命令名、参数名、返回 DTO 字段是否一致
6. **批量与取消幂等** — 批量任务和取消接口是否按幂等设计

**输出格式**：每条问题一行 `[违反 §X] 文件路径:行号 — 问题描述 — 修改建议`

---

## Phase 6：文档对齐与提交规范

**参考**: `docs/coding-standards.md §9 测试、§10 提交规范、§11 文档、§12 评审聚焦`；`docs/development-workflow.md`

逐条检查：

1. **测试覆盖** — 涉及 IPC、共享类型、复杂业务编排的模块是否有对应测试；i18n 组件是否有语言切换行为测试
2. **提交历史** — `git log` 近期提交是否符合 Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` 等）
3. **`roadmap.md` 同步** — 对比 `docs/modules/*/roadmap.md` checkbox 与实际功能，是否有已实现但未打勾、或已合入未更新的情况
4. **`bugs.md` 维护** — 各模块 `bugs.md` 是否有已修复但未关闭的记录
5. **引用链接** — `docs/` 下各 `.md` 文件的相对链接是否有效

**输出格式**：每条问题一行 `[违反 §X] 文件路径:行号 — 问题描述 — 修改建议`

---

## Phase 7：生成审计报告

**前置条件**: 已完成 Phase 1–6，`docs/audit-report.md` 中已有各 Phase 的问题记录。

请执行以下步骤生成最终报告：

1. **读取** `docs/audit-report.md`，确认已有内容
2. **补充摘要** — 在文件头部追加以下内容：
   - 审计日期
   - 本次审计覆盖的 Phase 范围
   - 问题总数统计（按 Phase / 按严重级别 / 按规范章节）
3. **归类整理** — 确保每个问题格式统一为：
   ```markdown
   - [违反 §X] `文件路径:行号` — 问题描述 — 修改建议 — **强制/建议**
   ```
4. **写入** 最终结果到 `docs/audit-report.md`

> 此文件将作为完整审计记录，供其他工具（如 Trae CN）读取。

---

## Phase 8（可选）：自动修复已知问题

**前置条件**: 已完成 Phase 1–7，AI 手中已有完整的 `docs/audit-report.md`。

**核心原则**：每个违规项独立修复 → 独立提交 → 不推送，保留本地 commit 历史供审查。

### 修复流程（逐项循环）

对审计报告中列出的每条问题，按以下步骤操作：

```
违规项 → 读文件确认上下文 → 修复代码 → 更新 audit-report 标记 → 提交 → 下一项
```

1. **选一条违规项** — 优先选 **强制** 级别，同一文件的多个问题可合并修复
2. **读文件确认上下文** — 理解代码意图，不要盲目修改
3. **修复代码** — 按规范要求修改，保持代码风格一致
4. **更新 `docs/audit-report.md`** — 在该问题行尾追加 `✅ 已修复`
5. **运行检查** — 验证不改坏：
   ```bash
   pnpm run lint:fe && pnpm run test:critical
   ```
6. **独立提交** — 仅 stage 改动的文件，commit 使用 Conventional Commits 格式：
   ```
   fix(<scope>): <违规项简要描述>

   违反: §X 规范
   文件: 路径:行号
   ```
   **不要** 使用 `git add .`，只 stage 与本次修复直接相关的文件。
   **不要** 推送（`git push`），仅保留本地 commit。

### 注意事项

- 如果某个修改涉及复杂重构（如目录重组、模块拆分），输出方案描述即可，不做大范围重写，待人工确认后再执行
- 同一自然文件的多个紧耦合问题可一次提交，但 commit message 需列出所有涉及项
- 提交后通过 `git log --oneline -5` 确认 commit 历史清晰可读
