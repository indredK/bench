# Network Probe — 技术设计

> 配套 [README.md](./README.md) 与 [roadmap.md](./roadmap.md)。本文件是模块**长期架构 / 安全边界 / 修改入口**的唯一设计真理源。
> **当前阶段**：**模块 1.0 / MVP 实现中**（P0 地基已落地）；首版目标仍为 MVP A+B。
> **交付口径**：首版 = **MVP A+B**；测速 / remote / 高级探测 / Vision **设计完整保留**，实现见 roadmap Post-MVP / Vision。

---

## 0. 文档地图

| 节  | 内容                                                |
| --- | --------------------------------------------------- |
| §1  | 总体架构                                            |
| §2  | Rust crate 选型与特权降级                           |
| §3  | 双视角 UX + 三次确认 + **命令透明**                 |
| §4  | 多探测节点协议 + agent 草图                         |
| §5  | 关键算法（含 **L0–L3 检查项清单**、基础鉴别工具）   |
| §6  | IPC / Events（MVP 与 Post-MVP 分列）                |
| §7  | 前端结构                                            |
| §8  | 性能 / UX                                           |
| §9  | 安全、隐私、依赖、配额护栏、**可选能力包（D-017）** |
| §10 | 已决决策                                            |
| §11 | 调研记录（Globalping / 测速 / 特权）                |
| §12 | 领域完整性                                          |
| §13 | **模块边界**（与既有 feature）                      |
| §14 | **能力矩阵**                                        |
| §15 | **修改检查表**                                      |

### 0.1 L1 Tab 分册（实现级）

全局约束以本文为准；下列分册写 **macOS 实现细则 / 面板落点 / 验收**，避免把四个 Tab 全堆进单文件：

| L1       | 分册                                       |
| -------- | ------------------------------------------ |
| 基础视角 | [design-basic.md](./design-basic.md)       |
| 测试     | [design-test.md](./design-test.md)         |
| 安全     | [design-security.md](./design-security.md) |
| 发现     | [design-discover.md](./design-discover.md) |

### 0.2 场景用例（验收路径）

技术设计回答「怎么做」；场景回答「什么情况下怎么用、验什么」：[scenarios.md](./scenarios.md)（含 L2 覆盖矩阵）。

### 0.3 默认资源目录（开箱名单）

场景依赖的推荐 DNS、Captive URL、公网 IP API、站点包等：[defaults.md](./defaults.md)（主包内置，≠ D-017 能力包）。

---

## 1. 总体架构

```
┌─ 前端 src/features/network-probe/ ──────────────┐
│  page.tsx (视图开关 + NodeSelector)             │
│  store.ts (viewMode, nodeId, scanResults, ...)  │
│  hooks/useNetworkProbeController.ts             │
│  services/network-probe.use-cases.ts (编排/校验) │
│  services/network-probe.repository.ts (IPC+events) │
│  services/network-probe.advisor.ts (扫描意见)    │
│  services/network-probe.sites.ts (站点库)        │
│  components/{NodeSelector,BasicView/,AdvancedView/,HealthReport} │
└──────────────────────┬──────────────────────────┘
                        │ typed IPC + Tauri events
┌─ 后端 src-tauri/src/net_probe/ ─┐
│  commands.rs  types.rs  state.rs  node.rs       │
│  ping.rs  dns.rs  traceroute.rs  sites_probe.rs │
│  health.rs  advisor_rules.rs  fix.rs            │
│  （Post-MVP）ports / host_discovery / fingerprint │
│  （Post-MVP）packet_capture / speed / pollution   │
└─────────────────────────────────────────────────┘
```

要点：

- **能力下沉到 Rust**：探测 / 修复全是 Rust command；前端不碰平台网络 API。
- **长任务流式**：体检、连续 ping、traceroute、站点采样、端口扫描用 **Tauri events** 增量回传；command 返回 `ScanSessionId`，可 `cancelScan`（幂等）。
- **统一 nodeId 路由**：探测类 command 首参 `nodeId`；MVP 仅解析 `local`，remote 种类在类型与 `listProbeNodes` 中预留。
- **错误边界**：一律 `AppResult<T>` / 结构化 `AppError{code,message}`；前端只用 `parseCommandError` / `getErrorMessage` / `translateError`。

---

## 2. 关键 Rust crate（经 2026-07 实地核实）

> 选型原则：**能用成熟库就绝不自研**。traceroute/MTR 复用 `trippy-core`。

| crate                                         | 用途                        | 特权                         | 交付档           | 验证状态                                  |
| --------------------------------------------- | --------------------------- | ---------------------------- | ---------------- | ----------------------------------------- |
| `trippy-core`                                 | traceroute + MTR            | 需特权（`trippy-privilege`） | MVP-B            | ✅ 0.13.0，MSRV 1.78，spike 通过          |
| `surge-ping`                                  | 轻量 ICMP ping              | 平台相关；不足则 HTTP 兜底   | MVP-A            | ✅ 活跃；macOS/Windows 需真机验 ICMP 权限 |
| `hickory-resolver`                            | DNS 查询 / 多 resolver      | 免特权                       | MVP-A / Adv      | ✅ 正确 crate 名（非笼统 hickory-dns）    |
| `netdev` + `if-addrs`                         | 接口/网关/MAC + 变更通知    | 免特权                       | MVP-A            | ✅                                        |
| `system-configuration`(mac) / `ipconfig`(win) | 系统 DNS / 代理             | 免特权                       | MVP-A/B          | 平台分支                                  |
| `reqwest` + `rustls`                          | HTTP / SSL / Captive / 测速 | 免特权                       | MVP + Post-MVP-C | 既有栈                                    |
| `pnet` + `socket2` + `etherparse` + `pcap`    | SYN / ARP / 抓包            | 需特权                       | Post-MVP-Adv     | 标准底层                                  |
| `ipnetwork` 等                                | 网段 / 辅助                 | 免特权                       | 按需             | —                                         |

**特权与降级（摘要，细节 §11.4）**

