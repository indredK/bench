# Network Probe · 场景用例索引

> **作用**：用「用户故事 + 操作步骤 + 期望」把 [design](./design.md) / 四分册 / [prototype](./prototype.html) 串成可评审、可验收的路径。
> **不是**替代 design（架构/IPC 仍以 design 为准）；本目录回答「什么情况下、怎么用、验什么」。
> **平台默认**：macOS 14+ · `nodeId=local`（除非场景写明 remote）。

## 文档

| 文件                                                       | 覆盖重心                                                        | 档位         |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| [01-first-aid.md](./scenarios/01-first-aid.md)             | 基础视角急救箱：体检、意见、站点、上不了网、修复、报告          | MVP          |
| [02-targeted-test.md](./scenarios/02-targeted-test.md)     | 测试 Tab：Ping/DNS/TCP/自定义/Traceroute；双入口 MTU/出口；测速 | MVP + Post-C |
| [03-security-adv.md](./scenarios/03-security-adv.md)       | 安全 Tab：污染/端口/抓包/DNSSEC/WHOIS；授权声明；可选包         | Post-Adv     |
| [04-discover-remote.md](./scenarios/04-discover-remote.md) | 发现 Tab：ARP/局域网服务/NAT/NTP；多节点；agent                 | Post-Adv/C   |
| [05-crosscutting.md](./scenarios/05-crosscutting.md)       | 横切：导航记忆、命令透明、三次确认、降级、红线负向、能力矩阵    | MVP + Post   |

## 场景一览

| ID       | 标题                                | 主文件 | 档位     |
| -------- | ----------------------------------- | ------ | -------- |
| S-FA-01  | 家里突然上不了网（急救主路径）      | 01     | MVP      |
| S-FA-02  | DNS 坏了但公网 IP 通                | 01     | MVP      |
| S-FA-03  | 咖啡店 Captive Portal               | 01     | MVP      |
| S-FA-04  | 站点延迟看板抽查 + 自定义站         | 01     | MVP      |
| S-FA-05  | 导出健康报告                        | 01     | MVP      |
| S-TT-01  | 开发者验证 `api.example.com:443`    | 02     | MVP      |
| S-TT-02  | Traceroute / MTR 看路径             | 02     | MVP-B    |
| S-TT-03  | 测试入口测 MTU / 公网出口（双入口） | 02     | MVP-B    |
| S-TT-04  | 带宽测速（librespeed）              | 02     | Post-C   |
| S-SEC-01 | 首次进入安全 Tab：授权声明          | 03     | Post-Adv |
| S-SEC-02 | 怀疑 DNS/hosts/证书污染             | 03     | Post-Adv |
| S-SEC-03 | 扫描自有 NAS 端口（含缺包安装）     | 03     | Post-Adv |
| S-SEC-04 | 包级诊断看 RST/重传                 | 03     | Post-Adv |
| S-SEC-05 | DNSSEC / DoH 与 WHOIS               | 03     | Post-Adv |
| S-DIS-01 | 看看局域网有谁                      | 04     | Post-Adv |
| S-DIS-02 | 浏览 mDNS / SSDP 服务               | 04     | Post-Adv |
| S-DIS-03 | NAT 类型 + NTP 偏移                 | 04     | Post-Adv |
| S-DIS-04 | 多地对比同一域名 DNS                | 04     | Post-C   |
| S-DIS-05 | 添加自有 agent 节点                 | 04     | Post-C   |
| S-X-01   | L1/L2 导航记忆与结果保留            | 05     | MVP      |
| S-X-02   | 命令透明（hover + 日志）            | 05     | MVP      |
| S-X-03   | 高危重置网络栈三次确认              | 05     | MVP      |
| S-X-04   | 无特权 / 本地网络权限降级           | 05     | MVP      |
| S-X-05   | 可选能力包安装与卸载（D-017）       | 05     | Post-Adv |
| S-X-06   | 硬红线负向：不出现攻击能力          | 05     | 全程     |
| S-X-07   | 与 port-manager / diagnostics 边界  | 05     | MVP      |

## 功能覆盖矩阵（L2 → 场景）

> 实现验收：每格至少有一个场景跑通或明确标「设计保留未实现」。

### 基础视角

| L2 / 子能力                 | 场景             |
| --------------------------- | ---------------- |
| 概览                        | S-FA-01          |
| 一键体检（§5.4.1 全 key）   | S-FA-01, S-FA-02 |
| 扫描意见 Advisor            | S-FA-01, S-FA-02 |
| 站点延迟                    | S-FA-04          |
| 上不了网 · Captive          | S-FA-03          |
| 上不了网 · 代理/VPN         | S-FA-01, S-TT-03 |
| 上不了网 · IPv6             | S-FA-01          |
| 上不了网 · MTU              | S-FA-01, S-TT-03 |
| 上不了网 · 公网出口         | S-FA-01, S-TT-03 |
| 上不了网 · DNS vs IP        | S-FA-02          |
| 一键修复 flush/switch/renew | S-FA-02, S-X-03  |
| 报告导出                    | S-FA-05          |
| 打开系统网络设置            | S-FA-01, S-FA-02 |

### 测试

| L2         | 场景             |
| ---------- | ---------------- |
| Ping       | S-TT-01, S-X-04  |
| DNS        | S-TT-01, S-FA-02 |
| TCP        | S-TT-01          |
| 自定义目标 | S-TT-01, S-FA-04 |
| Traceroute | S-TT-02, S-X-04  |
| MTU        | S-TT-03          |
| 公网出口   | S-TT-03          |
| 带宽测速   | S-TT-04          |

### 安全

| L2         | 场景             |
| ---------- | ---------------- |
| 端口扫描   | S-SEC-03, S-X-05 |
| 污染检测   | S-SEC-02         |
| 包级诊断   | S-SEC-04         |
| DNSSEC/DoH | S-SEC-05         |
| WHOIS      | S-SEC-05         |
| 授权声明   | S-SEC-01         |

### 发现

| L2         | 场景               |
| ---------- | ------------------ |
| ARP 发现   | S-DIS-01           |
| 局域网服务 | S-DIS-02           |
| NAT        | S-DIS-03           |
| NTP        | S-DIS-03           |
| 多节点对比 | S-DIS-04, S-DIS-05 |

### 横切 / 护栏

| 能力             | 场景             |
| ---------------- | ---------------- |
| 导航记忆         | S-X-01           |
| 命令透明         | S-X-02           |
| 三次确认         | S-X-03           |
| 能力矩阵 / 降级  | S-X-04           |
| 可选能力包 D-017 | S-X-05, S-SEC-03 |
| 攻击红线负向     | S-X-06           |
| 模块边界         | S-X-07           |

## 场景书写约定

每个场景固定小节：

1. **背景** — 谁、在什么网络环境下
2. **前置** — 权限、node、是否已装 pack
3. **步骤** — 对齐 L1→L2→操作
4. **期望** — UI / DTO / 能力状态 / 不得出现的行为
5. **映射** — IPC、`HealthCheckItem.key`、设计章节
6. **档位** — MVP / Post-Adv / Post-C

负向场景（S-X-06）必须写「系统中不出现的入口」。

## 与 Defaults 的关系

场景开箱依赖内置名单（推荐 DNS、Captive URL、公网 IP API、站点包等），见 [defaults.md](./defaults.md)。实现验收时：MVP 场景**不得**要求用户先手工填写这些 URL 才能演示。
