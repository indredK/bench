# Bench 产品迭代方式参考

> **仅供参考** — 描述当前实践在业界方法论中的位置、可选演进路径与未来迭代方向。  
> **非强制规范** — 执行仍以 [coding-standards.md](./coding-standards.md)（§11 文档）与 [roadmap/release-themes.md](./roadmap/release-themes.md) 为准。  
> **不在此维护版本号或发布状态** — 当前冲刺、checkbox、已交付项以 `release-themes.md` 与各模块 `roadmap.md` 为准。  
> 最后整理：2026-07-01

---

## 1. 当前做法叫什么？

Bench 的迭代方式不是某一种教科书里的单一方法论，而是几种成熟做法的 **轻量组合**：

| 层级 | Bench 在做的事 | 常见叫法 |
|------|----------------|----------|
| **产品节奏** | `release-themes.md` 定发布主题，模块 `roadmap.md` 填 checkbox | **主题驱动开发**（Theme-Based / Outcome-Based Roadmap） |
| **需求来源** | features + design + roadmap + bugs 选品 | **规格锚定**（Spec-Anchored）+ **活文档**（Living Documentation） |
| **工程结构** | `features/<id>` 对齐 `docs/modules/<id>` | **模块化 / 垂直切片**（Vertical Slice / Feature Module） |
| **质量门禁** | `coding-standards.md`、lint、test:critical、DestructiveConfirmDialog | **约定优于配置** + **Definition of Done（DoD）** |

**推荐总称（对内沟通用）：**

> **轻量文档驱动 + 主题式路线图 + 模块化单体**  
> （Spec-Anchored Theme Roadmap + Modular Monolith）

### 1.1 它不是什么

| 方式 | 说明 |
|------|------|
| 纯 Waterfall | 文档一次性写完再开发，且很少更新 — Bench 文档随迭代更新 |
| 纯 Scrum | 固定 Sprint、Story Point、Daily 等完整仪式 — 当前未 formalize |
| 纯 Shape Up | 6 周 cycle / pitch / betting table 全套 — 仅有「主题路线图」相似 |
| Doc-as-Code 自动生成 | OpenAPI/Swagger 从代码生成 — Bench 文档以人工维护为主 |

### 1.2 核心特征

- **文档**承载「意图、节奏、Why」
- **代码**承载「实现、How」
- 两者需 **人工对齐**（roadmap audit、PR 回写 checkbox）

---

## 2. 算不算最佳实践？

**结论：对 Bench 这种体量，方向正确、属于小团队维护型产品的推荐盘之一；不是行业唯一标准，也尚未满配「大厂级完整实践」。**

### 2.1 适合 Bench 的原因

1. **单人或小团队 + 11 个模块** — 文档比口头记忆可靠  
2. **Tauri 桌面工具、长期维护** — Session、系统设置等需要设计稿留存  
3. **模块边界清晰** — `docs/modules/<id>/` 与代码一一对应  
4. **主题式发布** — 按主题（如 Polish → Daily Loop → Session Platform）推进，优于各模块平行堆功能  

### 2.2 当前缺口

| 缺口 | 状态 | 说明 |
|------|------|------|
| Issue/PR 与 roadmap checkbox 无自动联动 | ⏳ 待解决 | 文档可能再次与代码脱节 |
| 用户反馈 → 优先级 闭环弱 | ⏳ 待解决 | 易按工程师直觉排期 |
| 用户向 Release Notes | ⚠️ 部分已有 | 根目录 `CHANGELOG.md` 为自动 commit 风格；缺从 release-themes 摘录的可读发布说明 |
| 无功能使用/崩溃等度量 | ⏳ 待解决 | 桌面工具指标难采 |
| `feature-candidates` 体量大 | ✅ 已并入 design.md | 在 release-themes 中按三档约束（近期可入 / 候选池 / 不做） |
| 跨模块测试覆盖不均 | ⚠️ 约 5/11 模块无 feature 级测试 | Quick Launch、System Settings、Terminology、Env Detector、Dev Toolbox 等；Quality 门禁见 release-themes |
| Session 引擎核心无测试 | ⚠️ Rust probe/session/exclusivity 缺行为测试 | Account Manager 前端有 api/error-classifier 测试，引擎层仍是短板 |
| 模块编码规范审查 | ✅ 已实践 | 多路 Agent 按 coding-standards 审查 11 模块；bugs 已归档至各模块 `bugs.md` |

