# Bench AI Workflows

`AGENTS.md` 根据用户指令路由到本文件。执行任一 workflow 前，先完成 `AGENTS.md` 的必读清单；不确定、规则冲突或需要危险操作时停止并询问用户。

## /review - 代码审查

触发：review、审查、审计、检查代码或 PR。

1. 明确范围：commit/PR 用目标 diff，文件审查读指定文件，全量审计按 `AGENTS.md` Phase 1-7。
2. 先读 `audit-report.md` 的当前风险和不计违规决策，避免重复报告。
3. 按严重性检查：
   - 前端：i18n、组件抽象、Zustand/effect 副作用、加载/空/错误态、大列表性能和响应式布局。
   - 后端：并发原子性、锁与资源上限、边缘容错、平台差异、路径/命令/更新安全。
   - 边界：IPC 契约、窄写入 DTO、错误结构、取消/partial/unsupported 语义和测试。
4. 先报告问题，不在 review 中擅自修改。无问题时明确剩余测试缺口。
5. 将新发现追加到 `audit-report.md`；修复后更新状态，不复制已沉淀到规范的历史。

输出格式：

```markdown
- [§X] `文件路径:行号` - 问题 - 修改建议 - **强制/建议** - 状态：已报告
```

## /fix - 修复问题

触发：fix、修复、改 bug。

1. 复现或用代码/测试确认原因，检查影响范围和现有用户改动。
2. 按 `ARCHITECTURE.md` §2 与 `coding-standards.md` 做最小完整修复；复杂重构先给方案并等待确认。
3. 为回归补与风险成比例的测试，不修改测试来掩盖实现缺陷。
4. 依次验证：

```bash
pnpm run lint:fe
pnpm run test:critical
cd src-tauri && cargo clippy -- -D warnings  # 有 Rust 改动时
```

5. 同步模块 roadmap、已知风险和必要的设计文档。已完成项从 backlog 移除。
6. 只有用户明确要求时才提交；只 stage 相关文件，不推送。

## /doc - 文档演进

触发：doc、文档、更新文档、对齐。

1. 读取 `docs/README.md` 与目标模块 `README.md`/`roadmap.md`。
2. 对照代码确认：模块双向对齐、roadmap 只含未完成项、链接有效、描述没有夸大平台能力。
3. 内容归位：
   - README 只做入口和索引。
   - roadmap 只放当前约束、未完成项和验收条件。
   - design 放长期架构、安全边界和修改入口。
   - `DECISIONS.md` 记录方向性取舍；Git 保留已完成历史。
4. 删除无独有信息的历史文档，不留跳转空壳，并更新全部引用。
5. 运行 `pnpm run check:docs`、相对链接检查、Prettier 和 `git diff --check`。

## /feature - 功能研发

触发：feature、新功能、开发、实现。

1. 从 `ROADMAP.md`、`DECISIONS.md` 和模块 roadmap 确认范围；跨平台、Account Manager Session 或大重构先补设计/RFC。
2. 默认分层：

```text
features/<id>/
├── feature.tsx       # 注册与 lazy 入口
├── page.tsx          # 视图组合
├── store.ts          # 共享状态与 setter（按需）
├── hooks/            # controller
└── services/         # use-case/repository（按需）
```

3. 新 feature 同步注册 `registry.tsx`、中英文 locale 和 `docs/modules/<id>/{README,roadmap}.md`。
4. 新 IPC 同步 Rust 实现/注册、TS contract/typed command/DTO，并补契约或行为测试。
5. 完成后执行 `/fix` 的验证链，移除已完成 roadmap 项；有方向性取舍时更新 `DECISIONS.md`。

所有 workflow 完成前确认：没有违反禁止模式，没有覆盖无关用户改动，没有断链，没有未经授权提交或推送。