- 免特权：DNS、HTTP、接口枚举、站点 HTTP、Captive、公网 IP、多数 L0–L3 体检。
- 需特权：`trippy-core` traceroute/MTR、SYN、ARP、pcap。
- 降级：SYN→TCP connect；ARP→ICMP/ping 扫；traceroute 无特权→UI「需授权」且不伪装成功；抓包→禁用。

### 2.1 可行性验证结论

1. traceroute/ping 引擎不自研 → `trippy-core`。
2. DNS crate = **`hickory-resolver`**。
3. L0/L1 用 `netdev` + `if-addrs`。
4. SYN/ARP 无 turnkey Rust 库 → Post-MVP 自研或 `nmap` fallback。
5. `trippy-core` 0.13.0 与当前 rustc 兼容；运行时仍依赖特权层。

---

## 3. 双视角 UX 细化

### 3.1 信息架构：三级功能树（强制布局）

> 对照 [`prototype.html`](./prototype.html)。树形导航，且 **L1 严格控制数量**，避免一级过多干扰心智。

```
顶栏 L1（一级 · 仅 4 个）  →  选中后刷新底栏
底栏 L2（二级）            →  选中后刷新中间
中间 L3（内容页）          →  该功能的最终界面
```

#### L1 冻结为四个（强制 · 2026-07-22 修订）

> 原「高级视角」L2 过多干扰心智，拆成 **安全** + **发现**；总数固定为 4，禁止再加第五个，除非单独修订。

| L1           | 用户心智                  | 放什么                                                                           |
| ------------ | ------------------------- | -------------------------------------------------------------------------------- |
| **基础视角** | 「正不正常？怎么修？」    | 急救箱：概览、体检、意见、站点、上不了网、修复、报告                             |
| **测试**     | 「对某个目标测一下」      | 主动探测：Ping/DNS/TCP/自定义/Traceroute；MTU·公网出口（与上不了网双入口）；测速 |
| **安全**     | 「有没有暴露 / 被劫持？」 | 端口扫描、污染（DNS/hosts/证书）、抓包诊断、DNSSEC/DoH、WHOIS                    |
| **发现**     | 「周围有什么 / 从哪测？」 | ARP 发现、局域网服务、NAT、NTP、多节点对比（Globalping/agent）                   |

#### 方案 A：双入口（仍有效）

- **「上不了网」** 子页含 Captive · 代理/VPN · IPv6 · **MTU** · **公网出口** · DNS vs IP。
- **「测试」** 保留 MTU、公网出口 L2，与上不了网 **共用同一 L3 面板**。
- `openSystemNetworkSettings`：概览 + 一键修复常驻按钮，不占 L2。

#### 交互规则

1. 切换 L1 → 底栏 L2 整表替换为该一级 children；**恢复该 L1 上次选中的 L2**（若无记录则默认第一个）。
2. 切换 L2 → 仅中间 L3 换页，并写入该 L1 下的「上次 L2」记忆。
3. 面包屑：`安全 / 端口扫描 / 内容`（含子页时带 · 子页名）。
4. `nodeId`、命令日志属壳层 chrome。
5. Post-MVP 项标 `Post`，不进 MVP 验收；可分布在「安全 / 发现 / 测试」。

#### 导航记忆（强制 · 来回查看）

> 用户会在 L1/L2 间反复切换对比结果，**不得每次回到某 L1 都重置到第一个 L2**。

| 记忆项                         | 作用域                                                  | 行为                                                       |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------- |
| 当前 `l1Id`                    | 模块会话（建议 `sessionStorage`；可选持久化到模块设置） | 离开 feature 再进入时恢复上次一级                          |
| 各 L1 下上次 `l2Id`            | `Record<l1Id, l2Id>`                                    | 切回该 L1 时底栏高亮并打开对应 L3                          |
| 「上不了网」子页 `offlineSub`  | 随基础视角记忆                                          | 切走再回来仍停在 Captive/MTU 等子页                        |
| （建议）各 L3 最近一次运行结果 | 面板级 store，不随导航清空                              | 来回查看仍能看到上次 Ping/体检结果，直到主动清除或新跑覆盖 |

**实现要点**

- store 示例字段：`nav: { l1Id, l2ByL1: Record<string,string>, offlineSub }`；controller 切换时只改 nav，不重置各面板结果缓存。
- L2 若已从树中移除（版本升级），回退到该 L1 的第一个合法 L2。
- 命令日志可保留会话内历史，与导航记忆独立。
- 原型：[`prototype.html`](./prototype.html) 已用内存 map 演示「按 L1 记住 L2」。

#### L2 全表（原型与实现对齐）

| L1       | L2                                                                                |
| -------- | --------------------------------------------------------------------------------- |
| 基础视角 | 概览 · 一键体检 · 扫描意见 · 站点延迟 · 上不了网 · 一键修复 · 报告                |
| 测试     | Ping · DNS · TCP · 自定义目标 · Traceroute · MTU · 公网出口 · 带宽测速(Post)      |
| 安全     | 端口扫描(Post) · 污染检测(Post) · 包级诊断(Post) · DNSSEC/DoH(Post) · WHOIS(Post) |
| 发现     | ARP 发现(Post) · 局域网服务(Post) · NAT(Post) · NTP(Post) · 多节点对比(Post)      |

组件：`FeatureTreeL1`（4 项）· `FeatureTreeL2` · 各 L3 面板（`OfflineSuite` 含子路由；`MtuPanel`/`EgressPanel` 双入口）。命令透明见 §3.5。

### 3.2 安全 / 发现面板（原 AdvancedView · Post-MVP 为主）

> 信息架构上分属 L1「安全」与「发现」；下列仍是面板级能力清单。

| 面板                                                                                                              | L1   | 交付档         |
| ----------------------------------------------------------------------------------------------------------------- | ---- | -------------- |
| `TraceroutePanel`                                                                                                 | 测试 | MVP-B          |
| `PortScanPanel` / `PollutionPanel` / `PacketCapturePanel` / `DnsSecPanel` / `WhoisPanel` / `SslPanel`（可并污染） | 安全 | Post-MVP-Adv   |
| `LanDiscoveryPanel` / `LanServicePanel` / `NatPanel` / `TimePanel` / 多节点对比                                   | 发现 | Post-MVP-Adv/C |
| 测速面板                                                                                                          | 测试 | Post-MVP-C     |

