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

| 协议          | macOS 路径                                                                                    | 产出                                                           |
| ------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| mDNS / DNS-SD | `mdns-sd` 浏览 `_services._dns-sd._udp.local` 并查询发现的本地 TCP/UDP 服务类型               | 服务名与类型；当前实现不展示 TXT                               |
| SSDP / UPnP   | `ssdp-client` 发送 UDP 1900 M-SEARCH；只解析响应中的 `LOCATION` 主机/端口供展示，不请求该 URL | 服务类型、SERVER 与 LOCATION；不读取设备描述或调用 UPnP action |

护栏：

- 不自动调用 UPnP `AddPortMapping` 等写操作。
- 浏览器式超时；同一 UUID 去重。
- 结果虚拟化（设备可能很多）。

### 3.3 NAT 映射对比（STUN）

| 项     | 约定                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 协议   | STUN Binding（RFC 8489）；多服务器对照                                                                                       |
| 输出   | `mapping-consistent` / `mapping-varies` / `mapping-insufficient` / `blocked-or-timeout`；只描述映射观测，不推断完整 NAT 类型 |
| 实现   | `stun-proto` RFC 5389/8489 codec 与事务状态；一个 socket/源端口按序查询，连接 UDP peer 并核对随机 transaction ID             |
| 服务器 | Google / Cloudflare 公共源；失败转移；遵守配额                                                                               |

仅发送 Binding 请求无法得出 Open、Full Cone、Restricted、Port-Restricted 等完整 NAT 分类；服务器负载均衡也可能造成映射差异。界面将其描述为映射对比，避免把可能性说成确定 NAT 类型。若未来需要行为分类，须接入明确支持 RFC 5780 的 STUN 服务并单独验证。

与「公网出口」区别：出口要的是 **IP/ASN**；NAT 探测展示映射地址观测。两者职责不同；映射地址可作为出口候选，但不得由 Binding 结果推断完整 NAT 行为。

### 3.4 NTP 时间

| 项       | 约定                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| 查询     | `rsntp` 异步 SNTP 客户端（RFC 5905）；多源并行查询                                   |
| 校验     | 已连接 UDP peer；检查 NTP 版本、模式、leap、stratum、originate/transmit timestamp    |
| 输出     | offset 中位数、RTT 中位数、stratum、成功源数/配置源数、阈值（>500ms warn，>2s high） |
| 系统对照 | 可读系统时钟；**不**在本模块强制改系统时间（改时间属系统设置/需提权，避免越权）      |

macOS `sntp` / `ntpq` 可作调试对照，产品路径使用纯 Rust 客户端，避免解析本地化输出。

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

| 项   | 约定                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 传输 | 官方 HTTPS REST API；复用项目已有 `reqwest` 客户端，不额外引入 Globalping CLI/SDK                                                                                                                 |
| 能力 | DNS / ping / HTTP 已实现；traceroute / MTR 仍未接入；不提供带宽测速                                                                                                                               |
| 配额 | 匿名调用可用；可选 Bearer token 存系统钥匙串；429 显示官方 rate limit headers                                                                                                                     |
| 轮询 | `inProgressUpdates=true`；读取间隔至少 500ms，支持 ETag；最多等待 50 秒并保留部分结果；后端将真实进行中结果通过 `network-probe:globalping-progress` 仅发送给发起调用的窗口，最终 IPC 结果收敛状态 |
| 护栏 | 每次最多 3 个白名单区域、每区 1 个探点；HTTP 使用 HEAD；API client 不跟随跨源重定向                                                                                                               |
| 隐私 | token 按 Tauri app identifier 隔离；不返回给 renderer、不写命令日志；HTTP 查询串不记日志                                                                                                          |
| ToS  | 遵守官方限额；429 根据官方 `X-RateLimit-*` / `X-Credits-Remaining` 信息提示恢复路径                                                                                                               |

DNS 使用 A 查询并并列显示本机解析；ping 固定 3 个包；HTTP 输入必须是无凭据的 HTTP(S) URL，路径与查询按请求发送；查询串参与对比目标匹配，但结果标签和命令日志会省略查询串，HTTP 供应商错误详情不展示。Globalping 区域列表中的 `reachable` 表示适配器已配置，不代表实时探点在线，实际状态以测量结果为准。

token 可通过 `network_probe_manage_globalping_token` 查询配置状态、保存或移除；服务名包含 Tauri app identifier，QA bundle 与正式版不共享钥匙串条目。保存操作只回传是否已配置，不把秘密返回前端。

#### 自有 agent（`remote-agent`）

桌面端实现 HTTPS 客户端，不包含 agent 服务端。协议使用 `bench-probe-agent.v1`：`GET /v1/health` 校验兼容性；`POST /v1/measurements` 执行 `dns`、`ping`、`http` 三种固定操作。客户端关闭重定向、限制响应体，并用 HMAC-SHA256 签署 method、path、agent ID、秒级 timestamp、UUID nonce 和原始 body 的 SHA-256。共享 token 按 app identifier 与 agent ID 写入系统钥匙串，不返回前端或写入命令日志。WSS 暂不支持。