---

## 3. 其他开发方式与产品迭代方式（参考列表）

### 3.1 按「谁驱动」分

| 方式 | 核心驱动 | 典型产出 | 优点 | 缺点 | 与 Bench |
|------|----------|----------|------|------|--------|
| **代码驱动** | 实现即真理 | 代码、类型、测试 | 快、不脱节 | 设计/Why 易丢失 | 刻意避免作为唯一驱动 |
| **文档/规格驱动** | PRD、设计 spec、roadmap | `modules/*/*.md` | 可维护、可交接 | 易过时 | **当前主轴** |
| **Issue/Ticket 驱动** | Linear/Jira/GitHub Issues | Issue → PR | 可追溯、可排期 | 文档易碎片化 | 可叠加，待系统化 |
| **用户反馈驱动** | 支持群、崩溃、调研 | 优先级队列 | 贴真实需求 | 噪音多 | 建议未来补一层 |
| **数据/指标驱动** | DAU、错误率、使用频次 | Dashboard → 实验 | 客观 | 桌面工具指标难采 | 长期可选 |
| **竞品/对标驱动** | OnlySwitch 等 | 各模块 roadmap 候选清单 | 灵感多 | 易功能膨胀 | 已用选品规则约束 |

### 3.2 按「时间盒与节奏」分

| 方式 | 节奏 | 适合场景 | 与 Bench 差异 |
|------|------|----------|----------------|
| **Waterfall 瀑布** | 需求→设计→开发→测试→发布 | 合同、强合规 | Bench 迭代快、文档持续改 |
| **Scrum** | 2 周 Sprint、Review、Retro | 5–15 人产品团队 | 无固定 Sprint 仪式 |
| **Kanban 看板** | 限制 WIP、持续流动 | 运维、支持、杂项 | 可用于 bugs/inbox |
| **Shape Up**（Basecamp） | 6 周 cycle + cooldown；pitch 赌桌 | 中小团队少而精 | 与 **release-themes** 最像 |
| **OKR 驱动** | 季度 O + KR | 多团队对齐 | 过重；可只取 O 当 release theme |
| **Continuous Delivery** | 小步频繁发布 | SaaS、内部工具 | 桌面 App 仍要发版，可小步常发 |
| **Train Release 发布火车** | 固定发车日多模块上车 | 大平台多团队 | Bench 规模通常不需要 |

### 3.3 按「工程与质量」分

| 方式 | 要点 | Bench 现状 |
|------|------|------------|
| **TDD 测试驱动** | 先写测试再实现 | 部分模块有测试，非全局 |
| **BDD 行为驱动** | Given-When-Then | 未 formalize |
| **Trunk-Based Development** | 短分支、常合并 main | 兼容当前文档迭代 |
| **Feature Flags** | 未完成功能可合入 | 桌面少用；可用 RuntimeFeatureGate |
| **RFC 流程** | 大改先 RFC 再实现 | Account Manager 级改动适用 |
| **ADR 架构决策记录** | 重要决策一篇 ADR | 可放在 `modules/<id>/` 设计稿旁 |

### 3.4 按「产品规划 Artifact」分

| Artifact | 作用 | Bench 对应 |
|----------|------|------------|
| **PRD** | 为什么做、给谁 | `modules/<id>/features.md`（产品视角功能说明） |
| **Tech Design** | 怎么做 | `modules/<id>/design.md`（技术设计） |
| **Release Themes** | 发布主题与验收 | `roadmap/release-themes.md` |
| **Module Roadmap** | 模块迭代 + 六维评估 | `modules/<id>/roadmap.md` |
| **Backlog** | 未排期条目 | `modules/<id>/roadmap.md` 候选清单 |
| **Bug list** | 质量债 | `modules/<id>/bugs.md`（建议；当前 10/11 模块有文件，Account Manager 暂无） |
| **DoD** | 什么叫做完 | `coding-standards.md` + release-themes 验收标准 |
| **Iteration Reference** | 方法论背景 | 本文件 |

**文档目录结构：**