### 3.3 Advisor

- `network-probe.advisor.ts`：纯函数 `advise(item): Suggestion[]`，规则表驱动。
- 后端 `advisor_rules.rs` 供报告导出复用同一语义（避免双源漂移：规则 ID 共享）。
- 基础视角只展示精简可操作建议；判定依据在展开详情或「安全 / 发现」中呈现〔决策7〕。

### 3.4 三次确认 UX（决策4 · 规格）

现有 `DestructiveConfirmDialog` **仅单次确认**，不足以覆盖「重置网络栈」等高危修复。本模块约定：

| 步骤 | UI                                                            | 用户动作 |
| ---- | ------------------------------------------------------------- | -------- |
| 1    | 说明影响范围（将改什么、是否断网、是否可回滚）                | 下一步   |
| 2    | 展示将执行的**具体参数**（如 DNS 列表、接口名）+ 后果 callout | 下一步   |
| 3    | 要求勾选「我理解风险」或输入确认词（高危用确认词）后才可执行  | 确认执行 |

- 组件建议：新建 `TripleDestructiveConfirm`（或扩展现有 dialog 的 `steps` 模式），**不要**把三步硬塞进三次独立 AlertDialog 却无状态机。
- 后端：收到修复 command 时**再次校验**目标状态（幂等、接口仍存在、参数白名单）；拒绝前端伪造的「已确认」标志——确认只发生在 UI，授权以后端校验为准。
- 适用：`resetNetworkStack` 必须三步；`switchDns` / `renewDhcp` 至少两步（影响+参数）；`flushDns` 可用单次确认。

### 3.5 命令透明（Command transparency · 强制 UX）

> 目标：用户对「点了什么、底层在干什么」心里有数。开发者向工具尤其需要；普通用户可折叠，但不得完全隐藏。

**展示时机**

| 时机                | UI                                           | 内容                                                                                |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Hover / 焦点**    | 按钮、摘要卡、站点卡、高级面板入口的 Tooltip | 将调用的 **IPC 名 + 关键参数**（如 `pingHost(nodeId, '1.1.1.1', {count:5})`）       |
| **运行中 / 完成后** | 结果区下方或侧栏「命令日志」                 | 实际发出的 command / event 序列；流式任务逐条追加 `healthEvent` / `hop` 等          |
| **体检树展开**      | 检查项展开行                                 | 该 `key` 对应的实现命令或合成说明（如 `diff.dns_vs_ip` 标明「合成项，非独立 IPC」） |

**文案规则**

- 优先显示 **IPC 契约名**（与 `contracts.ts` 一致），必要时并列「等价含义」（如 `≈ ping 1.1.1.1`），避免只写模糊中文「正在检测」。
- 参数用真实用户输入回显（脱敏后）；禁止展示 token / agent 密钥。
- 降级路径写明：如 `scanPorts … // degraded: tcp connect`。
- i18n：Tooltip 可用 `networkProbe.cmd.*` 模板插值 command 名；**command 标识符本身不翻译**。

**实现落点（正式 UI）**

- 共享小组件建议：`CommandHint`（hover）+ `CommandLogDrawer`（会话日志，可清空）。
- 后端可选：在 `HealthCheckItem` / 工具结果 DTO 增加 `commandHint?: string`（或 `evidence.command`），避免前后端文案漂移。
- 设计预览：单文件原型 [`prototype.html`](./prototype.html)（浏览器直接打开，无 Tauri 依赖）。

---

## 4. 多探测节点协议

### 4.1 节点模型

```ts
type ProbeNode = {
  id: "local" | string
  kind: "local" | "remote-agent" | "remote-proxy"
  label: string
  reachable: boolean
  endpoint?: string
  region?: string
  capabilities?: string[] // 该节点支持的 tool id，供 UI 灰显
}
```

### 4.2 路由（`node.rs`）

| kind           | 行为               | 交付档     |
| -------------- | ------------------ | ---------- |
| `local`        | 本机执行           | MVP        |
| `remote-proxy` | Globalping REST    | Post-MVP-C |
| `remote-agent` | 自有 agent（§4.4） | Post-MVP-C |

MVP：`listProbeNodes` 至少返回 `local`；选中非 local 时 UI 提示「后续版本」或隐藏（实现前不要假连接）。

### 4.3 多节点对比（Post-MVP-C）

同一 `(target, tool)` 结果入 `store.byNode`；并排展示（例：本机 DNS 正常、探点 A 污染）。

### 4.4 自有 agent 协议草图（Post-MVP-C）

| 项       | 约定                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| 传输     | HTTPS 或 WSS；禁止明文                                                                         |
| 鉴权     | 每 agent 预共享 token 或 mTLS；请求带 HMAC(timestamp+body)                                     |
| 允许方法 | 白名单 tool id（与本地 command 同名语义）；拒绝任意 shell                                      |
| 限速     | 每 token QPS / 并发上限；超限 `429` 语义映射为 `AppError`                                      |
| SSRF     | agent **不得**被指使访问 link-local / 元数据地址（云）以外的用户未声明目标时仍要校验目标字面量 |
| 放大     | agent 不开放未鉴权 UDP 反射；只回传测量结果 JSON                                               |
| 发现     | 用户手动添加 endpoint；不做局域网自动扩散                                                      |

---

## 5. 关键算法

### 5.1 SYN stealth（Post-MVP-Adv）

见既有步骤：构造 SYN → pcap 匹配 → 不回 RST；无特权 → `connect()`。

**护栏**：默认仅允许 RFC1918 / 本机地址 / 用户显式确认的公网单主机；全网段扫描需二次确认 + 速率上限。

### 5.2 ARP 发现（Post-MVP-Adv）

本机 CIDR（默认 `/24`）ARP Request；补 ICMP；可选 rDNS。

**护栏**：默认 CIDR = 当前接口前缀；禁止无确认扫超大前缀（如 `/8`）。

### 5.3 污染检测（Post-MVP-Adv）

- DNS：多 resolver（`hickory-resolver` 指定）对比。
- hosts：读 hosts，标异常指向。
- 证书 MITM：`reqwest` + 链/SNI 校验。
- ARP 欺骗：网关 MAC 绑定漂移。
- 路由异常：traceroute 跳点 ASN（Team Cymru 等）异常绕行。

