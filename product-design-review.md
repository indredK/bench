# Bench 功能设计审查报告

> **审查日期**：2026-07-13
> **审查人**：产品通（Product Management Expert）
> **审查范围**：12 个功能模块（含 1 个全局能力 Updater）+ 架构/文档一致性 + 顶层定位
> **方法**：文档研读（ROADMAP / DECISIONS / 各模块 roadmap）+ 代码注册关系核验（registry.tsx / dev-toolbox 组合方式）+ 针对性 grep 取证

---

## 一、总体结论（Executive Summary）

**一句话**：工程实现质量高、模块分层清晰、文档成熟度远超同体量项目；但**顶层产品定位自相矛盾**，且存在若干"高杠杆缺口"和"范围/测试债"需要收口。

| 维度           | 评级            | 说明                                                                                                 |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| 架构分层       | 🟢 优秀         | feature/page/controller/use-cases/repository/store 执行到位，IPC 契约双边同步机制成熟                |
| 安全设计       | 🟢 优秀（局部） | clean-space 的"显式可清理契约 + 前后端双围栏 + 审计日志"是教科书级；但其他破坏性操作未复用该模式     |
| 文档体系       | 🟢 优秀         | roadmap 自评星级 + 决策日志（DECISIONS）+ 审计报告，远超同体量项目                                   |
| 产品定位一致性 | 🔴 有矛盾       | AGENTS.md 称"AI 总入口"，README 称"DevTools"，战略早已切到"Developer Daily Loop"                     |
| 测试覆盖       | 🟡 不均         | Port Manager/Clean Space/Updater/App Manager 好；Quick Launch/Dev Toolbox/Env/Terminology 薄弱或为零 |
| 性能（大列表） | 🟡 有债         | 虚拟化组件已建好但仅 2 模块使用，其余大列表未虚拟化                                                  |
| 功能补全度     | 🟡 有缺口       | 缺全局命令面板、应用级偏好设置、跨模块数据导出                                                       |

**核心建议排序**：

1. 先在文档层统一"我们到底是什么"（建议定为**面向开发者的 macOS 效率中枢**），消除 AI 总入口 vs 开发者工具的分裂。
2. 补 **⌘K 全局命令面板** 与 **应用级偏好设置** 两个高杠杆缺口。
3. 收口 **account-manager** 范围、补齐 **Quick Launch / 破坏性模块** 的测试、把 clean-space 安全模式抽成共享框架。

---

## 二、功能合理性评估

### 2.1 模块全景与使命契合度

使命（来自 README + DECISIONS D-001）：以 macOS 系统管理为核心、跨平台为辅的开发者效率工具，当前活跃主题 "Developer Daily Loop"（开发者日常闭环）。

| 模块             | 定位                                                   |    与使命契合度    | 核心功能状态                    | 备注                               |
| ---------------- | ------------------------------------------------------ | :----------------: | ------------------------------- | ---------------------------------- |
| Quick Launch     | 应用启动器                                             |      ✅ 核心       | ⚠️ 核心完成，`scenes.ts` 待拆分 | 每天用的主路径                     |
| App Manager      | 已装应用管理/卸载/升级                                 |      ✅ 核心       | ✅ 全链路                       | 分层清晰，维护态                   |
| System Settings  | macOS defaults 控制中心                                |      ✅ 核心       | ✅ 覆盖广                       | 代码气味最重，待重构               |
| Dev Toolbox      | 开发者工具聚合（端口/环境/Token/小工具/诊断/系统信息） |      ✅ 核心       | ✅ 7 Tab                        | page.tsx 膨胀                      |
| Clean Space      | 存储空间清理                                           |      ✅ 核心       | ✅ 四大交互就位                 | 安全设计标杆                       |
| Hardware         | 硬件参数对比                                           |      ⚠️ 边缘       | ✅ 纯数据+对比                  | 偏"知识库"，与系统管理弱相关       |
| Token Calculator | AI Token 计费                                          |    ⚠️ 边缘但轻     | ✅                              | 契合"用 AI 的开发者"，成本低       |
| Terminology      | 开发术语库                                             |  ⚠️ 边缘/疑似填充  | ✅                              | 知识库类，弱相关，占侧边栏         |
| Account Manager  | 多站点账号会话 + 反指纹                                | ⚠️⚠️ 高复杂/弱契合 | ✅ 但 backlog 庞大              | 接近"多账号防关联浏览器"，安全面大 |
| Updater          | 应用内更新                                             |    ✅ 基础设施     | ✅                              | 全局能力，非侧边栏                 |