```
docs/
├── README.md
├── coding-standards.md              # 编码与文档规范（强制）
├── product-iteration-reference.md   # 本文件（参考）
├── roadmap/
│   └── release-themes.md            # 发布主题（强制，含当前冲刺）
└── modules/
    ├── README.md
    ├── account-manager/
    │   ├── README.md                # 索引
    │   ├── features.md              # 产品视角功能说明
    │   ├── design.md                # 技术设计（含云同步未来规划）
    │   └── roadmap.md
    ├── system-settings/
    │   ├── README.md
    │   ├── features.md
    │   ├── design.md                # 含四维规范、defaults 键位映射、排查方法论
    │   ├── roadmap.md
    │   └── bugs.md
    ├── port-manager/
    │   ├── README.md
    │   ├── features.md
    │   ├── design.md
    │   ├── roadmap.md
    │   └── bugs.md
    └── <other-module-id>/
        ├── README.md
        ├── roadmap.md
        └── bugs.md                  # 建议，按需维护
```

**双轨文档结构：**

- **战略轨** — `roadmap/release-themes.md`（发布主题 + 选品规则 + 验收）  
- **战术轨** — `modules/<id>/roadmap.md`（六维评估 + checkbox）

---

## 4. 与常见方法论对照

| 方法论 | 一句话 | 与 Bench 相似度 |
|--------|--------|-----------------|
| **Shape Up** | 固定周期、赌项目、砍 scope | ★★★★ 主题路线图很像 |
| **Lean Startup** | Build-Measure-Learn | ★★ 缺 Measure 环 |
| **Jobs-to-be-Done** | 用户「雇佣」产品完成任务 | ★★★ 配合「开发者工作台」叙事 |
| **Dual-Track Agile** | Discovery + Delivery 并行 | ★★★★ 设计稿 + roadmap 即双轨 |
| **Platform + Feature Team** | 平台与业务分队 | ★ Dev Toolbox / Settings 略像平台 |
| **Inner Source** | 模块有 OWNERS + docs | ★★★★ 模块 README + roadmap 很像 |

---

## 5. 产品定位叙事（North Star 参考）

与 [release-themes.md](./roadmap/release-themes.md) 对齐（细节以该文件为准）：

| 优先级 | 用户故事 | 模块 |
|--------|----------|------|
| **主** | macOS **开发者工作台** — 启动、端口/清理/环境、小工具 | Quick Launch, Dev Toolbox, Port Manager, Dev Cleaner, Env Detector |
| **差异化** | **多站点 Session 管家** | Account Manager |
| **macOS 壳层** | 系统调优 + 菜单栏托盘 | System Settings, Tray |
| **保留不扩** | 垂直工具，不扩新品类 | Terminology, Hardware, App Manager |

**选品档位（参考）：**

| 档位 | 标准 | 示例 |
|------|------|------|
| 近期可入 | 开发者刚需 + 与现有 Settings 区块一致 | 键盘、Dock、隐藏桌面 |
| 候选池 | 中复杂度、与主定位一致 | 维护工具、迷你监控 |
| 远期 / 不做 | OnlySwitch 长尾、私有 API、无关品类 | 播放器、AI Agent、TOTP |

---

## 6. 未来迭代方向（仅供参考）

以下 **不承诺排期**；具体主题名称、checkbox、完成状态 **只维护在 release-themes.md**，不在本文件重复。

### 6.1 流程层（轻量升级）

| # | 方向 | 说明 | 预期收益 |
|---|------|------|----------|
| 1 | **Issue 驱动执行层** | 每个 roadmap checkbox ↔ GitHub Issue；PR 关闭 Issue 并回写文档 | 减少文档过时 |
| 2 | **轻量 Shape Up 仪式** | 定期短会：从 candidates **只赌 1–2 个主题**进下一发布周期 | 控制 scope |
| 3 | **用户向 Release Notes** | 在自动 `CHANGELOG.md` 之外，从 release-themes 摘 3–5 条可读改进 | 对外叙事 |
| 4 | **Discovery 笔记** | 可选 `modules/<id>/discovery.md`：场景与痛点，非实现细节 | 与 tech design 分离 |
| 5 | **Retro 三问** | 文档是否过时？主题是否太散？哪模块应停更？ | 持续校准 |
| 6 | **Agent 集群审查** | 发版前多路 Agent 按 coding-standards 审查 i18n/重入/平台边界/分层；可逐步固化为 CI | 自动化质量门禁 |

