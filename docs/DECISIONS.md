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

## D-007 · Account Manager 采用单写者状态与后端授权票据

- **日期**：2026-07-13
- **状态**：采纳
- **背景**：账号模块同时维护两份 Session 状态，捕获/恢复/TTL/导出读取路径不一致；外部登录代理又信任 renderer 传回 target/return，无法抵抗参数替换、重放和错误 origin 自动填充。文档曾把 macOS 标为已验收，但核心恢复链路实际未完成。
- **决策**：Session 只保留一个 canonical `SessionRecord`，所有 mutation 由带 revision 和原子持久化的 coordinator 串行提交；外部登录由后端签发并原子消费短期一次性 ticket，callback、账号候选和 credential origin 固化在 ticket 中；平台状态按能力诚实建模，在目标平台行为测试前保持 ⚠️。
- **理由**：单一真理源消除并发覆盖和生命周期分叉；后端票据把 renderer 限制为展示/选择层；能力状态避免把编译通过误报为功能对等。
- **影响**：必须先迁移 Session 和 Auth Proxy IPC，再修 Probe/Refresh/UX；旧双写和直接传 URL 的命令不得长期兼容保留。
- **相关**：[Account Manager 审计](./modules/account-manager/audit-and-upgrade-2026-07-13.md) · [技术设计](./modules/account-manager/design.md) · [ROADMAP.md](./ROADMAP.md)

---

## D-006 · 文档只保留当前真理源与未完成事项

- **日期**：2026-07-13
- **状态**：采纳
- **背景**：模块文档混入星级评分、已完成 checklist、历史实现过程和重复功能说明，内容快速过期且增加 AI 读取成本。
- **决策**：roadmap 只保留当前约束与未完成项；长期架构/安全边界进入 design 或规范；已完成历史由 Git 保留；无独有信息的专题文档直接删除，不留跳转空壳。
- **理由**：减少多个真理源和过期描述，让能力较弱的 AI 也能直接找到修改入口、强制约束和验收条件。
- **影响**：新增文档前必须证明存在独有、长期有效的信息；`README.md` 只做索引，不复制模块功能清单。
- **相关**：[文档索引](./README.md) · [模块文档](./modules/README.md) · [编码规范 §11](./coding-standards.md#11-文档)

---

## D-005 · 应用清单单一真理源 + 跨平台能力诚实建模

- **日期**：2026-07-13
- **状态**：采纳
- **背景**：Quick Launch 和 App Manager 共享同一应用数据，却分别维护扫描 orchestration；Windows 注册表结果没有可靠启动目标，统一更新中心在非 macOS 返回空数组，文档仍标记为完整支持。原地更新 IPC 又信任 renderer 提交的完整更新 DTO。
- **决策**：
  1. App Manager 后端 inventory 是应用清单唯一真理源，输出带 `revision` 的不可变 snapshot；Quick Launch 只消费 snapshot，不再直接改 App Manager store 或复制扫描流程。
  2. 启动/定位/升级/卸载 IPC 只接受稳定 ID，平台路径、AUMID、package ID、下载 URL 和校验材料由后端 canonical state 解析。
  3. 平台能力使用 `supported / partial / unsupported / failed` 等显式状态；未支持或失败不得折叠为空数组并显示成功。
  4. 模糊来源匹配只用于建议，破坏性动作必须有 exact evidence。
- **理由**：共享任务唯一所有者可避免并发覆盖；窄 IPC 可建立安全边界；诚实能力状态可防止 Windows/macOS 文档与实际行为漂移。
- **影响**：Quick Launch 依赖 App Manager Inventory；App Manager 从维护态转为跨平台重构；两个模块完成审计文档的 Definition of Done 前，平台矩阵保持 ⚠️。
- **相关**：[App Manager 审计](./modules/app-manager/audit-and-upgrade-2026-07-13.md) · [Quick Launch 审计](./modules/quick-launch/audit-and-upgrade-2026-07-13.md) · [ROADMAP.md](./ROADMAP.md)

---

## D-004 · 确立 AGENTS.md 为唯一逻辑入口 + 防呆策略=停下问人

- **日期**：2026-07-06
- **状态**：采纳；重复自检清单已由 D-006 合并
- **背景**：项目被多种 AI 工具操作（Cursor / Trae / Mimocode / CodeBuddy / Claude 等），物理入口天然不唯一（每个工具先读自己的文件）。此前 `AGENTS.md` 自称"唯一起点"却要求"先读 `.cursorrules`"，而 `.cursorrules` 又写"优先级 `.cursorrules > AGENTS.md`"，两者对"入口"和"优先级"表述交叉，笨 AI 易绕晕或读完 `.cursorrules` 就停。同时工作流关键步骤（验证链、文档回写、独立提交）常被省略，文档未覆盖时 AI 会自作主张。
- **决策**：
  1. `AGENTS.md` 为唯一逻辑入口；所有工具物理入口（`.cursorrules` / `.trae/rules/` / `.github/copilot-instructions.md` / `.claude/CLAUDE.md` / `.codebuddy/rules/` 等）只做一件事——导流到 `AGENTS.md`。Mimocode 直接读 `AGENTS.md`，无需独立指针。
  2. 澄清"入口"与"优先级"是两件事：入口顺序 = all → `AGENTS.md`，裁决优先级 = `.cursorrules > AGENTS.md > docs/*.md`。
  3. 防呆策略：遇到冲突 / 文档未覆盖 / 要违反禁止模式时 → **强制停下问用户**（对应"信不过的 AI"）。
  4. 新增 `.cursorrules §0 STOP 铁律`、workflow 完成条件和 `docs/START-HERE.md` 一页纸导航。原先分散在四个 workflow 的重复自检后由 D-006 合并。
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
- **相关**：[ROADMAP.md](./ROADMAP.md) · [roadmap/release-themes.md](./roadmap/release-themes.md)
