# Network Probe · L1「测试」技术设计（macOS）

> **范围**：对**用户指定目标**做主动探测——通不通、解析怎样、路径怎么走、出口/MTU 如何。
> **父文档**：[design.md](./design.md)。
> **平台**：macOS 14+ 主路径。
> **交付档**：Ping/DNS/TCP/自定义/Traceroute/MTU/公网出口 = MVP；带宽测速 = Post-MVP-C。

---

## 1. 用户心智与 L2 清单

| L2 id        | 面板             | IPC（主）                          | 交付                                        |
| ------------ | ---------------- | ---------------------------------- | ------------------------------------------- |
| `ping`       | Ping             | `pingHost` → `ping-sample`         | MVP                                         |
| `dns`        | DNS 查询         | `dnsLookup`                        | MVP                                         |
| `tcp`        | TCP 连通         | `tcpConnect`                       | MVP                                         |
| `custom`     | 自定义目标       | `probeTarget`                      | MVP                                         |
| `traceroute` | Traceroute / MTR | `startTraceroute` → `hop`          | MVP-B（**主包** `trippy-core`，不做下载墙） |
| `mtu`        | MTU              | `probePathMtu`（与上不了网双入口） | MVP-B                                       |
| `egress`     | 公网出口         | `getPublicIpInfo`（双入口）        | MVP-B                                       |
| `speed`      | 带宽测速         | `startSpeedTest`                   | Post-MVP-C                                  |

心智对照：基础视角回答「整机健康」；本 Tab 回答「**这个目标**怎样」。

---

## 2. 架构落点

```text
components/TestView/
  PingPanel.tsx
  DnsLookupPanel.tsx
  TcpConnectPanel.tsx
  ProbeTargetPanel.tsx
  TraceroutePanel.tsx
  MtuPanel.tsx          # 与 BasicView/OfflineSuite 共用
  EgressPanel.tsx       # 同上
  SpeedTestPanel.tsx    # Post-MVP

src-tauri/src/net_probe/
  ping.rs
  dns.rs
  tcp.rs          # 或 tools.rs
  probe_target.rs
  traceroute.rs   # trippy-core
  mtu.rs
  egress.rs
  speed.rs        # Post-MVP · librespeed
```

共享引擎：站点延迟（基础）与 `probeTarget` / `pingHost` **同一 ICMP+HTTP 实现**，禁止三套 ping。

---

## 3. macOS 实现细则

### 3.1 Ping（`pingHost`）

| 项     | 约定                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 库     | `surge-ping`                                                                  |
| 套接字 | 非 root：`SOCK_DGRAM`/`IPPROTO_ICMP`（Apple 惯例）；root：可 RAW              |
| 输出   | 每包 RTT + 结束汇总（min/avg/max/stddev/loss%）                               |
| 流式   | `network-probe://ping-sample`；`count`/`intervalMs` 有硬顶（防打爆）          |
| 校验   | host 禁止 shell 元字符（对齐现有 `validate_host`）；拒绝空、过长、以 `-` 开头 |
| 降级   | ICMP 不可用 → 返回 `degraded` 并建议改用 TCP/HTTP；UI 不显示假 0ms            |

真机注意：macOS **本地网络**隐私权限会影响 LAN ping；能力矩阵标 `D/S`，UI 给设置跳转文案。

### 3.2 DNS（`dnsLookup`）

| 项   | 约定                                                                                        |
| ---- | ------------------------------------------------------------------------------------------- |
| 库   | **`hickory-resolver`**（非笼统 `hickory-dns`）                                              |
| 能力 | A / AAAA / CNAME / MX / TXT；可选指定 resolver IP                                           |
| 对比 | UI 可一键「系统 DNS vs 1.1.1.1 vs 8.8.8.8」（为安全 Tab 污染检测铺路，本 Tab 只做手工对照） |
| 超时 | 每 resolver 独立 timeout；部分失败返回 partial records + 错误码                             |

系统默认 resolver 读取与基础视角同源（SC Dynamic Store），保证「系统 DNS」语义一致。

### 3.3 TCP Connect（`tcpConnect`）

开发者刚需；零特权。

```text
Tokio TcpStream::connect 带 timeout
→ ok | timeout | refused | unreachable | dns_failed
```

- 默认 timeout 3s（可配，硬顶 ≤30s）。
- 仅 TCP；不做 banner grab（指纹属安全 Tab Post-MVP）。
- 与 `port-manager` Remote「端口是否开」语义接近，但 owner 是 network-probe 的**外部探测**；不暴露 Kill。

### 3.4 自定义目标（`probeTarget`）

输入：hostname / IPv4 / IPv6 / `http(s)://...`

流水线：

1. 规范化 URL / host（拒绝 file://、危险 scheme）。
2. 可选 ICMP（同 ping 引擎）。
3. HTTP(S)：`reqwest` + `rustls`；记录状态码、TTFB、重定向终局。
4. HTTPS 轻量 TLS：证书 notAfter、subject/SAN 与 host 是否匹配；**完整 MITM 链分析留给安全 Tab**。

