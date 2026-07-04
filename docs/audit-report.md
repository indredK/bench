# Bench 项目代码规范审计报告

> **审计完成**：2026-07-05，所有强制项已修复，建议项已评估处理。
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
- 11 个模块 `bugs.md` 均存在

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
