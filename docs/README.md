# Bench 文档

| 路径 | 说明 |
|------|------|
| **[development-workflow.md](./development-workflow.md)** | 日常开发流程（执行手册） |
| **[roadmap/release-themes.md](./roadmap/release-themes.md)** | 全局发布主题与验收（执行依据） |
| **[product-iteration-reference.md](./product-iteration-reference.md)** | 迭代方法论与未来方向（仅供参考） |
| **[modules/](./modules/README.md)** | 按模块收纳：设计、迭代、Bug |
| **[coding-standards.md](./coding-standards.md)** | 全仓库编码与文档目录规范（§11 文档） |

## 模块一览

| 模块 | 目录 |
|------|------|
| Account Manager | [modules/account-manager/](./modules/account-manager/) |
| System Settings | [modules/system-settings/](./modules/system-settings/) |
| Quick Launch | [modules/quick-launch/](./modules/quick-launch/) |
| App Manager | [modules/app-manager/](./modules/app-manager/) |
| Dev Toolbox | [modules/dev-toolbox/](./modules/dev-toolbox/) |
| Port Manager | [modules/port-manager/](./modules/port-manager/) |
| Dev Cleaner | [modules/dev-cleaner/](./modules/dev-cleaner/) |
| Env Detector | [modules/env-detector/](./modules/env-detector/) |
| Token Calculator | [modules/token-calculator/](./modules/token-calculator/) |
| Terminology | [modules/terminology/](./modules/terminology/) |
| Hardware | [modules/hardware/](./modules/hardware/) |

每个模块目录通常包含：

- `README.md` — 索引
- `roadmap.md` — 迭代规划与 checkbox
- `bugs.md` — 已知问题（无 open bug 时可能仅保留关闭记录）
- 设计稿（`.md`，视模块而定）
