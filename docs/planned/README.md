# 规划功能（Planned）

> 本目录是各模块**规划功能的唯一真相源**（Roadmap 层的模块粒度）。记录**未实现 / 待验证 / 远期**的功能，以及与各轮改动对应的**变更记录**。

## 结构

每模块一个文件：`<模块名>.md`，与 `docs/product-specs/<模块名>.md` 同结构、一一对应（16 个模块全覆盖）。

## 全局规划视图（待办项数速览）

> 详单见各模块文件；勾选式 `- [ ]` 实现完成即从对应文件移除。

| 模块                                    | 待实现 / 待验证 | 远期   | 模块                                      | 待实现 / 待验证 | 远期   |
| --------------------------------------- | --------------- | ------ | ----------------------------------------- | --------------- | ------ |
| [account-manager](./account-manager.md) | 22              | 3      | [network-probe](./network-probe.md)       | 15              | 6      |
| [app-manager](./app-manager.md)         | 6               | 3      | [photo-triage](./photo-triage.md)         | 5               | 3      |
| [clean-space](./clean-space.md)         | 4               | 4      | [port-manager](./port-manager.md)         | 5               | 2      |
| [command-center](./command-center.md)   | 6               | 2      | [quick-launch](./quick-launch.md)         | 6               | 2      |
| [dev-cleaner](./dev-cleaner.md)         | 4               | 2      | [system-settings](./system-settings.md)   | 8               | 1      |
| [dev-toolbox](./dev-toolbox.md)         | 6               | 2      | [terminology](./terminology.md)           | 7               | 2      |
| [env-detector](./env-detector.md)       | 5               | 1      | [token-calculator](./token-calculator.md) | 3               | 0      |
| [hardware](./hardware.md)               | 4               | 2      | [updater](./updater.md)                   | 4               | 0      |
| **合计**                                | **118**         | **35** | <br />                                    | <br />          | <br /> |

## 统一模板（每份文档均含）

- **待实现 / 待验证** — 已规划但未完成、或需真机/行为验收的项（勾选式 `- [ ]`）

- **远期** — 已立项但无排期的能力

- **变更记录** — 每轮功能改动追加一行（日期 + 改动摘要），先记于此再同步进 product-specs

## 与其他文档的关系

| 文档                             | 职责                                                   | 不重复的内容       |
| -------------------------------- | ------------------------------------------------------ | ------------------ |
| `planned/<模块>.md`              | 模块**产品功能**规划真相源                             | —                  |
| `docs/ROADMAP.md`                | 全局**发布阶段**规划（R00-R10 代码收口/真机矩阵/发布） | 阶段进度、验收命令 |
| `docs/modules/<模块>/roadmap.md` | 已精简为**指向本目录**的指针                           | 无（已归并）       |
| `docs/product-specs/<模块>.md`   | 已实现功能规格                                         | 实现细节           |

## 维护规则

- **新增规划**：先写到 `planned/<模块>.md`，再开发。

- **实现完成**：从本文件移除该项 → 同步 `product-specs/<模块>.md` → 在变更记录补一行。

- **变更记录**：每轮功能改动 / 优化 / bug 修复都追加一行（含工程性修复如 CI 编译修复），保证文档独立于会话记忆。
