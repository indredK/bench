# 计划：AI 文档"防呆"加固 + 统一唯一入口

## Context（为什么做这件事）

用户的顾虑：项目会被多种 AI 工具操作（Cursor / Trae / Mimocode / CodeBuddy / Claude 等），这些工具"残次不齐"，不像强模型那样能自己脑补。现有文档体系对聪明 AI 够用，但对**笨 AI 或不熟项目的新人**存在三个会导致犯错的坑：

1. **入口不唯一 / 自相矛盾**：`AGENTS.md:3` 自称"唯一起点"，但 `AGENTS.md:5` 又要求"前置先读 `.cursorrules`"；而 `.cursorrules:5` 写"优先级 `.cursorrules > AGENTS.md`"。三处说法让笨 AI 绕晕，可能读完 `.cursorrules` 就停、跳过工作流路由。物理上还有 `.trae/`、`.mimocode/`（当前空目录）、`.codebuddy/`、`.claude/` 各自的入口，笨 AI 可能只读自己那个，根本到不了 `AGENTS.md`。
2. **工作流关键步骤容易被省略**：`/review /fix /doc /feature` 里的"强制验证链、文档回写、独立提交、危险操作确认"等步骤，笨 AI 常跳过。
3. **遇到文档没覆盖的情况会自作主张**：用户明确要求——这种时候 AI 必须**停下问人**，不许猜。

**用户已拍板的两个决策**：
- **入口**：`AGENTS.md` 为唯一逻辑入口；所有工具文件都强制"跳转到 AGENTS.md"。
- **防呆强度**：冲突 / 文档未覆盖 / 要违反禁止模式时 → **强制停下问用户**（对应"信不过的 AI"）。

**关于"入口是否唯一"的正确答案**（要写进文档）：物理入口天然不唯一（每个工具先读自己的文件），所以做法是**让每个物理入口都只做一件事——把 AI 导流到唯一逻辑入口 `AGENTS.md`**。

---

## 方案总览

一句话：**建立"一个逻辑入口 + N 个跳转指针 + 一份防呆铁律 + 每个工作流的红线清单"。**

复用项目已有的三种格式范式，不发明新样式：
- 禁止模式编号列表（`ARCHITECTURE.md §2`）
- Checklist 复选框（`ARCHITECTURE.md §4.2`）
- 强制/建议黑体标记（`coding-standards.md`）

---

## 改动清单

### 1. 消除入口矛盾：重写 AGENTS.md 顶部 + .cursorrules §1
**文件**：`AGENTS.md`、`.cursorrules`

- `AGENTS.md` 顶部改为无歧义的**三步铁律**（用 Checklist 格式）：
  1. 你现在读的这个文件 `AGENTS.md` 就是唯一起点，读完它再动手。
  2. 动手前必读清单（固定 5 个文件，给全路径）：`.cursorrules` → `docs/ARCHITECTURE.md §2` → `docs/coding-standards.md` → `docs/AI-WORKFLOWS.md` → `docs/DECISIONS.md`。
  3. 按关键词路由表进 workflow；**判断不了就停下问人**。
- 澄清"优先级"与"入口"是两件事，明确写进两个文件：
  - **入口顺序**：所有工具 → `AGENTS.md`（从哪开始读）。
  - **裁决优先级**：内容冲突时 `.cursorrules > AGENTS.md > docs/*.md`（谁说了算）。
  - 两者不矛盾：`AGENTS.md` 是"门"，`.cursorrules` 是"最高法律"。
- 删除 `AGENTS.md:5` 里"前置步骤先读 .cursorrules"这种会让笨 AI 反向跳出去的措辞，改成"必读清单是 AGENTS.md 内部的一步"。

### 2. 新增一节"防呆铁律"（全局，最高频引用）
**文件**：`.cursorrules` 新增 `§0 STOP 铁律`（放在最前，笨 AI 第一眼看到）

用禁止模式格式，写死"必须停下问人"的触发条件：
- 文档 / workflow 没覆盖你要做的事 → **停，问用户**，不许猜。
- 你要做的事会违反 `ARCHITECTURE.md §2` 任一条 → **停，问用户**。
- 验证链（`lint:fe` / `test:critical` / `clippy`）任何一条失败 → **停**，不许带病提交、不许改测试让它过。
- 涉及危险操作（关机 / 删数据 / 撤销授权 / `git push` / `git add .`）→ **停，等用户明确同意**。
- 看不懂某个既有模式为什么这么写 → 先查 `docs/DECISIONS.md` 和 `audit-report.md`，还不懂 → **问用户**，不许重写。

### 3. 给每个工具入口加"跳转指针"（防呆核心：无论从哪进都导流到 AGENTS.md）

**⚠️ gitignore 现实**（已核实）：`.codebuddy/` 和 `.claude/` 被 `.gitignore` 忽略，放里面的指针**不进版本库、不会分享给协作者**，只对本机生效。因此**可提交、能覆盖所有人**的工具入口指针只有下面两个 + 已追踪的 `.cursorrules`/`AGENTS.md`：

