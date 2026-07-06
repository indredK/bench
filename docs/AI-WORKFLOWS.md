# Bench AI Workflows

> **AI 操作手册** — 本文档定义了 AI 在 Bench 项目中的四种工作模式。
>
> 入口：由 `AGENTS.md` 根据用户指令路由到对应 workflow。
>
> 所有 workflow 执行前必须先读取：
> 1. `docs/ARCHITECTURE.md` §2（禁止模式）
> 2. `docs/coding-standards.md`（编码规范）
> 3. `docs/development-workflow.md`（开发流程）
> 4. `docs/audit-report.md` "不计违规决策"章节（避免重复标记）
> 5. `.cursorrules`（行为约束）

---

## /review — AI 代码审查

**触发条件**：用户要求 review / 审查 / 审阅代码，或提交 PR。

### 执行步骤

1. **读取上下文**
   - 如果是 commit/PR review：`git diff <range>` 获取改动
   - 如果是文件 review：读取指定文件
   - 如果是全量审计：按 `AGENTS.md` Phase 1–7 执行

2. **审查维度**（按优先级）
   - 🔴 **强制违规**：对照 `coding-standards.md` 逐条检查
     - i18n 硬编码文案（§4）
     - Zustand 整 store 进 hook 依赖（§3.2）
     - IPC 命令无 contract（§8）
     - 危险操作无二次确认（§5）
     - 平台判断散落 JSX（§3.4）
   - 🟡 **架构违规**：对照 `ARCHITECTURE.md` §2 禁止模式
   - 🟢 **建议项**：useMemo 缺失、注释风格、命名约定

3. **输出格式**
   ```
   [§X] 文件路径:行号 — 问题描述 — 修改建议 — **强制/建议**
   ```

4. **特殊规则**
   - 跳过 `docs/audit-report.md` "不计违规决策"中列出的模式
   - 跳过 "已通过检查项" 中的领域（除非有新增代码改动）
   - 发现新违规时，先报告不擅自修改

### ⛔ 完成前自检

- [ ] 已对照 `ARCHITECTURE.md` §2 + `coding-standards.md` 逐条检查
- [ ] 已跳过 `audit-report.md` "不计违规决策"中的模式
- [ ] 输出格式符合 `[§X] 文件路径:行号 — 问题描述 — 修改建议 — **强制/建议**`
- [ ] 发现新违规时先报告，未擅自修改
- [ ] 遇到任何不确定，已停下问用户

---

## /fix — AI 自动修复（含 Bug 修复）

**触发条件**：用户要求 fix / 修复 / 改 bug。

### 执行步骤

1. **问题确认**
   - 复现或理解问题：读取相关代码 + 测试
   - 确认影响范围（单文件 / 跨模块 / IPC 边界）
   - 检查已有测试：`pnpm run test:critical`

2. **修复编码**
   - 每项修改对照 `coding-standards.md` 和 `ARCHITECTURE.md` §2
   - 同一自然文件的多个紧耦合问题可一次性修复
   - 涉及复杂重构时，只输出方案描述供人工确认

3. **验证**
   ```bash
   pnpm run lint:fe        # i18n guard + tsc
   pnpm run test:critical  # 关键路径测试
   ```

4. **更新文档**
   - 如果修复涉及 roadmap 项 → 勾选 `docs/modules/<id>/roadmap.md`
   - 如果修复涉已知 bug → 关闭 `docs/modules/<id>/bugs.md` 记录（该模块无此文件时，从 `docs/modules/_bugs-template.md` 复制新建，把本次 bug 记入 Closed）
   - 在 `docs/audit-report.md` 问题行尾追加 `✅ 已修复`

5. **提交**（仅当用户明确要求时）
   - 每个违规项独立 commit
   - 格式：`fix(<scope>): <描述>`
   - 只 stage 与本次修复直接相关的文件
   - 不推送

### ⛔ 完成前自检

- [ ] 已对照 `ARCHITECTURE.md` §2 十条禁止模式
- [ ] `pnpm run lint:fe` 通过
- [ ] `pnpm run test:critical` 通过
- [ ] 有 Rust 改动则 `cargo clippy -- -D warnings` 通过
- [ ] 已回写 `roadmap.md` / `bugs.md` / `audit-report.md`
- [ ] commit 仅 stage 相关文件，未 `git add .`，未 push
- [ ] 遇到任何不确定，已停下问用户

---

## /doc — AI 文档演进

