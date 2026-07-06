# Bench 决策日志 (Decision Log)

> **跨会话记忆** — 记录"为什么这么做"的规划与架构决策，供 AI 和人在隔天/隔周对话时快速恢复上下文。
>
> - 与 `ROADMAP.md`（做什么）互补：本文件回答 **为什么、为什么不、当时怎么权衡**。
> - 与 `audit-report.md`（不重复标记的违规决策）互补：那是"代码模式判定"，这里是"产品与架构方向"。
> - `/doc` 与 `/feature` 工作流在做出方向性选择时应追加条目；`/review` 遇到"疑似违规但其实是有意决策"时先查此处。
>
> **格式**：每条一个 `## D-NNN` 小节，最新在最上。字段：日期 · 状态 · 背景 · 决策 · 理由 · 影响 · 相关。
> **状态**：`采纳` / `试行` / `已推翻(被 D-XXX 取代)` / `搁置`。

---

## D-004 · 确立 AGENTS.md 为唯一逻辑入口 + 防呆策略=停下问人

- **日期**：2026-07-06
- **状态**：采纳
- **背景**：项目被多种 AI 工具操作（Cursor / Trae / Mimocode / CodeBuddy / Claude 等），物理入口天然不唯一（每个工具先读自己的文件）。此前 `AGENTS.md` 自称"唯一起点"却要求"先读 `.cursorrules`"，而 `.cursorrules` 又写"优先级 `.cursorrules > AGENTS.md`"，两者对"入口"和"优先级"表述交叉，笨 AI 易绕晕或读完 `.cursorrules` 就停。同时工作流关键步骤（验证链、文档回写、独立提交）常被省略，文档未覆盖时 AI 会自作主张。
- **决策**：
  1. `AGENTS.md` 为唯一逻辑入口；所有工具物理入口（`.cursorrules` / `.trae/rules/` / `.github/copilot-instructions.md` / `.claude/CLAUDE.md` / `.codebuddy/rules/` 等）只做一件事——导流到 `AGENTS.md`。Mimocode 直接读 `AGENTS.md`，无需独立指针。
  2. 澄清"入口"与"优先级"是两件事：入口顺序 = all → `AGENTS.md`，裁决优先级 = `.cursorrules > AGENTS.md > docs/*.md`。
  3. 防呆策略：遇到冲突 / 文档未覆盖 / 要违反禁止模式时 → **强制停下问用户**（对应"信不过的 AI"）。
  4. 新增 `.cursorrules §0 STOP 铁律`、四个 workflow 各加 `⛔ 完成前自检` Checklist、新建 `docs/START-HERE.md` 一页纸导航。
- **理由**：物理入口无法统一（每个工具先读自己的文件），但逻辑入口可以；让每个物理入口只做跳转指针即可。防呆选"停下问人"而非"AI 自行推断"，因为项目文档不可能覆盖所有边界，猜错代价高于多问一句。
- **影响**：所有 AI 工具入口文件统一导流；新增 workflow 自检清单防止跳步；笨 AI 场景（如"用户让加功能但没说放哪个模块"）会被导向"停下问人"而非自己乱建。
- **相关**：[AGENTS.md](../AGENTS.md) · [.cursorrules](../.cursorrules) · [AI-WORKFLOWS.md](./AI-WORKFLOWS.md) · [START-HERE.md](./START-HERE.md)

---

## D-003 · 建立跨会话决策日志

- **日期**：2026-07-06
- **状态**：采纳
- **背景**：AI 闭环（审查/修复/文档/开发）已能单轮跑通，但"为什么这样规划开发节奏"的意图只散落在 git message 与对话里，跨会话易丢失，导致下次对话 AI 重新猜测方向。
- **决策**：新增本文件 `docs/DECISIONS.md`，作为方向性决策的唯一沉淀点，并在 `AGENTS.md` 前置阅读清单与 `AI-WORKFLOWS.md` 的 `/doc`·`/feature` 中引用。
- **理由**：让"文档→对话规划→开发"这一环有可延续的记忆；避免把决策塞进代码注释或 roadmap（那里只放 checkbox）。
- **影响**：AI 每次做方向性取舍需回写一条；人可通过读此文件快速对齐历史意图。
- **相关**：[ROADMAP.md](./ROADMAP.md) · [AGENTS.md](../AGENTS.md)

---

## D-002 · 文档↔代码一致性改为机器门禁

- **日期**：2026-07-06
- **状态**：采纳
- **背景**：`docs/modules/<id>` 与 `src/features/<id>` 的对齐、模块必需文件的存在，此前仅靠 AI 自觉与 code review，长期运行会漂移。
- **决策**：新增 `scripts/quality/check-docs-consistency.mjs`，暴露为 `pnpm run check:docs`，并串入 `lint:fe`（即 `.cursorrules §4` 强制验证链）。不一致即提交/CI 失败。
- **理由**：把"文档与代码同步"从口头约定升级为可执行门禁，与既有 `check-i18n-guards.mjs` 同一范式，边际成本低。
- **影响**：新增/删除 feature 时必须同步文档目录，否则 `lint:fe` 红。基础设施型 docs 目录需加入脚本的 `MODULE_IGNORE` 白名单。
- **相关**：[coding-standards.md §11.3](./coding-standards.md) · `scripts/quality/check-docs-consistency.mjs`

---

## D-001 · Active Theme 从"AI 基建"切换到"Developer Daily Loop"

- **日期**：2026-07-06
- **状态**：采纳
- **背景**：`ROADMAP.md` 的活跃主题长期停留在"AI 自动化研发系统基建"，其目的（搭好 AI 闭环）已达成，但验收框未勾、主题未存档，导致路线图无法反映真实产品进度。
- **决策**：将 AI 基建主题标记完成并存档，新 Active Theme 定为 **Developer Daily Loop**，聚焦主线模块（Quick Launch / Dev Toolbox / Account Manager）的可见短板：分层重构、列表虚拟化、主线测试覆盖。
- **理由**：基建是手段不是目的；主题应回到"用户每天用的路径"。所选验收项均有各模块 `roadmap.md` backlog 支撑，非凭空造。
- **影响**：后续 `/feature` 默认只做 Active Theme 下的项；其余模块进入维护态。
- **相关**：[ROADMAP.md §3](./ROADMAP.md) · [roadmap/release-themes.md](./roadmap/release-themes.md)