服务端必须校验 HMAC、timestamp 时效与 nonce 重放，按 token 限制 QPS / 并发并以 `429` + 可选秒数 `Retry-After` 返回限流状态；必须在 DNS 解析后检查全部地址以防 DNS rebinding，并拒绝回环、云元数据、link-local 和未授权私网目标。成功响应须含与 DNS、ping 或 HTTP 类型匹配的测量证据，空结果不能报告成功。客户端拒绝字面 localhost、link-local / 云元数据目标，前端与后端共同限制最多同时运行 3 个 agent 测量、最多登记 10 个 agent。未接入兼容服务端前，协议只有客户端测试，不视为端到端完成。

结果以 `nodeId` 隔离，HTTP URL 查询串不进入结果展示或日志。对比时查询串参与 URL 身份匹配，但目标标签只显示 origin 与 path；HTTP 原始供应商错误详情不展示。仅手动添加 endpoint，不做局域网自动扩散；agent 不得开放通用代理或任意 shell。

已评估 [Prometheus Blackbox Exporter](https://github.com/prometheus/blackbox_exporter)：它是成熟的 HTTPS / Basic Auth 服务，可探测 DNS、ICMP 与 HTTP；但 DNS 查询名固定在 server module 配置中，`/probe` 返回 Prometheus 指标且只报告答案记录数，不能直接支持 Bench 任意域名输入与 DNS 答案列表。因此当前没有把它误当作兼容 agent；后续若采用它，需要明确限定 DNS 能力或设计经过安全审查的适配层。

#### 对比视图

```text
Globalping 多探点结果 + agentMeasurementResults[nodeId]
→ 按同一测量类型与规范化 target 对齐（HTTP 查询串参与匹配但不显示）
→ 切换目标或类型后隐藏过期结果，不将其混入当前对比
```

Globalping 多探点与各自建 agent 结果在同一对比区按来源分组展示；DNS 响应、RTT/丢包和 HTTP 状态/耗时保留各来源语义。不复制一份持久化 `byNode` 状态，避免结果与来源 store 分叉。HTTP query 只发往测量服务，不显示在对比标题或命令日志中。

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
- 多节点：选择 DNS / ping / HTTP、目标与 1–3 个 Globalping 区域后运行；DNS 并列本机结果，ping/HTTP 显示远端结果。
- 用户可选配置 token；保存状态、重试、删除确认均有反馈，token 输入不会进入持久化前端状态或命令日志。
- 显示完成、部分结果、失败、超时、额度限制；单探点失败不抹掉其他结果；ping 显示 RTT/丢包，HTTP 默认发 HEAD 并显示状态码/总耗时。
- 命令透明：命令记录只显示 `globalping <type> <host> locations=...`，不记录 HTTP 查询串。
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
- [x] mDNS/SSDP 只读浏览；SSDP `LOCATION` 仅从响应中解析并展示，不发起 HTTP 请求；无 UPnP 写操作
- [x] STUN 映射对比 + 多源故障转移（样本不足时不判一致；不推断完整 NAT 类型；需要 RFC 5780 服务才能增强分类）
- [x] NTP offset 阈值、RTT、stratum 与成功源计数；不擅自改系统钟

**C**

- [x] `listProbeNodes` + Globalping DNS/ping/HTTP 测量、token、超时/限速/部分结果与真机验证（C2-2）
- [x] 桌面端 agent 鉴权、限速响应映射、固定工具白名单、目标安全校验、`nodeId` 结果隔离与密钥存储
- [ ] 接入兼容 agent 服务端，验证 HMAC 过期 / nonce 重放拒绝、并发与 QPS 限制、429 恢复时间、DNS rebinding / 元数据防护和三种测量的真结果
- [x] Globalping + agent 统一结果对比区；当前分别保存 Globalping 与 `nodeId` agent 结果，视图按测量类型和规范化目标对齐，不重复持久化对比数据；切换目标或类型时隐藏旧结果
- [x] Globalping 与自建 agent 测量不要求本机 Adv pack；Globalping 使用 HTTPS API，自建 agent 使用 HTTPS 客户端，能力包状态不参与远程测量准入

---

## 8. 参考

- [design.md](./design.md) §4 多节点 · §5.2 ARP · §11 Globalping
- [Globalping official OpenAPI specification](https://github.com/jsdelivr/globalping/blob/master/public/v1/spec.yaml) · librespeed（测速在测试 Tab，不在此重复）
- RFC 8489 STUN · Bonjour / DNS-SD · UPnP 设备发现（只读）
- NETworkManager IP Scanner / LLDP·CDP：发现与远程工具分栏——本 L1 对齐「周围有什么」