### 3.5 Traceroute / MTR（`startTraceroute`）

**不自研**。采用 [`trippy-core`](https://docs.rs/trippy-core)：

| 项       | macOS 约定                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 特权探测 | `trippy_privilege::Privilege::discover()`                                                                                                  |
| 无特权   | `PrivilegeMode::Unprivileged`（macOS 对 ICMP 通常 `needs_privileges=false`，见 [Trippy Privileges](https://trippy.rs/guides/privileges/)） |
| 协议     | 默认 ICMP；可选 UDP/TCP（高级选项，MVP 可先 ICMP）                                                                                         |
| 流式     | 每 hop：ttl、addrs、rtt、loss%、可选 ASN                                                                                                   |
| 失败诚实 | 无能力时 `unsupported`/`degraded`，**禁止空跳点表假装成功**（design §11.4）                                                                |
| 取消     | `cancelScan`；trippy 侧停止 round                                                                                                          |

后端模块：`traceroute.rs` 把 trippy round 回调映射为 Tauri event。ASN 可用 Team Cymru DNS/HTTP（缓存 + 失败可空）。

### 3.6 MTU / 公网出口（双入口）

与 [design-basic.md](./design-basic.md) §3.6 同一实现：

- `probePathMtu(nodeId, target)`：DF 二分；记录 first-fail size。
- `getPublicIpInfo(nodeId)`：多源 HTTPS；可选 ASN。

UI：测试入口与「上不了网」入口共用面板组件；面包屑标明来源。

### 3.7 带宽测速（Post-MVP-C）

| 项         | 约定                                                  |
| ---------- | ----------------------------------------------------- |
| 协议       | **librespeed**（开源）；禁止捆绑 Ookla 专有二进制     |
| 源         | 公共实例可配 + 鼓励自建；并发/间隔硬顶（design §9.4） |
| 事件       | `speed-sample`：下行/上行/jitter 进度                 |
| Globalping | **无带宽 API** → 测速与 GP 分离（design §11.1）       |

---

## 4. IPC / Events

| 命令              | 会话？     | Event                          |
| ----------------- | ---------- | ------------------------------ |
| `pingHost`        | 是         | `network-probe://ping-sample`  |
| `dnsLookup`       | 否         | —                              |
| `tcpConnect`      | 否         | —                              |
| `probeTarget`     | 否（短）   | —                              |
| `startTraceroute` | 是         | `network-probe://hop`          |
| `probePathMtu`    | 否或短会话 | —                              |
| `getPublicIpInfo` | 否         | —                              |
| `startSpeedTest`  | 是 · Post  | `network-probe://speed-sample` |
| `cancelScan`      | —          | 幂等                           |

`nodeId`：MVP 仅 `local`；选中 remote 时灰显或提示后续版本（勿假连接）。

---

## 5. 前端 UX

- 目标输入：最近 N 条历史（本地，脱敏）；一键填 `1.1.1.1` / `cloudflare.com`。
- 结果区下方固定 `CommandHint` + 写入命令日志。
- Ping/Traceroute：实时表 + 停止按钮；离开面板**不**自动 clear 结果（导航记忆 §3.1）。
- 长跳点表 >50：虚拟化（Polish 可延后，但接口预留）。
- 测速面板标 `Post`，不进 MVP 验收。

Store 建议：`testResults: { ping?, dns?, tcp?, custom?, traceroute?, mtu?, egress?, speed? }`，按工具分槽，互不覆盖。

---

## 6. 护栏

| 风险              | 措施                                                           |
| ----------------- | -------------------------------------------------------------- |
| 对公网高频 ping   | `count`/`interval` 硬顶；默认 count≤10                         |
| SSRF 式自定义 URL | 禁止 link-local / 云元数据地址（除非用户显式确认本机诊断模式） |
| traceroute 滥用   | 单目标；maxTtl 硬顶；无 CIDR 扫                                |
| 测速打爆公共源    | 源级 QPS；失败冷却                                             |

---

## 7. 验收清单（本 Tab）

- [ ] Ping 流式 RTT/抖动/丢包；ICMP 失败有 HTTP/TCP 引导
- [ ] DNS 多类型 + 指定 resolver
- [ ] TCP connect 四态结果清晰
- [ ] `probeTarget` 支持 host/URL + 轻量 TLS 摘要
- [ ] Traceroute 基于 `trippy-core`；特权不足诚实降级
- [ ] MTU/出口与基础视角双入口单实现
- [ ] 输入校验与速率硬顶
- [ ] 契约进 `contracts.ts`；事件带 `sessionId`

---

## 8. 参考

- [surge-ping](https://crates.io/crates/surge-ping) · [hickory-resolver](https://docs.rs/hickory-resolver) · [trippy-core](https://docs.rs/trippy-core) / [Privileges](https://trippy.rs/guides/privileges/)
- Apple SimplePing（非特权 ICMP DGRAM）
- NETworkManager：Ping Monitor / Traceroute / DNS Lookup 分工具页——本 Tab 对齐该信息架构
- librespeed 协议（Post-MVP 测速）