### 5.4 综合体检（MVP-A）

L0→L3 编排，部分并行；`healthEvent` 流式；`CancellationToken`；结束跑 Advisor。
**实现验收以 §5.4.1 清单为准**——禁止只做「空壳分层」而无下列具体检查项。

#### 5.4.1 L0–L3 检查项清单（MVP 强制）

| 层  | key（稳定 ID）        | 检查内容                                               | 失败时 Advisor 方向                  |
| --- | --------------------- | ------------------------------------------------------ | ------------------------------------ |
| L0  | `link.iface`          | 活动接口存在；up/down                                  | 检查网线 / Wi‑Fi 开关 / 飞行模式     |
| L0  | `link.wifi_or_wired`  | 介质类型；Wi‑Fi 时 SSID（可得则含信号）                | 连对网络 / 靠近 AP                   |
| L1  | `addr.ipv4`           | 有有效 IPv4（非仅 APIPA 若期望局域网）                 | 续租 DHCP / 检查静态配置             |
| L1  | `addr.ipv6`           | IPv6 地址状态（无则 warn，非必然 fail）                | 见双栈专项                           |
| L1  | `addr.dhcp_or_static` | 配置来源可读则标注                                     | —                                    |
| L1  | `route.default`       | **默认路由存在**；默认网关地址                         | 无默认路由 → 续 DHCP / 查 VPN 抢路由 |
| L1  | `dns.servers`         | 系统 DNS 服务器列表非空                                | 切换公共 DNS                         |
| L1  | `dns.resolve_name`    | 解析固定知名域名（如 `cloudflare.com`）                | 与下行对照区分 DNS                   |
| L1  | `hosts.override`      | **hosts 基础冲突**：常见域被指到 `127.0.0.1`/内网/异常 | 提示编辑 hosts（不自动改）           |
| L1  | `proxy.system`        | 系统代理 / PAC 是否启用                                | 关闭错误代理或修 PAC                 |
| L1  | `vpn.tunnel`          | utun / 常见 VPN 接口与默认路由是否经隧道               | 断开 VPN 对比                        |
| L1  | `firewall.status`     | **系统防火墙只读状态**（平台可探测时）                 | 提示检查防火墙，**不改**设置         |
| L2  | `svc.network`         | 平台可探测范围内网络相关服务异常（无则 skip）          | 重置网络栈（高危）                   |
| L3  | `reach.gateway`       | **ping 默认网关**                                      | 局域网/路由问题                      |
| L3  | `reach.public_ip`     | **ping 公共 IP**（如 `1.1.1.1`，不经 DNS）             | 上行/运营商/防火墙                   |
| L3  | `reach.public_name`   | **ping 或 HTTP 知名域名**（经 DNS）                    | 与上两项对照                         |
| L3  | `diff.dns_vs_ip`      | **鉴别结论（合成项）**：见 §5.4.2                      | 直接给出 DNS 坏 / 链路坏 / 代理坏等  |
| L3  | `reach.captive`       | Captive Portal                                         | 打开门户登录                         |
| L3  | `reach.public_egress` | 公网出口 IP（+ASN 可选）                               | 核对是否预期出口                     |
| L3  | `reach.mtu`           | MTU / PMTUD（可并行或用户触发）                        | VPN/隧道调整 MTU                     |

> `key` 进入 `HealthCheckItem.key` 与 Advisor 规则 ID，**勿随意改名**。平台不可探测的项标 `status: skip` + 原因，不得伪造成功。

#### 5.4.2 DNS vs 纯 IP 对照（MVP 强制鉴别）

体检必须产出可机读对照（供 Advisor）：

| 网关 ping | 公共 IP ping | 域名 ping/HTTP | 结论方向                                                     |
| :-------: | :----------: | :------------: | ------------------------------------------------------------ |
|   fail    |      —       |       —        | 局域网/网关/链路                                             |
|    ok     |     fail     |      fail      | 上行断或防火墙拦外网                                         |
|    ok     |      ok      |      fail      | **DNS 或 hosts 劫持**（优先查 `dns.*` / `hosts.override`）   |
|    ok     |      ok      |       ok       | 基础连通正常；若用户仍打不开站 → Captive/代理/SNI/目标站问题 |

### 5.5「上不了网」专项（MVP-B）

| 检测             | 做法（摘要）                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| Captive Portal   | HTTP 访问生成检测 URL（如连通性检查页），看是否 204/预期 body，或被 302 到门户 |
| 公网 IP / ASN    | HTTPS 查询可信 IP 服务（可配置多源故障转移）+ 可选 ASN 查表                    |
| 代理 / PAC / VPN | 读系统代理与 PAC；检测 utun/常用 VPN 接口与路由                                |
| IPv6             | AAAA、NDP（有特权或平台 API）、ICMPv6 traceroute、双栈对比                     |
| MTU / PMTUD      | 递增/二分探测 DF 包或路径 MTU API；标黑洞                                      |

以上专项结果应回写或挂接到 §5.4.1 对应 `key`（避免两套互不相干的状态）。

### 5.6 站点延迟探针（MVP-A，§12.5）

并发 ICMP（`surge-ping`）+ HTTP（`reqwest`）；流式 `siteSample`；禁 ICMP 时 HTTP 兜底。支持预设库 + **自定义目标**（与 §5.7 共用引擎）。

### 5.7 基础鉴别工具（MVP 强制 · 易漏补齐）

> 急救箱「手工一步」能力；不依赖高级扫描。