**契合度判断**：核心 5 个模块（Quick Launch / App Manager / System Settings / Dev Toolbox / Clean Space）高度自洽，构成清晰的"开发者日常闭环"。但 **Hardware、Terminology、Account Manager** 三者与主线使命的耦合较弱，属于"附加价值"而非"闭环必需"，需要在定位话术中说清它们为何存在。

### 2.2 逻辑自洽与矛盾点（具体问题）

**🔴 矛盾 1：顶层定位文档互相冲突（最该先修）**

- `AGENTS.md` 第 1 行：`# Bench — AI 总入口`
- `README.md` 第 1 行：`# Bench - DevTools / 开发者工具`
- `DECISIONS D-001` 已决策把 Active Theme 从"AI 基建"切到"Developer Daily Loop"，但 AGENTS.md 仍保留"AI 总入口"品牌。
- **后果**：任何新接手的开发者/AI 工具对"这产品是干嘛的"会得出两种理解，导致功能取舍标准不一致、范围蔓延。
- **建议**：统一话术为"面向开发者的 macOS 效率中枢（Bench）"，AI 相关能力（Token Calculator）作为开发者工作流的子集呈现，而非产品主体。

**🟠 矛盾 2：dev-cleaner 孤儿代码（已取证）**

- 证据：`src/features/dev-cleaner/feature.tsx` 导出 `devCleanerFeature`，但 `registry.tsx` 的 `appFeatures` **未引入它**（已重构为 clean-space 子流程）；`dev-cleaner/page.tsx` 的默认导出 `DevCleanerPage` 除自身 feature 外**无任何外部引用**。
- 实际复用关系：仅 `clean-space/components/tools/DevProjectCleanerTool.tsx` 复用了 `DevCleanerPageContent` + `useDevCleanerController`（引擎层），说明 page/feature 已死。
- **建议**：删除 `dev-cleaner/feature.tsx` 与 `dev-cleaner/page.tsx`（保留 components/services/hooks 供 clean-space 复用），避免误导后续维护者。

**🟢 矛盾 3：port/env/token 的双重入口（实为正确复用，非矛盾）**

- 这三个模块既注册为独立路由（`/port-manager` 等），又作为 Dev Toolbox 的 tab 直接复用其 page 组件（`<PortManager/>` 等）。这是"一处实现、两处入口"的正确复用模式，不是重复实现。
- 代价：独立路由仍可被深链访问，但侧边栏已通过 `TOOLBOX_FEATURE_IDS` 排除它们。
- **建议**：保持现状；但在 IA 上明确"Dev Toolbox 是这些能力的唯一 UI 入口"，防止未来有人在侧边栏再加一项造成重复。

**🟡 矛盾 4：文档数量叙事漂移（人类撰写层）**

- README/ARCHITECTURE 文案多处写"11 个模块"，ARCHITECTURE §5 却列了 12 个（含 clean-space、dev-cleaner）；`registry.tsx` 实际 11 个（不含已去注册的 dev-cleaner）。代码 registry 自洽，但人类撰写的 README/ARCHITECTURE 描述滞后。
- `docs/modules/README.md` 中多个模块的"功能/设计"列仍是 `—`（quick-launch、app-manager、dev-toolbox、dev-cleaner、env-detector、token-calculator、terminology、hardware 缺 features/design）。
- **建议**：`check:docs` 门禁只校验 modules↔features 对齐，不覆盖叙事描述；建议对 README/ARCHITECTURE 做一次人工对齐，或将"侧边栏模块清单"抽成可被 CI 断言的数据。

### 2.3 冗余与缺失判断

- **功能冗余**：低。主要能力无重复实现（清理引擎、端口/环境/Token 均单点实现 + 复用）。
- **功能缺失**：见第四部分（缺口与优先级）。

---

## 三、改进建议（按 UX / 性能 / 安全 / 可维护性）