**可提交的指针文件（新建）：**
- `.trae/rules/project_rules.md` — Trae 的官方规则目录 `.trae/rules/` 已存在（空），放这里即被 Trae 自动读取。✅ 可提交
- `.github/copilot-instructions.md` — GitHub Copilot 官方约定入口，当前不存在。✅ 可提交

**本机 only 的指针（可选做，说明其局限）：**
- `.codebuddy/`、`.mimocode/`、`.claude/` — gitignored / 各自 .gitignore，指针只在本机生效；可放但要告诉用户"换台机器 / 别的协作者不会有"。

**已是入口、只需加一行的：**
- `.cursorrules` 顶部加"本文只是 Cursor 入口，完整流程见 AGENTS.md"。

每个指针文件内容统一为：
```
# 本项目 AI 操作入口
无论你是哪个 AI 工具：请立即打开并遵循项目根目录的 `AGENTS.md`，它是唯一操作入口。
不要只读本文件就开始改代码。冲突时以 `.cursorrules` 为最高约束。
```

### 4. 给四个工作流各加一段"红线 Checklist"（防跳步）
**文件**：`docs/AI-WORKFLOWS.md`

在 `/review /fix /doc /feature` 每个工作流末尾追加一个 `⛔ 完成前自检（缺一条不算完成）` 复选框清单。例如 `/fix`：
```
### ⛔ 完成前自检
- [ ] 已对照 ARCHITECTURE.md §2 十条禁止模式
- [ ] pnpm run lint:fe 通过
- [ ] pnpm run test:critical 通过
- [ ] 有 Rust 改动则 cargo clippy 通过
- [ ] 已回写 roadmap.md / bugs.md / audit-report.md
- [ ] commit 仅 stage 相关文件，未 git add .，未 push
- [ ] 遇到任何不确定，已停下问用户
```
`/feature` 复用 `ARCHITECTURE.md §4.2` 的注册链 Checklist，不重造。

### 5. 新建一张"给新人/笨 AI 的一页纸"总导航
**文件**：`docs/START-HERE.md`（README 性质，非入口——入口仍是 AGENTS.md）

一页纸讲清楚："你是 AI？→ 去 AGENTS.md。你是人类新人？→ 按这张图看文档。冲突时谁说了算。" 用一个 ASCII 流程图把"工具入口 → AGENTS.md → 必读清单 → workflow → 验证链 → 回写"串起来。在 `docs/README.md`、根 `README.md` 挂链接。

### 6. 同步交叉引用
- `docs/README.md` 索引补 `START-HERE.md`。
- `docs/DECISIONS.md` 追加一条 `D-004`：记录"确立 AGENTS.md 为唯一入口 + 防呆策略=停下问人"这个决策及理由。

---

## 关键文件一览（改动落点）

| 文件 | 动作 |
|------|------|
| `AGENTS.md` | 重写顶部：唯一入口三步铁律 + 澄清入口/优先级 |
| `.cursorrules` | 新增 §0 STOP 铁律；§1 澄清入口 vs 优先级；顶部加"入口见 AGENTS.md" |
| `docs/AI-WORKFLOWS.md` | 四个 workflow 各加 ⛔ 完成前自检 Checklist |
| `docs/START-HERE.md` | 新建：一页纸导航 + ASCII 流程图 |
| `docs/DECISIONS.md` | 追加 D-004 |
| `docs/README.md` | 挂 START-HERE 链接 |
| `.trae/rules/…`、`.mimocode/…`、`.github/copilot-instructions.md`、`.codebuddy/…` | 新建跳转指针（内容一致，导流到 AGENTS.md） |

---

## 验证方式

1. **一致性门禁**：`pnpm run check:docs` 仍通过（新增文档不破坏 feature↔module 对齐）。
2. **断链检查**：脚本扫描所有新增 / 改动 `.md` 的相对链接均有效（沿用上一轮的 grep 校验法）。
3. **入口自洽人工核对**：从每个工具指针文件出发，确认 3 跳内必然到达 `AGENTS.md` 的路由表；`AGENTS.md` 与 `.cursorrules` 对"入口"和"优先级"的表述不再互相矛盾（逐句对照）。
4. **防呆有效性走查**：拿一个假想笨 AI 场景（"用户让加个功能但没说放哪个模块"）走一遍，确认文档会把它导向"停下问人"而不是自己乱建。
5. 不改代码逻辑，无需跑 `test:critical` / `clippy`；但会跑一次 `lint:fe` 确认文档门禁链路没被我改坏。

## 提交策略（遵循 .cursorrules）
按逻辑拆分独立 commit（`docs:` 为主），不 `git add .`、不 push，等用户 review。建议拆：①入口去矛盾 ②STOP铁律 ③工具跳转指针 ④workflow自检清单 ⑤START-HERE+DECISIONS。