| 工具                                | 行为                                                                                                                           | 特权             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `getLocalNetworkSummary`            | 本机 IPv4/IPv6、活动接口、SSID（若有）、网关、DNS 列表                                                                         | 免               |
| `tcpConnect(host, port, timeoutMs)` | **TCP connect 探测**（开发者刚需）；返回成功/超时/拒绝/不可达                                                                  | 免               |
| `probeTarget(nodeId, input)`        | 自定义主机或 URL：ICMP（可选）+ HTTP(S) 状态/TTFB；HTTPS 时可附 **证书过期/主机名不匹配** 轻量结果（完整 MITM 链分析仍属 Adv） | 免               |
| `checkHostsOverrides()`             | 只读解析 hosts，列出覆盖条目（可供体检与单独面板复用）                                                                         | 免               |
| `getFirewallStatus()`               | 系统防火墙只读；不支持则 `unsupported`                                                                                         | 免               |
| `openSystemNetworkSettings()`       | 打开 OS 网络设置页（macOS 网络偏好 / Windows 网络设置）                                                                        | 免（shell/open） |
| `getDefaultRoute()`                 | 只读默认路由与网关（供摘要与 `route.default`）                                                                                 | 免               |

---

## 6. IPC 契约（须同步 `contracts.ts` / `commands.rs` / events）

> 下列为设计契约草图。实现时字段以 Rust `types.rs` + TS DTO 为准，本文不复制完整 struct。
> 所有长任务：`start*` → `ScanSessionId`；事件携带 `sessionId`；`cancelScan(sessionId)` **幂等**。

### 6.1 MVP（A+B）必须实现

```ts
// 能力探测
getNetworkProbeCapabilities(): {
  platform: "macos" | "windows"
  privilegeLevel: "none" | "user" | "admin" | "helper"
  tools: Record<ToolId, "supported" | "degraded" | "unsupported" | "missing_pack">
  packs?: Record<PackId, "installed" | "available" | "unavailable">
  externalTools?: Record<"nmap" | string, "found" | "not_found">
}

listProbeNodes(): ProbeNode[]  // MVP: 至少 local

// 本机摘要 / 路由 / hosts / 防火墙（§5.7）
getLocalNetworkSummary(nodeId?: "local"): LocalNetworkSummary
getDefaultRoute(nodeId?: "local"): DefaultRouteInfo
checkHostsOverrides(): HostsOverride[]
getFirewallStatus(): FirewallStatus  // unsupported 合法
openSystemNetworkSettings(): void

startHealthScan(nodeId, opts?): ScanSessionId
// event network-probe://health-item → HealthCheckItem（key 见 §5.4.1）
cancelScan(sessionId): void

pingHost(nodeId, target, { count, intervalMs }): ScanSessionId
// event network-probe://ping-sample

dnsLookup(nodeId, domain, { rrType, resolver? }): DnsRecord[]

tcpConnect(nodeId, host, port, timeoutMs?): TcpConnectResult

probeTarget(nodeId, input: string /* host|url */): ProbeTargetResult
// 含可选 icmp、http、轻量 tls 摘要

startTraceroute(nodeId, target, { maxTtl? }): ScanSessionId
// event network-probe://hop

startSitesProbe(nodeId, siteIds? | "all"): ScanSessionId
// event network-probe://site-sample

// 「上不了网」
detectCaptivePortal(nodeId): CaptivePortalResult
getPublicIpInfo(nodeId): PublicIpInfo
getProxyVpnStatus(nodeId): ProxyVpnStatus
checkIpv6Stack(nodeId): Ipv6StackResult
probePathMtu(nodeId, target): MtuResult

// 修复（确认策略见 §3.4）
flushDns(): FixResult
switchDns(servers: string[]): FixResult
renewDhcp(iface?: string): FixResult
resetNetworkStack(): FixResult  // 三次确认
```

### 6.2 Post-MVP-C

```ts
startSpeedTest(sourceId): ScanSessionId  // event speed-sample
listSpeedSources(): SpeedSource[]
// Globalping / agent：扩展 listProbeNodes + 复用 ping/traceroute/dns/http 的 nodeId 路由
```

### 6.3 Post-MVP-Adv

```ts
scanPorts(nodeId, target, range, opts): ScanSessionId
scanLan(nodeId, cidr, opts): ScanSessionId
detectArpSpoofing(nodeId): ArpThreat
detectDnsPollution(nodeId, domain, resolvers[]): DnsPollution
checkSsl(domain): SslCert
whois(query): WhoisInfo
startPacketCapture(opts): ScanSessionId  // 统计事件，非全量包落盘默认关
```

事件名进入 `TAURI_EVENTS`；command 进入 `TAURI_COMMAND_CONTRACTS` + `TAURI_COMMANDS` + `TAURI_COMMAND_ARG_KEYS`。

---

## 7. 前端 Feature-sliced 结构

```
src/features/network-probe/
  feature.tsx
  page.tsx
  store.ts
  hooks/useNetworkProbeController.ts
  services/
    network-probe.use-cases.ts
    network-probe.repository.ts
    network-probe.advisor.ts
    network-probe.sites.ts
  components/
    NodeSelector.tsx
    BasicView/{NetworkSummaryHeader,SiteLatencyBoard,HealthTree,ScanOpinion,ComprehensiveScan,QuickTools}.tsx
    AdvancedView/...
    HealthReport.tsx
    TripleDestructiveConfirm.tsx   // 或 shared/common
```

占位阶段仅有 `feature.tsx` + `page.tsx`；其余随实现按需添加（避免空 store 形式主义）。

---

## 8. 性能 / UX 约束

- 长列表 >50：虚拟化（`react-virtuoso` / `@tanstack/react-virtual`）。
- 流式聚合避免整树重渲；selector / `useShallow` 订阅 store。
- 可重复触发动作：`useGuardedAsync` + loading 防重入。
- Effect 注册的 listener / 定时器必须清理。
- 空态 / 失败态 / 断网态完整；能力 `unsupported` 不伪装成功。
- i18n：`networkProbe.*`；禁止硬编码；禁止模块顶层 `t()`。
- **命令透明**：凡可点击探测/修复控件，须满足 §3.5（hover 预告 IPC；运行后写入命令日志或结果附属 `commandHint`）。
- 平台边界：用 `canUseDesktopFeatures` / `canUseTauriCommands`，禁止 JSX 散落 `window.__TAURI__`。

---

## 9. 安全、隐私与依赖护栏

### 9.1 依赖

- 新增 crate 不得破坏 guarded crate（如 `window-vibrancy` / `ed25519-dalek`）；走 `upgrade:safe`。
- 禁止为测速引入 Ookla 专有二进制。

### 9.2 授权与合法使用

