# Bench 文档

> AI 入口：`../AGENTS.md` · 行为锁：`../.cursorrules` · 新人导航：[START-HERE.md](./START-HERE.md)

| 路径 | 说明 | AI 用途 |
|------|------|---------|
| **[START-HERE.md](./START-HERE.md)** | 一页纸总导航（人类新人 & AI 入口流程图） | 入门导航 |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 全局架构、数据流、🔴禁止模式 | 必读：理解系统 |
| **[development-workflow.md](./development-workflow.md)** | 日常开发流程 + Build Troubleshooting | 开发参考 |
| **[AI-WORKFLOWS.md](./AI-WORKFLOWS.md)** | /review /fix /doc /feature 四大工作流 | 必读：工作模式 |
| **[ROADMAP.md](./ROADMAP.md)** | 集中路线图 + AI 状态机 | 必读：知道做什么 |
| **[DECISIONS.md](./DECISIONS.md)** | 决策日志（为什么这么做，跨会话记忆） | 必读：恢复规划上下文 |
| **[roadmap/release-themes.md](./roadmap/release-themes.md)** | 全局发布主题与验收（执行依据） | 发布参考 |
| **[dev-prod-coexistence.md](./dev-prod-coexistence.md)** | Dev / Prod 共存策略 | 部署参考 |
| **[modules/](./modules/README.md)** | 按模块收纳：设计、迭代、Bug | 模块细节 |
| **[coding-standards.md](./coding-standards.md)** | 全仓库编码与文档目录规范（§11 文档） | 必读：编码规则 |
| **[audit-report.md](./audit-report.md)** | 审计报告 & 不计违规决策 | 必读：避免重复标记 |

## 模块一览

| 模块 | 目录 |
|------|------|
| Account Manager | [modules/account-manager/](./modules/account-manager/) |
| System Settings | [modules/system-settings/](./modules/system-settings/) |
| Quick Launch | [modules/quick-launch/](./modules/quick-launch/) |
| App Manager | [modules/app-manager/](./modules/app-manager/) |
| Dev Toolbox | [modules/dev-toolbox/](./modules/dev-toolbox/) |
| Port Manager | [modules/port-manager/](./modules/port-manager/) |
| Clean Space | [modules/clean-space/](./modules/clean-space/) |
| Dev Cleaner | [modules/dev-cleaner/](./modules/dev-cleaner/)（已迁入 Clean Space） |
| Env Detector | [modules/env-detector/](./modules/env-detector/) |
| Token Calculator | [modules/token-calculator/](./modules/token-calculator/) |
| Terminology | [modules/terminology/](./modules/terminology/) |
| Hardware | [modules/hardware/](./modules/hardware/) |
| Updater | [modules/updater/](./modules/updater/) |

每个模块目录通常包含：

- `README.md` — 索引
- `roadmap.md` — 迭代规划与 Backlog
- `features.md` / `design.md` — 功能说明与技术设计（视模块而定）
