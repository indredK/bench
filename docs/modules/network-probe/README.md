# Network Probe（网络探测 / 网络急救箱）

> **完备功能规格** → [product-specs/network-probe.md](../../reference/product-specs/network-probe.md)
> **规划功能** → [planned/network-probe.md](../../roadmap/planned/network-probe.md)

代码：`src/features/network-probe/` · 后端 `src-tauri/src/net_probe/`

定位：完整网络探测与故障排查（急救箱 + 专业探测），对标 360 断网急救箱 / NETworkManager / 安全探测工具链（**仅检测、不攻击**）；macOS 主路径，Windows 降级，Linux 非目标。状态：模块 1.0 / MVP A+B 已闭环；Post-MVP 测速、多节点 DNS/Ping/HTTP 与 Globalping 可选 token、安全与发现主路径已交付；端口面板的 Nmap 轻量服务 / OS 指纹、暴露类别标签及 macOS loopback 真机验收已完成；Windows 真机回归、Local Network/TCC 拒绝场景与特权 helper 仍待专用环境或后续实现。

## 产品地图

用户视角的五个问题，对应五个一级入口（清单唯一来源：`src/features/network-probe/probe-catalog.ts`）：

| 一级（L1） | 回答的问题              | 二级（L2）                                                 | 何时用                             |
| ---------- | ----------------------- | ---------------------------------------------------------- | ---------------------------------- |
| 基础视角   | 我断网了吗？为什么？    | 概览 · 一键体检 · 扫描意见 · 上不了网 · 一键修复 · 报告    | 网络出问题时的**第一站**，先看这里 |
| 站点延迟   | 某个网站/服务能连吗？   | 官方站点 · 站点包                                          | 怀疑只有某些站点不通               |
| 测试       | 这条链路哪一跳慢/断？   | ping · DNS · TCP · 自定义 · traceroute · MTU · 出口 · 测速 | 已经知道目标，要量化               |
| 安全       | 我这台机器暴露了什么？  | 端口 · DNS 污染 · 抓包 · DNSSEC · WHOIS（**需先授权**）    | 排查暴露面（仅检测，不攻击）       |
| 发现       | 局域网/多节点里有什么？ | ARP · 局域网服务 · NAT · NTP · 多节点                      | 摸清环境、多地对比                 |

使用顺序建议：**基础视角 →（定位到某个目标）测试 / 站点延迟 →（怀疑暴露面）安全 →（要看周边）发现**。基础视角里的六个小节一次只显示一个；其余 L1 的二级项在底栏切换；右侧始终显示实际执行的命令（命令透明）。

## 文档索引

| 文档                                                 | 说明                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| [design.md](./design.md)                             | **全局设计真理源**：架构、IPC 总表、护栏、模块边界、能力矩阵、检查表 |
| [design-basic.md](./design-basic.md)                 | L1「基础视角」实现设计（macOS 急救箱）                               |
| [design-test.md](./design-test.md)                   | L1「测试」实现设计（主动探测 / traceroute）                          |
| [design-security.md](./design-security.md)           | L1「安全」实现设计（暴露面 / 污染 / 抓包 · Post-MVP）                |
| [design-discover.md](./design-discover.md)           | L1「发现」实现设计（局域网 / NAT / 多节点 · Post-MVP）               |
| [prototype.html](./prototype.html)                   | **可交互 UI 原型**：L1×4 · L2 底栏 · L3 中间 · 命令透明              |
| [scenarios.md](./scenarios.md)                       | **场景用例索引** + L2 覆盖矩阵                                       |
| [scenarios/](./scenarios)                            | 分册场景：急救 / 测试 / 安全 / 发现 / 横切护栏                       |
| [defaults.md](./defaults.md)                         | **默认资源目录**：推荐 DNS、Captive、公网 IP API、站点包等           |
| [knowledge-graph.md](./knowledge-graph.md)           | Mermaid 总览图谱                                                     |
| [roadmap.md](./roadmap.md)                           | 实施路线（未完成项已归入 planned）                                   |
| [DECISIONS.md D-016](../../explanation/decisions.md) | 方向性决策（入口、分期、平台、红线）                                 |
| [DECISIONS.md D-017](../../explanation/decisions.md) | 可选能力包（可插拔高级组件）                                         |

全局顺序：[2.0 最终路线图](../../roadmap/ROADMAP.md)（本模块**不进入 2.0 执行序列**；与 2.0 并行旁路）。