- **仅探测用户拥有或已获授权的网络/主机**；UI 首次高级扫描展示授权声明。
- 默认目标：本机、当前子网、用户输入的单一 host；大 CIDR / 公网扫需显式确认。
- **硬红线**：不实现 ARP 攻击、MITM 注入、DoS、密码爆破〔§12.3.2〕。

### 9.3 特权 helper 与签名（D-010 对齐）

- 默认发布为 ad-hoc / unsigned 时：**不得宣称 helper 已获系统信任**；无 notarization 时主路径为「触发式提权」或「无特权降级」，helper 安装向导标明 Gatekeeper 限制。
- helper 只接受本 app 签名/约定信道请求；Unix socket 权限收紧到用户。

### 9.4 第三方配额

| 服务                | 约束                                                     |
| ------------------- | -------------------------------------------------------- |
| Globalping          | 遵守 ToS；匿名额度用尽提示配置 token；失败映射结构化错误 |
| librespeed 公共实例 | 可配置；禁止打爆单一公共源（并发/间隔上限）；鼓励自建    |
| 公网 IP / ASN API   | 多源故障转移；缓存短 TTL；不把 API key 写进前端          |

### 9.5 隐私与落盘

| 数据              | 策略                                                           |
| ----------------- | -------------------------------------------------------------- |
| 体检/站点采样历史 | 本地可关；默认保留条数上限；不含 Cookie/密码                   |
| 抓包              | 默认只统计计数器；原始 pcap 落盘需显式开启且本地路径可选       |
| hosts / 公网 IP   | 可进报告；导出前提示敏感                                       |
| 日志              | 脱敏；禁止把完整包 payload 打进 info 日志                      |
| agent token       | 只存系统安全存储或用户配置加密通道（实现期对齐 Keychain 惯例） |

### 9.6 远程与放大

- remote 通信 TLS；agent 鉴权 + 限速〔§4.4〕。
- 后端拒绝异常高 `rate` / 超大 port range（有默认 cap，可配置但有硬顶）。

### 9.7 可选能力包（Capability Pack · D-017）

> 高级能力可插拔；**不是**运行时下载 Rust crate。细节与产品交互见 [design-security.md §3](./design-security.md)。

| 层                       | 内容                                                                           | 策略                                                                      |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **主包（编译进 Bench）** | MVP A+B：体检、DNS/TCP/ping、站点、上不了网、修复、`trippy-core` traceroute 等 | 打开即用；**禁止**做成「先下载才能用」                                    |
| **本机已有工具**         | 如系统/brew 已装 `nmap`                                                        | 探测路径 → fallback；不强制下载                                           |
| **可选 sidecar**         | SYN/ARP 深度扫描、诊断抓包、正式特权 helper 等                                 | 首次点击 → 安装向导 → 后端按 manifest 下载并校验 hash/签名 → 启用；可卸载 |
| **远程能力**             | Globalping / agent / librespeed                                                | 本机零重库；按账号/源配置                                                 |

**强制约束**

1. Manifest（URL、版本、hash、签名、适用 arch/OS）仅后端持有；renderer 不得提交最终下载 URL 或可执行路径（对齐 app-manager 更新安全）。
2. 能力状态增加 `missing_pack`：`getNetworkProbeCapabilities().tools[id]`；安装成功后刷新矩阵。
3. 安装完成 ≠ 已提权：仍按 §11.4 走 helper / 触发式提权 / 降级；`unsupported`/`degraded` 不伪装成功。
4. 与 D-010：ad-hoc 包必须提示 Gatekeeper 限制，不得宣称 sidecar/helper 已获系统信任。
5. 可选包不得引入攻击能力（§12.3.2）；IPC 仍走统一契约与 `cancelScan` 幂等。

**建议 pack id（实现期可调，勿随意改已发布 id）**

| pack id       | 覆盖能力（示例）                                | 档位         |
| ------------- | ----------------------------------------------- | ------------ |
| `adv-scanner` | SYN 扫描增强、ARP 发现增强、指纹                | Post-MVP-Adv |
| `pcap-diag`   | 诊断级抓包统计 / 可选落盘                       | Post-MVP-Adv |
| `priv-helper` | 正式 `SMAppService` helper（需签名/公证后主推） | Post-MVP-Adv |

本机 `nmap` 不算 pack id，属 `external_tool` 探测项，在 capabilities 中单独标注。

---

## 10. 已决决策（2026-07-22；交付口径修订）

> 方向性条目同步 [DECISIONS.md](../../DECISIONS.md) **D-016**、**D-017**。

1. **入口**：独立一级 feature `network-probe`。
2. **当前不做实现**：占位 feature 仅对齐 `check:docs`；设计先完善。
3. **平台**：macOS 主路径；Windows 标注/降级；**Linux 非目标**（D-014）。
4. **高危修复**：开放 + **三次确认**（§3.4）+ 后端复核。
5. **测速 / 分布式**：设计纳入，**Post-MVP-C**，不进 MVP。
6. **多节点**：设计双路径；**MVP 仅 local**。
7. **Advisor**：基础精简，高级展开依据。
8. **MVP = A + B**：体检（**含 §5.4.1 清单与 DNS/IP 对照**）+ 站点看板 + Advisor + 免特权修复 + traceroute/MTR +「上不了网」五项 + **§5.7 基础鉴别工具**（TCP connect、自定义 URL、摘要/路由/hosts/防火墙只读、打开系统网络设置）。
9. **可选能力包（D-017）**：MVP 主包打开即用；Adv 重能力 / helper / 抓包等按需 sidecar 或本机工具 / 远程；禁止运行时下 crate；见 §9.7。

### 10.1 开放项（实现前可再细化，不阻塞设计评审）

| #   | 项                                                   | 状态                                                                          |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | 默认站点清单定稿（区域包）                           | **草案已收至 [defaults.md §6](./defaults.md)**；实现前可微调，id 稳定后勿乱改 |
| 2   | agent 协议字段级 schema                              | 草图 §4.4，Post-MVP 再冻                                                      |
| 3   | `TripleDestructiveConfirm` 视觉稿                    | 规格 §3.4 已定                                                                |
| 4   | 公网 IP / Captive 检测 URL 最终供应商列表            | **草案已收至 [defaults.md §4–§5](./defaults.md)**；实现期按可用性微调         |
| 5   | trippy 在目标 macOS 真机特权路径                     | spike 编译过；运行时待真机                                                    |
| 6   | Defaults 用户覆盖 UI / `getNetworkProbeDefaults` IPC | 规格见 defaults §1.1 / §11；实现随 MVP                                        |

