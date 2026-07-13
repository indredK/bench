# 模块文档

目录与 `src/features/<id>/` 双向对齐。每个模块必须有 `README.md` 和只保留未完成项的 `roadmap.md`；独有架构或安全约束放 `design.md`。

| 模块 | 专题文档 |
|------|----------|
| [account-manager](./account-manager/) | [技术设计](./account-manager/design.md) · [生产可靠性审计](./account-manager/audit-and-upgrade-2026-07-13.md) |
| [app-manager](./app-manager/) | [跨平台审计与升级](./app-manager/audit-and-upgrade-2026-07-13.md) |
| [clean-space](./clean-space/) | [技术设计](./clean-space/design.md) |
| [dev-cleaner](./dev-cleaner/) | Clean Space 内部清理引擎 |
| [dev-toolbox](./dev-toolbox/) | - |
| [env-detector](./env-detector/) | - |
| [hardware](./hardware/) | - |
| [port-manager](./port-manager/) | [技术设计](./port-manager/design.md) |
| [quick-launch](./quick-launch/) | [跨平台审计与升级](./quick-launch/audit-and-upgrade-2026-07-13.md) |
| [system-settings](./system-settings/) | [技术设计](./system-settings/design.md) |
| [terminology](./terminology/) | - |
| [token-calculator](./token-calculator/) | - |
| [updater](./updater/) | - |

全局优先级见 [ROADMAP.md](../ROADMAP.md)。新增或删除 feature 后运行 `pnpm run check:docs`。
