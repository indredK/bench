# Bench 路线图

> **AI 状态机** — 此文件由 AI 自动维护，每次功能合入后更新对应 checkbox。
>
> 规则：
> - 只有 **当前主题 (Active Theme)** 下的项应被开发
> - 已完成的项从 Backlog 移除（保留 commit 历史可查）
> - 跨模块依赖用 `blocked-by: <module>` 标注
>
> 模块级细节见 `docs/modules/<id>/roadmap.md`，此处只维护跨模块优先级和版本节奏。

---

## §1 版本节奏

```
v1.x (Current)    — 维护期：Bug 修复 + 小改进
v2.0 (Next)       — 计划中：架构级变更
```

发布周期：按需发布，无固定日历。每个版本包含一个或多个主题（Themes）。

---

## §2 当前状态

<!-- AI: 更新下方 checkbox 以反映实际状态 -->

- [x] **v1.21.0** (已发布) — 当前线上版本
- [ ] v1.22.0 — 下一个版本

---

## §3 活跃主题 (Active Theme)

<!-- AI: 当前正在开发的主题，维护期只有一个 Active Theme -->

### Theme: Developer Daily Loop — 开发者日常闭环打磨

**目标**：围绕主线用户故事（启动 App → 端口/清理/环境 → 小工具）补齐可见短板，把"每天都用"的路径打磨到可信赖。选品依据见 [release-themes.md](./roadmap/release-themes.md) 定位与选品原则（主线模块优先）。

**验收标准**（每项对应具体模块 backlog，合入后回勾）：
- [ ] Quick Launch：`scenes.ts → services/` 迁移完成，App 启动/Finder 操作封装到 use-case 层（见 [quick-launch/roadmap.md](./modules/quick-launch/roadmap.md)）
- [ ] Quick Launch / Account Manager：大列表虚拟化（AppCard / 多账号列表）落地至少一处
- [ ] 主线模块测试补齐：Quick Launch ≥1 controller/use-case 测试进入 `test:critical` 门禁
- [ ] 每个主线模块 `roadmap.md` 的 📊 评估与 Backlog 与代码现状一致（由 `check:docs` 校验）

**涉及模块**：
| 模块 | 改动类型 | 依赖 |
|------|----------|------|
| Quick Launch | 分层重构 + 虚拟化 + 测试 | Platform Layer |
| Account Manager | 列表虚拟化 + Session 空态 UX | IPC Contracts |
| Dev Toolbox | 子模块拆分收尾 | 四个子模块 |

> **已完成主题存档**：
> - ✅ **AI 自动化研发系统基建**（2026-07-06 完成）— 以文档为 SSoT 的 AI 闭环已建立：`/review /fix /doc /feature` 四工作流契约、`.cursorrules` 行为锁、`AGENTS.md` 总入口路由、bugs 台账模板、`check:docs` 文档一致性门禁均就绪。一个完整 cycle（自审→自修→自测→自提交）已可运行。

---

## §4 模块状态总览

<!-- AI: 勾选 = 该模块已完成核心功能，处于维护/增强期 -->
<!-- 不要在此处列 backlog 细节，细节在各模块 docs/modules/<id>/roadmap.md -->

| 模块 | 状态 | 核心功能完成 | 备注 |
|------|------|:-----------:|------|
| Account Manager | 🟢 维护 | ✅ | Session 迁移待增强 |
| App Manager | 🟢 维护 | ✅ | |
| Dev Cleaner | 🟢 维护 | ✅ | |
| Dev Toolbox | 🟡 活跃开发 | ✅ | 子模块拆分进行中 |
| Env Detector | 🟢 维护 | ✅ | |
| Hardware | 🟢 维护 | ✅ | 纯数据 + 对比视图 |
| Port Manager | 🟢 维护 | ✅ | 参考实现，模式标杆 |
| Quick Launch | 🟡 活跃开发 | ⚠️ | `scenes.ts` 待拆分 |
| System Settings | 🟢 维护 | ✅ | 开关库持续增补 |
| Terminology | 🟢 维护 | ✅ | |
| Token Calculator | 🟢 维护 | ✅ | |
| Updater | 🟢 维护 | ✅ | 基础设施模块 |

### 状态说明

| 标记 | 含义 |
|------|------|
| 🟢 维护 | 核心功能完成，仅修 Bug + 小增强 |
| 🟡 活跃开发 | 有结构性改动进行中 |
| 🔴 阻塞 | 被外部依赖阻塞 |
| ⚠️ 注意 | 有已知技术债待处理 |

---

## §5 跨模块依赖图

```
Updater              (无依赖)
Platform Layer       (无依赖)
IPC Contracts        (无依赖)

Port Manager         → IPC Contracts
Dev Cleaner          → IPC Contracts
Env Detector         → IPC Contracts

Account Manager      → IPC Contracts + Updater
App Manager          → IPC Contracts
System Settings      → IPC Contracts (macOS only)
Terminology          → IPC Contracts
Token Calculator     → IPC Contracts

Hardware             → i18n (静态数据，无 IPC)
Quick Launch         → IPC Contracts + Platform Layer

Dev Toolbox          → Port Manager + Dev Cleaner + Env Detector + Token Calculator
                     (作为 tab hub 聚合四个子模块)
```

---

## §6 AI 状态机更新日志

<!-- AI: 每次更新此文件时，在下方追加一行 -->

| 日期 | 更新者 | 改动 |
|------|--------|------|
| 2026-07-05 | 人工 | 初始创建 |
| 2026-07-06 | AI | AI 基建主题验收完成并存档；Active Theme 切换为 Developer Daily Loop；新增 bugs 台账模板与 check:docs 门禁 |