---

## 11. 调研记录（Remote / 测速 / 特权）

### 11.1 Globalping（Post-MVP-C）

- 免费 REST；五种测量：ping / traceroute / dns / mtr / http。
- **不含带宽测速** → 测速走 §11.3。
- Rust 用 `reqwest` 轮询 status；遵守配额〔§9.4〕。

### 11.2 remote 双路径

- Globalping 代理 + 自有 agent；运行时用户选；对比视图 Post-MVP-C。
- 多节点对比语义见 §4.3（非 §5.3）。

### 11.3 带宽测速（Post-MVP-C）

- **librespeed** 协议；公共/自建可选；与 Globalping 互补。

### 11.4 特权分层（Post-MVP-Adv 为主；traceroute 为 MVP-B 特例）

1. 特权 helper（`SMAppService` macOS 13+）— 需正式签名/公证后才作为默认推荐；可作为可选包 `priv-helper`（D-017）。
2. 触发式管理员授权。
3. `nmap` 外部二进制 fallback（若存在；属本机工具探测，非强制下载）。
4. 按需 sidecar（`adv-scanner` / `pcap-diag`）安装后再走 1–3（D-017）。
5. 无特权 / 无包 → 自动降级或 `missing_pack` / `unsupported`。

**平台**

- **macOS**：主路径。
- **Windows**：Npcap / 能力矩阵降级；不承诺与 mac 对等 SYN/ARP。
- **Linux**：**不支持、不实现、不进 CI**（D-014）。文档中出现的 Linux 能力描述仅作业界对照，**不是产品承诺**。

MVP-B traceroute：主包内 `trippy-core`；有特权走完整路径；无特权明确 `degraded/unsupported`，禁止空跳点表假装成功。

---

## 12. 领域完整性审视

### 12.1 已覆盖（设计已含）

| 层     | 能力                             | 交付档      |
| ------ | -------------------------------- | ----------- |
| L2     | 接口/网关/MAC；ARP 发现/欺骗检测 | MVP-A / Adv |
| L3     | ping、traceroute/MTR、路由异常   | MVP / Adv   |
| L4     | 端口扫描 SYN/connect             | Adv         |
| L7     | DNS、HTTP、SSL、WHOIS、Captive   | MVP / Adv   |
| 性能   | 延迟类；带宽测速                 | MVP / C     |
| 分布式 | Globalping、agent                | C           |

### 12.2 能力与阶段（原「缺失项」已全部入设计）

| #         | 能力                                                        | 交付档          |
| --------- | ----------------------------------------------------------- | --------------- |
| 0         | 固定站点延迟探针                                            | **MVP-A**       |
| 1–5       | IPv6 / Captive / 公网 IP / MTU / 代理·VPN                   | **MVP-B**       |
| B1        | **L0–L3 检查项清单写死** + DNS/IP 对照〔§5.4.1–5.4.2〕      | **MVP-A**       |
| B2        | 本机网络摘要 / 默认路由只读 / hosts 快检 / 防火墙只读       | **MVP-A**       |
| B3        | TCP connect(host:port) / 自定义 URL 探测（含轻量 TLS 摘要） | **MVP-A**       |
| B4        | 打开系统网络设置                                            | **MVP-A**       |
| 6–7, 9–10 | mDNS·SSDP / NAT / NTP / DNSSEC                              | Post-MVP-Adv    |
| 8, 11     | 持续监控 / 报告历史                                         | Post-MVP-Polish |
| —         | 测速 / remote                                               | Post-MVP-C      |
| —         | 完整 SSL MITM / WHOIS / SYN·ARP                             | Post-MVP-Adv    |
| —         | P5–P7 配置·网管·授权漏扫                                    | Vision          |

### 12.3 范围再划分

#### 12.3.1 Vision P5–P7

配置向导、重型抓包、邮件/SNMP/BGP、进程流量、授权 nuclei/amass — 见 roadmap Vision；高危仍三次确认；漏扫仅限授权资产。

#### 12.3.2 硬性红线

不实现：ARP **攻击**、MITM **注入**、**DoS**、密码**爆破**。检测/防御版在 Adv。

### 12.4 结论

- MVP A+B 覆盖急救箱主路径，且 **§5.4.1 / §5.7 把「太基础反而易漏」的鉴别项写成验收清单**。
- 其余设计保留不删；唯一硬红线 = 检测而非攻击。

### 12.5 固定站点延迟探针（MVP-A）

**默认站点**：以 [defaults.md §6](./defaults.md) 为定稿草案（`global` / `cn-friendly` / `dev`）。下文仅保留规格摘要。

用户可增删改；存本地 JSON；首次注入默认包（跟随 UI 语言或设置区）。

规格：ICMP+HTTP 双通道、火花线、阈值、nodeId 路由（MVP 仅 local）、零特权优先。

其余内置资源（推荐 DNS、Captive、公网 IP API、reach 目标、MTU/STUN/NTP）统一见 [defaults.md](./defaults.md)。

---

## 13. 模块边界（与既有功能）

