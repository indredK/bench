# Network Probe · L1「基础视角」技术设计（macOS）

> **范围**：急救箱主路径——看懂网络是否健康、给建议、能修。
> **父文档**：[design.md](./design.md)（全局架构 / IPC 总表 / 护栏）。本文只写本 Tab 的实现级细节。
> **平台**：macOS 14+ 主路径（D-014 / D-016）。Windows 仅按 [design §14](./design.md) 降级，不在本文展开。
> **交付档**：MVP-A + MVP-B「上不了网」；修复含高危三次确认。
> **D-017**：本 Tab 全部属**主包必含**，禁止做成「点击后下载组件才能用」。
> **Defaults**：推荐 DNS / Captive / 公网 IP / 站点包见 [defaults.md](./defaults.md)。

---

## 1. 用户心智与 L2 清单

| L2 id      | 面板     | 用户问题           | 交付    |
| ---------- | -------- | ------------------ | ------- |
| `overview` | 概览     | 本机现在什么状态？ | MVP-A   |
| `tree`     | 一键体检 | 分层哪里坏了？     | MVP-A   |
| `opinion`  | 扫描意见 | 我该先做什么？     | MVP-A   |
| `offline`  | 上不了网 | 为什么上不了网？   | MVP-B   |
| `fix`      | 一键修复 | 能自愈吗？         | MVP-A/B |
| `report`   | 报告     | 怎么留证/分享？    | MVP-A   |

> **站点延迟**已提升为独立 L1（`sites`：常用官网卡片 + 区域站点包），不再挂在基础视角下。

导航记忆：`nav.l1Id = basic` + `l2ByL1.basic` + `offlineSub`（见 design §3.1）。

---

## 2. 架构落点

```text
components/BasicView/
  NetworkSummaryHeader.tsx   # overview
  HealthTree.tsx             # tree
  ScanOpinion.tsx            # opinion
  SiteLatencyBoard.tsx       # sites
  OfflineSuite.tsx           # offline + 子路由
  QuickFixPanel.tsx          # fix
  HealthReport.tsx           # report（可上提 shared）

src-tauri/src/net_probe/
  summary.rs      # LocalNetworkSummary / DefaultRoute / hosts / firewall
  health.rs       # L0→L3 编排 + CancellationToken
  advisor_rules.rs
  sites_probe.rs
  offline.rs      # captive / egress / proxy-vpn / ipv6 / mtu
  fix.rs          # flushDns / switchDns / renewDhcp / resetNetworkStack
```

数据流（强制）：

```text
UI → controller → use-case → repository → typed IPC → net_probe::*
长任务：start* → ScanSessionId → Tauri event(sessionId) → store 增量合并
```

禁止：组件直调 `invoke`；store 内编排；散装错误判断。

---

## 3. macOS 平台实现细则

### 3.1 本机摘要（`getLocalNetworkSummary` / `getDefaultRoute`）

| 数据                    | 推荐路径                                                              | 备选 / 注意                                                                                  |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 接口 up/down、地址、MAC | `netdev` + `if-addrs`                                                 | 不解析 `ifconfig` 人类表格（coding-standards §7.4）                                          |
| 默认路由 / 网关         | `netdev` 路由表或 `SCDynamicStore` / `route get default` 结构化解析   | 优先库；子进程须固定 locale、timeout、输出上限                                               |
| DNS 服务器              | `system-configuration` crate → `SCDynamicStoreCopyValue` / DNS entity | 对齐 `scutil --dns` 语义；取**当前生效** resolver，非仅「网络服务」配置页                    |
| 系统代理 / PAC          | `SCDynamicStore` Proxies 字典（HTTP/HTTPS/SOCKS/PAC URL）             | 对齐 `scutil --proxy`；企业 VPN 下勿只信 System Settings UI                                  |
| 活动接口排序            | `scutil --nwi` 等价信息（Primary + REACH）                            | VPN `utun*` 可能抢主键；摘要须同时列出 primary + 隧道                                        |
| Wi‑Fi SSID / 信号       | CoreWLAN（`CWInterface`）或既有 `get_wifi_info` 迁入                  | **macOS Local Network / Wi‑Fi 隐私**：首次可能弹授权；失败标 `partial`/`unsupported`，不伪装 |
| hosts                   | 只读 `/etc/hosts`                                                     | 解析异常行记 warn；**不自动改写**                                                            |