### 3.1 用户体验（UX）

1. **全局命令面板 ⌘K（最高杠杆）** — 全仓 grep `CommandPalette|quickOpen|⌘K|Cmd+K` **零命中**。作为"启动器"定位的工具，缺少跨模块跳转/动作检索是明显短板。预期：把"打开任意模块/设置/动作"收敛到一个快捷键，显著提升日活使用深度与专业感。
2. **统一应用偏好设置（Bench Preferences）** — 当前侧边栏唯一"配置"项是 macOS System Settings；Bench 自身没有偏好中心（启动默认模块、托盘行为、更新节奏、数据保留期）。主题/语言虽全局但分散。建议新增应用级设置 hub。
3. **侧边栏信息密度与分组** — terminology / hardware 等边缘模块占一级入口，建议将低频/知识类（terminology、hardware、token）折叠进"更多/工具"分组或 Dev Toolbox，让主路径（Quick Launch / App Manager / Clean Space / Dev Toolbox / System Settings）更突出。
4. **空状态/首次引导** — Account Manager（多账号空态）、Env Detector、Hardware 首次进入缺引导；clean-space 已做得好（骨架屏/首屏快扫），可借鉴其模式。

### 3.2 性能

1. **虚拟化债（组件已建好却只用 2 处）** — `VirtualGridView`/`VirtualDataTable` 已存在，但目前仅 **Port Manager、Terminology** 使用。未虚拟化：Quick Launch（AppCard 列表）、Account Manager（多账号）、Clean Space（分类/明细列表）、Dev Cleaner（扫描结果）、Port Manager 的 PID 进程树（roadmap 自报大数据量会退化）。建议把"列表渲染默认走虚拟化"纳入 `lint:fe`/门禁规范。
2. **Dev Cleaner 扫描阻塞 UI** — roadmap 自报"大量文件扫描可能阻塞 UI"；Rust 侧已 `spawn_blocking`，但前端未流式化。建议接入 Tauri event 渐进渲染（clean-space 已用此模式，可直接借鉴）。
3. **Port Manager 进程树性能** — 大 PID 列表的树形渲染需虚拟化或虚拟滚动。

### 3.3 安全性

1. **推广 clean-space 的"显式可清理契约"为共享框架** — clean-space 用 `is_cleanable` + `protection_kind/reason` + 后端 `CleanupAction` 白名单 + 双围栏 + 审计日志，是标杆。Port Manager 的 kill、Dev Cleaner 的自定义目录清理、Custom Folder Cleaner 都涉及破坏性操作，应复用同一"安全破坏性动作"框架（统一确认、路径白名单裁决、审计日志），而非各自实现确认弹窗。
2. **Account Manager 安全面收敛** — 加密存储已有，但 backlog 的 TLS 指纹伪装 / WebGL / Canvas 隔离是把双刃剑（能力强大但具"反检测"特征，存在合规与声誉风险）。建议明确产品边界：定位为"开发者多账号便利切换"，而非"反关联浏览器"；相关高危 backlog 谨慎排期。
3. **System Settings 的 TCC/防火墙操作** — 高风险系统操作，roadmap 自报仍有原生 select、空 catch、未翻译 toast。建议优先重构该模块的错误传播与确认链路（其破坏性不亚于清理）。

### 3.4 可维护性

1. **测试覆盖不均** — 强：Port Manager、Clean Space、Updater、App Manager、Token Calculator。弱/无：Dev Toolbox（无测试）、Quick Launch（无测试，却是旗舰日常模块）、Terminology（无）、Env Detector（无）、Account Manager（session/probe 引擎无 Rust 单测）、System Settings（仅授权逻辑单测）。对涉及破坏性/凭据的模块（clean-space、port-manager、account-manager），缺测试 = 回归风险。建议把"破坏性/凭据模块必须有关键路径测试"写进 release 门禁。
2. **System Settings 代码气味最重** — roadmap 自评代码质量 ⭐⭐⭐，列了原生 select、空 catch、useEffect 依赖、死 store 字段、未翻译 toast。建议专项重构。
3. **Dev Toolbox page.tsx 膨胀** — ~400 行 god-component，roadmap 已计划拆 devtools/diagnostics/info 子组件。建议执行。
4. **清理孤儿代码** — 删除 dev-cleaner 的 feature.tsx/page.tsx（见 2.2 矛盾 2）。
5. **i18n 一致性** — System Settings TCC toast 硬编码英文（roadmap 自报；本次 grep 未在当前代码命中确切实例，可能已修或形式不同，建议复测）。建议强化 `check-i18n-guards` 覆盖 toast/动态字符串。