**触发条件**：用户要求 doc / 文档 / 更新文档 / 对齐文档。

### 执行步骤

1. **读取现状**
   - 打开 `docs/README.md` 确认文档索引
   - 打开目标模块 `docs/modules/<id>/README.md` + `roadmap.md`

2. **文档同步检查**
   - `roadmap.md` checkbox 与实际功能是否一致
   - 新增 feature 是否有对应 `docs/modules/<id>/` 目录
   - 引用链接是否有效
   - `coding-standards.md` 中的约定是否过时

3. **更新文档**
   - roadmap：已实现功能从 Backlog 移除，未实现的保留
   - README：更新索引和状态
   - ARCHITECTURE.md：如果有架构变更
   - coding-standards.md：如果有新约定沉淀
   - **DECISIONS.md：若本次对话确定了方向性取舍（改主题、砍功能、选方案），追加一条 `D-NNN`**

4. **验证**
   - 检查 `docs/` 下所有跨文件链接有效
   - 确认 `docs/modules/README.md` 的模块列表与 `src/features/` 对齐
   - 确认文档路径无空壳跳转 stub

### ⛔ 完成前自检

- [ ] `roadmap.md` checkbox 与实际功能一致
- [ ] `docs/modules/README.md` 模块列表与 `src/features/` 对齐
- [ ] 所有跨文件链接有效
- [ ] 方向性取舍已追加 `D-NNN` 到 `DECISIONS.md`
- [ ] `pnpm run check:docs` 通过
- [ ] 遇到任何不确定，已停下问用户

---

## /feature — AI 功能研发

**触发条件**：用户要求开发新功能 / 新模块。

### 执行步骤

1. **需求理解**
   - 读取 `docs/ROADMAP.md` 确认当前主题
   - 读取 `docs/DECISIONS.md` 确认相关方向性决策（避免重做已被推翻的方案）
   - 读取对应 `docs/modules/<id>/roadmap.md` 确认 backlog 项
   - 如果无对应模块：创建 `src/features/<id>/` + `docs/modules/<id>/`

2. **设计（大改需要）**
   - 读已有的 `design.md` 对标模式（如 account-manager 或 system-settings）
   - 涉及 Account Manager / 跨平台 / 大范围重构时先写设计稿

3. **编码**

   新 feature 默认结构：
   ```
   src/features/<id>/
   ├── feature.tsx       # AppFeature descriptor + lazy()
   ├── page.tsx          # View composition
   ├── store.ts          # Zustand state + setters
   ├── hooks/            # useXxxController.ts
   └── services/         # *.use-cases.ts + *.repository.ts (按需)
   ```

   注册链路：
   ```
   feature.tsx → src/features/registry.tsx (加入 appFeatures 数组)
               → docs/modules/<id>/README.md + roadmap.md
               → src/i18n/locales/{zh,en}.json (补 nav.<id> + 功能内文案)
   ```

   Rust 侧：
   ```
   src-tauri/src/<domain>/
   ├── mod.rs
   ├── commands.rs
   └── types.rs
   → 注册到 src-tauri/src/commands.rs 宏
   ```

4. **IPC 契约注册**（如适用）
   ```
   src/lib/tauri/contracts.ts    → defineTauriCommand + TAURI_COMMANDS 分组
   src/lib/tauri/commands/*.ts   → 类型化命令包装
   src/lib/tauri/types/*.ts      → DTO 类型
   ```

5. **验证**
   ```bash
   pnpm run lint:fe
   pnpm run test:critical
   cd src-tauri && cargo clippy -- -D warnings
   ```

6. **文档回写**
   - `docs/modules/<id>/roadmap.md` 打勾
   - 更新 `docs/modules/README.md` 模块列表

### ⛔ 完成前自检

- [ ] 已对照 `ARCHITECTURE.md` §2 十条禁止模式
- [ ] 新 feature 注册链路已完成（对照 `ARCHITECTURE.md` §4.2 Checklist）
- [ ] IPC 契约已同步 `contracts.ts` ↔ `commands.rs`（如适用）
- [ ] `pnpm run lint:fe` 通过
- [ ] `pnpm run test:critical` 通过
- [ ] 有 Rust 改动则 `cargo clippy -- -D warnings` 通过
- [ ] 已回写 `roadmap.md` / `docs/modules/README.md`
- [ ] commit 仅 stage 相关文件，未 `git add .`，未 push
- [ ] 遇到任何不确定，已停下问用户
