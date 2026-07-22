# Network Probe · L1「发现」技术设计（macOS）

> **范围**：周围有什么设备/服务、NAT/时间环境怎样、从哪几个节点测。
> **父文档**：[design.md](./design.md) §4 / §5.2 / §11。
> **平台**：macOS 14+。
> **交付档**：**整 Tab 默认 Post-MVP**（ARP/局域网服务/NAT/NTP = Adv；多节点 = C）。MVP 仅保留 L1 入口与能力灰显。

---

## 1. 用户心智与 L2 清单

| L2 id     | 面板       | 主能力                          | 交付         |
| --------- | ---------- | ------------------------------- | ------------ |
| `arp`     | ARP 发现   | 局域网主机表 + ARP 欺骗迹象入口 | Post-MVP-Adv |
| `lan-svc` | 局域网服务 | mDNS/DNS-SD、SSDP/UPnP 浏览     | Post-MVP-Adv |
| `nat`     | NAT 类型   | STUN 分类                       | Post-MVP-Adv |
| `ntp`     | NTP 时间   | 偏移与可达性                    | Post-MVP-Adv |
| `nodes`   | 多节点对比 | local + Globalping / agent      | Post-MVP-C   |

与「安全」分工：安全偏**威胁与暴露**；发现偏**拓扑与环境属性**。ARP 欺骗检测算法可两边复用同一 backend，UI 入口可双链。

---

## 2. 架构落点

```text
components/DiscoverView/
  LanDiscoveryPanel.tsx
  LanServicePanel.tsx
  NatPanel.tsx
  TimePanel.tsx
  MultiNodeCompare.tsx
  NodeSelector.tsx          # 壳层亦可挂 page 级

src-tauri/src/net_probe/
  host_discovery.rs         # ARP / ping-sweep 降级
  lan_services.rs           # mDNS / SSDP
  nat.rs                    # STUN
  ntp.rs
  node.rs                   # local | remote-proxy | remote-agent 路由
  remote/
    globalping.rs
    agent_client.rs
```

壳层 `nodeId`：所有探测 command 第一参；本 Tab 的「多节点对比」是 **结果并排消费方**，不另造第二套引擎。

---

## 3. macOS 实现细则

### 3.1 ARP / 局域网发现（`scanLan`）

| 模式           | 条件            | 行为                                                         |
| -------------- | --------------- | ------------------------------------------------------------ |
| ARP Request 扫 | 有 RAW/BPF 特权 | 对本机 CIDR（默认当前接口前缀，常 `/24`）发请求；收集 MAC↔IP |
| 降级           | 无特权          | ICMP/TCP ping 扫常见主机位；标 `degraded`                    |
| 增强           | 可选            | 对存活主机做 rDNS（`hickory` PTR）                           |

护栏：

- 默认 CIDR = 活动接口前缀；禁止无确认扫 `/16` 及以上（硬顶可配但有上限）。
- 速率限制；`cancelScan` 幂等。
- **不做** ARP 投毒；欺骗检测只读网关 MAC 漂移（与安全 Tab 共用 `detectArpSpoofing`）。

macOS 注意：

- **本地网络**隐私权限；未授权时 LAN 发现大量失败 → UI 引导系统设置。
- Wi‑Fi 客户端隔离（宾客网络）会导致「扫不到邻居」——结果空要区分「真无设备」vs「隔离/权限」。

库：`pnet` / `socket2`；邻居表可读 `netdev` 或系统 ARP 缓存作补全（缓存≠完整发现）。

### 3.2 局域网服务（mDNS / SSDP）

| 协议          | macOS 路径                                                                            | 产出                                                    |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| mDNS / DNS-SD | Bonjour：`dns_sd` API 或成熟 crate（如 `mdns-sd`）浏览 `_services._dns-sd._udp.local` | 服务名、类型、端口、TXT                                 |
| SSDP / UPnP   | UDP 1900 M-SEARCH；解析 `LOCATION` 后 HTTP GET device desc（限长）                    | 设备类型、友微名、控制 URL（只展示，不调用危险 action） |

护栏：

- 不自动调用 UPnP `AddPortMapping` 等写操作。
- 浏览器式超时；同一 UUID 去重。
- 结果虚拟化（设备可能很多）。

### 3.3 NAT 类型（STUN）

| 项     | 约定                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- |
| 协议   | STUN Binding（RFC 8489）；多服务器对照                                                            |
| 分类   | 至少：Open / Full Cone / Restricted / Port-Restricted / Symmetric / UDP Blocked（映射到产品文案） |
| 实现   | 轻量 STUN client（评估 `hightower-stun` 或自研最小 Binding）；**不必**引入完整 ICE/TURN 栈        |
| 服务器 | 可配列表（Google STUN 等公共源）；失败转移；遵守配额                                              |

与「公网出口」区别：出口要的是 **IP/ASN**；NAT 要的是 **映射行为**。可共用一次 Binding 的 XOR-MAPPED-ADDRESS 作出口候选，但 UI 分面板。

### 3.4 NTP 时间