### 6.2 发布主题含义（名称参考）

| 主题名 | 典型重心 |
|--------|----------|
| **Polish 基建** | 托盘、危险确认、汇率、Account Manager 架构、Dev Toolbox IA |
| **Polish & Trust** | 全量 i18n、重入保护、Session 状态可读性、文档与代码对齐 |
| **Developer Daily Loop** | 异步扫描、Env 导出、启动器频率、Settings 搜索、candidates 精选、测试门禁 |
| **Session Platform** | IndexedDB/TTL、设置导入导出、代理、跨平台能力边界 UI |

### 6.3 模块质量快照（参考，非排期）

综合评分来自各模块 `roadmap.md` 六维评估；**短板与下一步以模块 roadmap 为准**。

| 模块 | 综合评分 | 主要短板 | 常见关联主题 |
|------|---------|---------|--------------|
| app-manager | ⭐⭐⭐⭐⚬ | 更新通知与来源过滤 | Developer Daily Loop |
| port-manager | ⭐⭐⭐⭐⚬ | 大列表 / 进程树性能 | Developer Daily Loop |
| hardware | ⭐⭐⭐⭐⚬ | 测试覆盖、导出能力 | Session Platform / 远期 |
| dev-cleaner | ⭐⭐⭐⭐⚬ | 扫描阻塞 UI | Developer Daily Loop |
| token-calculator | ⭐⭐⭐⚬⚬ | 定价缓存、用量历史 | Developer Daily Loop |
| quick-launch | ⭐⭐⭐⚬⚬ | 无测试、scenes.ts 过大 | Developer Daily Loop |
| terminology | ⭐⭐⭐⚬⚬ | 无测试、大词表虚拟化 | Developer Daily Loop |
| system-settings | ⭐⭐⭐⚬⚬ | 无测试、Select 组件债 | Polish & Trust |
| account-manager | ⭐⭐⭐⚬⚬ | Session UX、v1→v2 迁移、引擎测试 | Polish & Trust + Session Platform |
| env-detector | ⭐⭐⭐⚬⚬ | 功能深度（对比/导出） | Developer Daily Loop |
| dev-toolbox | ⭐⭐⭐⚬⚬ | 单文件膨胀、工具深度 | Developer Daily Loop |

### 6.4 工程与质量方向

| 方向 | 说明 |
|------|------|
| 测试门禁 | 零测试模块补 ≥1 行为测试后再扩功能（见 release-themes Quality 项） |
| ADR/RFC | Account Manager、跨平台 Session 等重大改动先 short RFC |
| 度量（可选） | 崩溃上报、Tab 使用（隐私允许前提下）验证主题成效 |
| Agent 审查 CI 化 | 将已实践的多路 Agent 审查固化为流水线步骤 |

### 6.5 明确不建议的方向（参考）

- 把 Bench 做成 OnlySwitch 全集（媒体、AI Agent、TOTP 等）  
- 平行维护多套优先级源（candidates 与 roadmap 各说各话）  
- 无主题的大杂烩发布（11 模块同时加功能）  
- 在 Session/Probe 核心无测试的情况下追加快节奏功能迭代  

---

## 7. 文档与规范关系

```
coding-standards.md §11        → 强制：文档放哪、模块目录怎么建
release-themes.md              → 强制：当前发布主题、选品、验收（含版本与状态）
modules/<id>/roadmap.md        → 强制：模块六维评估 + checkbox
modules/<id>/bugs.md           → 建议：模块已知问题
product-iteration-reference.md → 参考：方法论与未来方向菜单（本文件）
```

新增或调整迭代方式时：**先更新 release-themes 或模块 roadmap，再视需要修订本文件**；勿让本文件替代可执行的 checkbox，亦勿在此维护版本号。

---

## 8. 相关链接

| 文档 | 用途 |
|------|------|
| [README.md](./README.md) | 文档总索引 |
| [coding-standards.md](./coding-standards.md) | 编码与文档目录规范 |
| [development-workflow.md](./development-workflow.md) | **日常开发流程** |
| [roadmap/release-themes.md](./roadmap/release-themes.md) | **当前**发布主题与验收 |
| [modules/README.md](./modules/README.md) | 模块文档一览（features / design / roadmap / bugs） |