---

## 四、功能补充建议（缺口与优先级）

按"必要性 × 预期效果 / 成本"排序：

| 优先级 | 功能                                     | 必要性                                                   | 预期效果                          | 估算成本 |
| ------ | ---------------------------------------- | -------------------------------------------------------- | --------------------------------- | -------- |
| **P0** | 全局命令面板 ⌘K                          | 高：启动器类工具标配，提升使用深度                       | 全模块一键直达，降低导航成本      | 中       |
| **P0** | 应用级偏好设置 hub                       | 高：当前无集中配置入口                                   | 统一控制启动/托盘/更新/数据保留   | 中       |
| **P1** | 跨模块数据导出/导入                      | 中高：account/clean-space/terminology 各自有导出 backlog | 用户迁移/备份一站式               | 中       |
| **P1** | 列表虚拟化规范（门禁化）                 | 中：性能债已显                                           | 大数据量不退化，统一体验          | 低-中    |
| **P1** | Account Manager 范围收口 + 空态 UX       | 中：降复杂度/安全风险                                    | 聚焦核心价值，减维护面            | 中       |
| **P2** | 自动化/快捷指令（呼应原"AI 自动化"命名） | 中：当前命名与实际脱节                                   | 如"启动即端口扫描+清理"场景化流程 | 高       |
| **P2** | 键盘快捷键自定义 UI                      | 中                                                       | 重度用户效率                      | 中       |
| **P2** | 无障碍审计（a11y）全模块                 | 中：clean-space 已做，其他滞后                           | 合规 + 可用性                     | 中       |
| **P3** | 崩溃报告/诊断（opt-in）                  | 低-中：隐私取舍                                          | 优先级决策数据                    | 中       |
| **P3** | 插件/扩展机制                            | 低：当前非必需                                           | 生态扩展（远期）                  | 高       |

---

## 五、给不同角色的建议（Stakeholder Comms 摘要）

- **给 CEO / 决策者**：工程纪律强、文档成熟；当务之急是**统一产品定位话术**（AI 总入口 vs 开发者工具），并决定 account-manager 是否作为旗舰差异化功能重投，还是收口为"开发者便利"子集。
- **给工程 Lead**：优先三件事——① 虚拟化债 + Dev Toolbox 拆分；② System Settings 重构 + 测试补齐（尤其 Quick Launch / 破坏性模块）；③ 抽取"安全破坏性动作"共享框架。
- **给设计**：⌘K 命令面板与统一偏好设置是最该排进设计队列的两个高杠杆交互。

---

## 六、附录：本次审查核验过的证据

- 文档：`docs/ROADMAP.md`、`docs/DECISIONS.md`、`docs/START-HERE.md`、`docs/modules/README.md`、13 个模块 `roadmap.md`
- 代码注册关系：`src/features/registry.tsx`（确认 11 个注册模块 + `TOOLBOX_FEATURE_IDS` 复用策略）、`src/features/dev-toolbox/page.tsx`（确认 tab 直接复用 port/env/token 的 page 组件）、`src/features/dev-toolbox/feature.tsx`、`src/features/clean-space/feature.tsx`
- grep 取证：
  - 全局命令面板：`CommandPalette|quickOpen|⌘K|Cmd+K` → **0 命中**
  - 虚拟化使用：`VirtualGridView|VirtualDataTable|react-virtuoso|react-virtual` → 仅 port-manager、terminology
  - dev-cleaner 孤儿：`devCleanerFeature` 未被 registry 引入；`DevCleanerPage` 默认导出无外部引用（仅引擎层 `DevCleanerPageContent`/`useDevCleanerController` 被 clean-space 复用）
  - 全局偏好设置：`preferences|AppConfig|benchConfig` → 仅命中 app-manager 内部 preferences，无全局 Bench 配置模块