| 项       | 约定                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| 查询     | 标准 NTP（UDP 123）或 SNTP；多源中位数                                          |
| 输出     | offset_ms、rtt、stratum、是否超出阈值（如 >500ms warn，>2s high）               |
| 系统对照 | 可读系统时钟；**不**在本模块强制改系统时间（改时间属系统设置/需提权，避免越权） |

macOS `sntp` / `ntpq` 可作调试对照，产品路径优先纯 Rust，避免解析本地化输出。

### 3.5 多节点对比（Post-MVP-C）

#### 节点模型

```ts
type ProbeNode = {
  id: "local" | string
  kind: "local" | "remote-agent" | "remote-proxy"
  label: string
  reachable: boolean
  endpoint?: string
  region?: string
  capabilities?: string[]
}
```

#### Globalping（`remote-proxy`）

| 项   | 约定                                                      |
| ---- | --------------------------------------------------------- |
| 传输 | HTTPS REST；Rust `reqwest` 创建 measurement + 轮询 status |
| 能力 | ping / traceroute / dns / mtr / http（**无带宽**）        |
| 配额 | 匿名额度用尽 → 提示配置 token；错误映射 `AppError`        |
| ToS  | 遵守官方限额；前端展示剩余额度（若 API 提供）             |

#### 自有 agent（`remote-agent`）

见 design §4.4 摘要落地：

| 项   | 约定                                                      |
| ---- | --------------------------------------------------------- |
| 传输 | HTTPS 或 WSS；禁止明文                                    |
| 鉴权 | 每 agent token 或 mTLS；HMAC(timestamp+body)              |
| 方法 | 白名单 tool id；**拒绝任意 shell**                        |
| 限速 | 每 token QPS/并发；超限 → 429 语义                        |
| SSRF | agent 拒绝被指使打云元数据/未声明目标                     |
| 发现 | **手动**添加 endpoint；不做局域网自动扩散（防变僵尸网络） |
| 密钥 | Keychain / 系统安全存储；不进前端持久化明文               |

#### 对比视图

```text
同一 (tool, target) → store.byNode[nodeId] = Result
UI：表格列 = 节点；行 = 指标（RTT、DNS 答案、hop 差异）
例：本机 DNS 正常、探点 A 污染 → 结论导向「链路/污染在途中」
```

MVP：`listProbeNodes()` 至少返回 `local`；远程 kind 在类型中预留，UI 选中时提示「后续版本」。

---

## 4. IPC

```ts
// Adv
scanLan(nodeId, cidr, opts): ScanSessionId
// event network-probe://lan-host

browseLanServices(nodeId, opts): ScanSessionId
// event network-probe://lan-service

detectNatType(nodeId): NatTypeResult
checkNtpOffset(nodeId, servers?): NtpResult

// C
listProbeNodes(): ProbeNode[]
// ping/dns/http/traceroute 等复用既有 command + nodeId 路由
```

`node.rs` 路由表：

| kind           | 行为              |
| -------------- | ----------------- |
| `local`        | 本机执行          |
| `remote-proxy` | Globalping 适配器 |
| `remote-agent` | agent HTTP 客户端 |

未知 `nodeId` → `INVALID_INPUT`；remote 未配置 → `UNSUPPORTED`（诚实）。

---

## 5. UX

- ARP/服务扫描：进度条 + 已发现计数；空态文案区分权限/隔离/真静网。
- 多节点：先选 tool + target，再勾选节点并跑；部分节点失败不阻断整表。
- 命令透明：remote 路径标注 `via globalping|agent`。
- Post / C badge 与 roadmap 档位一致。

---

## 6. 安全与合规

- 局域网扫描默认私网；公网 CIDR 拒绝或强确认。
- agent 与 Globalping 流量仅测量结果 JSON；不中继用户任意 TCP 成开放代理。
- 发现类数据可进报告；导出提示内网拓扑敏感。
- **D-017**：ARP/深度发现若依赖 `adv-scanner`，走与安全 Tab 同一 `PackInstallDialog`；mDNS/STUN/NTP 优先主包轻量实现，不默认拆成下载项。

---

## 7. 验收清单（按档）

**Adv**

- [ ] ARP 有特权路径 + ping 降级；CIDR 硬顶
- [ ] 需要 pack 时正确返回 `missing_pack` 并完成安装校验流（D-017）
- [ ] mDNS/SSDP 只读浏览；无 UPnP 写操作
- [ ] STUN NAT 分类 + 多源故障转移
- [ ] NTP offset 阈值；不擅自改系统钟

**C**

- [ ] `listProbeNodes` + Globalping 至少一种测量端到端
- [ ] agent 鉴权/限速/拒绝 shell 有测试
- [ ] `store.byNode` 对比视图；单节点失败可诊断
- [ ] 远程能力不要求本机 Adv pack（本机零重库）

---

## 8. 参考

- [design.md](./design.md) §4 多节点 · §5.2 ARP · §11 Globalping
- Globalping API · librespeed（测速在测试 Tab，不在此重复）
- RFC 8489 STUN · Bonjour / DNS-SD · UPnP 设备发现（只读）
- NETworkManager IP Scanner / LLDP·CDP：发现与远程工具分栏——本 L1 对齐「周围有什么」
