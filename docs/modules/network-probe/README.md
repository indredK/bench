# Network Probe（网络探测 / 网络急救箱）

> **定位**：完整的网络探测与故障排查（急救箱 + 专业探测）。对标方向：360 断网急救箱、NETworkManager、安全探测工具链（**仅检测、不攻击**）。
> **状态**：**模块 1.0 / MVP 实现中**（P0 地基已开工）；侧边栏为可用壳 + 概览/TCP。
> **代码**：`src/features/network-probe/` · 后端 `src-tauri/src/net_probe/`
> **首版交付**：MVP **A+B**（含 L0–L3 清单、DNS/IP 对照、TCP connect 等基础工具；见 design §5.4 / §5.7）。其余能力设计保留，实现靠后。

## 文档索引

| 文档                                       | 说明                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| [design.md](./design.md)                   | **全局设计真理源**：架构、IPC 总表、护栏、模块边界、能力矩阵、检查表 |
| [design-basic.md](./design-basic.md)       | L1「基础视角」实现设计（macOS 急救箱）                               |
| [design-test.md](./design-test.md)         | L1「测试」实现设计（主动探测 / traceroute）                          |
| [design-security.md](./design-security.md) | L1「安全」实现设计（暴露面 / 污染 / 抓包 · Post-MVP）                |
| [design-discover.md](./design-discover.md) | L1「发现」实现设计（局域网 / NAT / 多节点 · Post-MVP）               |
| [prototype.html](./prototype.html)         | **可交互 UI 原型**：L1×4 · L2 底栏 · L3 中间 · 命令透明              |
| [scenarios.md](./scenarios.md)             | **场景用例索引** + L2 覆盖矩阵                                       |
| [scenarios/](./scenarios/)                 | 分册场景：急救 / 测试 / 安全 / 发现 / 横切护栏                       |
| [defaults.md](./defaults.md)               | **默认资源目录**：推荐 DNS、Captive、公网 IP API、站点包等           |
| [roadmap.md](./roadmap.md)                 | MVP / Post-MVP / Vision 未完成项                                     |
| [knowledge-graph.md](./knowledge-graph.md) | Mermaid 总览图谱                                                     |
| [DECISIONS.md D-016](../../DECISIONS.md)   | 方向性决策（入口、分期、平台、红线）                                 |
| [DECISIONS.md D-017](../../DECISIONS.md)   | 可选能力包（可插拔高级组件）                                         |

全局顺序：[2.0 最终路线图](../../ROADMAP.md)（本模块**不进入 2.0 执行序列**，属设计冻结的后续品类）。

## 设计原则（摘要）

- Rust 返回值为准；Feature-sliced；IPC 双边契约；长任务 events + 可取消。
- macOS 主路径；Windows 降级；Linux 非目标（D-014）。
- 硬红线：不实现主动攻击能力。
- **可插拔（D-017）**：MVP 主包打开即用；Adv 重能力按需 sidecar / 本机工具 / 远程——不是运行时下 crate。

## 已决决策（摘要）

详见 design §10 / D-016 / **D-017**。要点：独立一级 feature；当前只做设计；MVP=A+B；测速与 remote 属 Post-MVP-C；高危修复三次确认；高级能力可选包。

## 调研参考

成熟库与安全工具对照表（NETworkManager、Trippy、Globalping、nmap 等）见历史讨论与 design §2 / §11；**实现选型以 design §2 表格为准**，避免 README 与 design 双源漂移。