参考实践：

- Apple [System Configuration](https://developer.apple.com/documentation/systemconfiguration) / Dynamic Store（与 `scutil --dns|--proxy|--nwi` 同源）。
- 业界教训（lima 等）：勿用 `system_profiler` 代替 SC；VPN 全隧道时「设置页里的服务」≠ 真实出站路径。

### 3.2 防火墙只读（`getFirewallStatus`）

复用既有路径（`system_settings/network.rs`）：

```text
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
→ state = 0|1|2
```

约定：

- **只读**进入 network-probe；开关防火墙仍属 `system-settings`。
- 解析失败 → `status: unsupported` + 原因，禁止伪造成功。
- 后续可共享同一 helper，禁止复制两套解析逻辑。

### 3.3 打开系统网络设置（`openSystemNetworkSettings`）

```text
open "x-apple.systempreferences:com.apple.Network-Settings.extension"
```

（旧系统回退 `open /System/Library/PreferencePanes/Network.prefPane`。）经 `platform/shell` / Tauri `shell` 打开；不得拼用户可控字符串进 shell。

### 3.4 Ping / 站点 ICMP（体检 L3 + sites）

macOS 允许非 root 使用 `SOCK_DGRAM` + `IPPROTO_ICMP`（与系统 `ping(8)` / Apple SimplePing 一致）。

| 层      | 选型                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 库      | `surge-ping`（先 DGRAM，失败再 RAW）                                                                                   |
| 兜底    | ICMP 被 Local Network 隐私拦截时 → HTTP(S) TTFB（sites / `probeTarget`）                                               |
| 权限 UX | 探测局域网失败且错误像「无路由/超时」时，提示检查 **系统设置 → 隐私与安全性 → 本地网络**（对标 Wave 等桌面端真机结论） |

### 3.5 综合体检编排（`health.rs`）

严格覆盖 [design §5.4.1](./design.md) 全部 `key`；不可探测项 `skip`。

```text
并行组建议（MVP）：
  G1: link.* + addr.* + route.default + dns.servers + dns.fake_ip + hosts + proxy + vpn + firewall
  G2: reach.gateway ∥ reach.public_ip ∥ reach.public_name
  G3: captive ∥ public_egress ∥ mtu（可用户取消）
合成: diff.dns_vs_ip ← G2 结果（§5.4.2）
结束: advisor_rules.analyze(items)
```

- Fake-IP（`dns.fake_ip`）：系统 `getaddrinfo` / TUN 落在 `198.18.0.0/15` 时 warn；`reach.public_name` 跳过 ICMP。
- 流式：`network-probe://health-item`，每项含 `key/status/evidence/commandHint`。
- `CancellationToken`：取消后不再 emit；`cancelScan` 幂等。
- 阻塞 I/O：`spawn_blocking` 或独立 tokio 任务，不堵 IPC async 主路径。

### 3.6「上不了网」专项（`offline.rs`）

| 子页      | 算法（macOS）                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Captive   | HTTP GET Apple/Google 连通性 URL（多源故障转移）；期望 204/固定 body；302→门户则 `captive=true` + portal URL |
| 代理/VPN  | SC Proxies + 枚举 `utun*`/`ipsec*` + 默认路由是否经隧道                                                      |
| IPv6      | 本机 AAAA、解析 AAAA、HTTP over IPv6（可选）；NDP/ICMPv6 traceroute 有特权再加深，否则 `partial`             |
| MTU       | 对固定目标做 DF 二分 / 递增；黑洞标 `blackhole`；与「测试」共用 `probePathMtu`                               |
| 公网出口  | HTTPS 多源 IP API + 可选 ASN；短 TTL 缓存；密钥不进前端                                                      |
| DNS vs IP | 复用体检合成表，不另造结论语义                                                                               |

双入口：`MtuPanel` / `EgressPanel` 与 L1「测试」共享组件；仅导航来源不同（prototype 方案 A）。

### 3.7 修复（`fix.rs`）

| 命令                | macOS 实现要点                                                                                               | 确认          |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| `flushDns`          | `dscacheutil -flushcache` + `killall -HUP mDNSResponder`（需相应权限）                                       | 单次          |
| `switchDns`         | `networksetup -setdnsservers <service> ...`；服务名来自后端枚举，**禁止**前端传任意 service 字符串当最终依据 | ≥两步         |
| `renewDhcp`         | `ipconfig set <iface> DHCP` 或 `networksetup -setdhcp`；iface 白名单 = 当前活动接口                          | ≥两步         |
| `resetNetworkStack` | 组合：刷新 DNS + 重建网络服务顺序等；影响大                                                                  | **三步** §3.4 |

后端复核（强制）：收到修复请求后重新读取当前状态；拒绝「前端已确认」标志；参数白名单；幂等（重复 flush 成功）。

对齐 D-010：ad-hoc 签名下不得宣称 helper 已获系统信任；无公证时主路径为触发式提权或降级提示。

---

## 4. IPC / Events（本 Tab 消费）

见 [design §6.1](./design.md)。本 Tab 核心：

| 类型    | 名称                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| sync    | `getLocalNetworkSummary` `getDefaultRoute` `checkHostsOverrides` `getFirewallStatus` `openSystemNetworkSettings` |
| sync    | `detectCaptivePortal` `getPublicIpInfo` `getProxyVpnStatus` `checkIpv6Stack` `probePathMtu`                      |
| sync    | `flushDns` `switchDns` `renewDhcp` `resetNetworkStack`                                                           |
| session | `startHealthScan` / `startSitesProbe` + `cancelScan`                                                             |
| event   | `network-probe://health-item` `network-probe://site-sample`                                                      |

Tauri v2：事件名进 `TAURI_EVENTS`；payload 必带 `sessionId`；前端只合并当前 session。

---

## 5. 前端状态与 UX

| Store 域      | 内容                           |
| ------------- | ------------------------------ |
| `summary`     | 最近一次本机摘要               |
| `healthByKey` | `Record<key, HealthCheckItem>` |
| `advice`      | Advisor 输出（精简可操作）     |
| `sites`       | 站点采样序列（火花线）         |
| `offline`     | 各专项结果                     |
| `lastReport`  | 导出缓存                       |

UX 强制：

- 命令透明（design §3.5）：hover 显示 IPC；日志抽屉；体检行 `commandHint`。
- 空/加载/失败/unsupported 四态齐全。
- 防重入：`useGuardedAsync`；切换 L2 不取消后台 session，除非用户点停止。
- i18n：`networkProbe.basic.*`；command 名不翻译。

Advisor：前端 `network-probe.advisor.ts` 与后端 `advisor_rules.rs` **共享规则 ID**；基础视角只展示可操作建议，依据进展开区。

---

## 6. 与既有模块边界

| 能力                        | Owner                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| ping / local IP / wifi 只读 | 最终迁入或委托 `net_probe`；`system-settings` / `dev-toolbox` diagnostics 薄封装或跳转（design §13） |
| 防火墙开关                  | `system-settings`                                                                                    |
| 本机端口占用 / Kill         | `port-manager`（本 Tab 不做）                                                                        |

---

## 7. 安全与隐私

- 报告导出前提示可能含公网 IP / hosts / SSID。
- 历史条数上限；默认不含 Cookie。
- 修复命令审计：后端记结构化日志（iface、DNS 列表），脱敏。

---

## 8. 验收清单（本 Tab）

- [ ] §5.4.1 全部 key 有结果或诚实 `skip`
- [ ] §5.4.2 DNS vs IP 合成结论可机读
- [ ] §5.7 摘要 / hosts / 防火墙只读 / 打开设置可用
- [ ] 站点探针 ICMP+HTTP 双通道 + 火花线
- [ ] 上不了网五项 + 与测试双入口不双实现
- [x] 高危修复三次确认 + 后端复核
- [ ] 能力矩阵驱动灰显；无特权不伪装 traceroute 成功（traceroute 属测试 Tab，但体检不假填跳点）
- [ ] `lint:fe` / `test:critical`；相关 Rust 测试通过

---

## 9. 参考

- [design.md](./design.md) §3 / §5.4–5.7 / §6.1 / §14
- Apple System Configuration · CoreWLAN · Application Firewall `socketfilterfw`
- Trippy / surge-ping 特权模型（ICMP DGRAM）
- NETworkManager：工具分面板 + 统一配置，但 **检测与破坏性操作分权**（本模块修复另走确认态）