| 现有能力                                                          | Owner（目标态）                      | 迁移策略                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-toolbox` → diagnostics Tab（ping / local IP / wifi）         | **network-probe** 为网络诊断 SSoT    | MVP 落地后：diagnostics Tab **降级为入口跳转**或内嵌「快速 ping」调用 `net_probe` 同一 command；禁止两套 ping 实现长期并存                                                                  |
| `system-settings`：`ping_host` / `get_local_ip` / `get_wifi_info` | 后端逻辑 **迁入或委托** `net_probe`  | 保留旧 command名作薄封装（兼容）一到两个版本，或同步改契约并改前端调用；**禁止**复制算法                                                                                                    |
| `port-manager` Local/Remote                                       | **不变**：本机端口占用、进程树、Kill | network-probe 做**外部目标**端口存活/指纹；Remote 语义不同（port-manager=连通性探测目标 host，network-probe=探测原点 nodeId）。**禁止**共享「Kill」；**禁止**在 network-probe 做 PID 杀进程 |
| `command-center`                                                  | 无关                                 | 用户可用卡片调 `nmap` 等，不替代本模块 UI                                                                                                                                                   |
| Clean Space / Hardware                                            | 无关                                 | —                                                                                                                                                                                           |

**边界测试（实现期）**：同一 host 的「端口是否被本机进程占用」只在 port-manager；「22 是否对网开」在 network-probe。

---

## 14. 能力矩阵

图例：`S`=supported · `D`=degraded · `U`=unsupported · `—`=该 node 无此能力。

### 14.1 MVP（local · macOS 主路径）

| 能力                         | macOS none | macOS admin/helper | Windows none | Windows admin | local | gp/agent |
| ---------------------------- | :--------: | :----------------: | :----------: | :-----------: | :---: | :------: |
| L0–L1 接口/DNS/代理/路由只读 |     S      |         S          |     D/S      |       S       |   S   |    —     |
| hosts 快检 / 防火墙只读      |     S      |         S          |     D/S      |      D/S      |   S   |    —     |
| ping（ICMP）                 |    D/S     |         S          |      D       |      D/S      |   S   |   C 后   |
| DNS lookup                   |     S      |         S          |      S       |       S       |   S   |   C 后   |
| TCP connect(host:port)       |     S      |         S          |      S       |       S       |   S   |   C 后   |
| 自定义 URL / 站点 HTTP 延迟  |     S      |         S          |      S       |       S       |   S   |   C 后   |
| DNS vs IP 对照（体检合成）   |     S      |         S          |      S       |       S       |   S   |    —     |
| Captive / 公网 IP / 代理检测 |     S      |         S          |     D/S      |       S       |   S   |   —/C    |
| IPv6 双栈（免特权部分）      |    D/S     |         S          |      D       |       D       |   S   |    —     |
| MTU 探测                     |    D/S     |         S          |      D       |       D       |   S   |    —     |
| traceroute/MTR               |    U/D     |         S          |     U/D      |       D       |   S   |   C 后   |
| 打开系统网络设置             |     S      |         S          |      S       |       S       |   S   |    —     |
| flush/switch DNS 等修复      |    D/S     |         S          |     U/D      |       D       |   S   |    —     |

> Windows 列在实现前保持诚实 `D/U`；不得在未验收时标 `S`（对齐 D-012 能力语义）。

### 14.2 Post-MVP

| 能力                        |           无特权            |        有特权         |   Globalping    |  agent   |
| --------------------------- | :-------------------------: | :-------------------: | :-------------: | :------: |
| 带宽测速                    |       S（librespeed）       |           S           | U（API 无测速） | 可选自建 |
| GP ping/dns/http/traceroute |              —              |           —           |   S（额度内）   |    —     |
| SYN 扫描                    | D→connect 或 `missing_pack` |    S（pack+特权）     |        U        | 视 agent |
| ARP 发现                    | D→ping 扫 或 `missing_pack` |    S（pack+特权）     |        U        | 视 agent |
| 抓包统计                    |     U / `missing_pack`      | S（`pcap-diag`+特权） |        U        | 视 agent |
| 污染/SSL/WHOIS              |           部分 S            |           S           |      部分       | 视 agent |

前端必须消费 `getNetworkProbeCapabilities()`，按矩阵灰显/降级文案，禁止硬编码「全绿」。

---

## 15. 修改检查表

改本模块前自检：

- [ ] **可选能力包 §9.7 / D-017**：未把 MVP 工具改成下载项；Adv 走 pack/`missing_pack`；下载 URL/hash 仅后端 manifest；安装≠提权。
- [ ] Health 扫描覆盖 §5.4.1 全部 key（不可探测项用 `skip`）；含 §5.4.2 DNS/IP 对照合成结论。
- [ ] **Defaults [defaults.md](./defaults.md)**：内置 DNS/Captive/公网 IP/站点包可加载；多源故障转移；用户可覆盖可重置；场景不依赖手工填 URL。
- [ ] §5.7 基础工具（TCP connect、自定义探测、摘要、hosts、防火墙只读、打开系统设置）已实现或显式 unsupported。
- [ ] **命令透明 §3.5**：关键操作有 hover IPC 提示；运行后有可复制/可浏览的命令日志或 `commandHint`。
- [ ] 未违反 ARCHITECTURE §2（尤其禁止组件直调 `invoke`、散装错误判断、顶层 `t()`）。
- [ ] 新 command / event 已进 contracts + Rust handler + TS typed wrapper + DTO。
- [ ] `cancelScan` 幂等；扫描有防重入；listener 可清理。
- [ ] 能力状态走矩阵；`unsupported`/`degraded` 不伪装成功。
- [ ] 高危修复确认步数符合 §3.4；后端有复核。
- [ ] 未越过 §13 边界（尤其 port-manager Kill、双份 ping）。
- [ ] 未实现 §12.3.2 攻击能力。
- [ ] 依赖变更不破坏 guarded crate。
- [ ] 文档：roadmap 勾选/移除与代码一致；方向性取舍回写 DECISIONS。
- [ ] 验证：`pnpm run lint:fe`、`pnpm run test:critical`；有 Rust 时 `cargo clippy -- -D warnings`。

---

## 16. 相关文档

- [design-basic.md](./design-basic.md) · [design-test.md](./design-test.md) · [design-security.md](./design-security.md) · [design-discover.md](./design-discover.md) — L1 分册
- [scenarios.md](./scenarios.md) — 场景用例索引与覆盖矩阵
- [defaults.md](./defaults.md) — 默认资源目录（DNS / Captive / 公网 IP / 站点包）
- [roadmap.md](./roadmap.md) — MVP / Post-MVP / Vision backlog
- [knowledge-graph.md](./knowledge-graph.md) — Mermaid 总览
- [DECISIONS.md D-016](../../DECISIONS.md) · [D-017](../../DECISIONS.md) — 分期与可选能力包
- [port-manager design](../port-manager/design.md) — 端口占用边界对照
