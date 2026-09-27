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

| 协议          | macOS 路径                                                                          | 产出                                      |
| ------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| mDNS / DNS-SD | 采用成熟 `mdns-sd` 浏览 `_services._dns-sd._udp.local.`，再按发现的服务类型解析实例 | 服务名、类型、主机、端口、TXT、非回环地址 |
| SSDP / UPnP   | 使用 `httparse` 校验 UDP 1900 M-SEARCH 响应；只读出站请求，不访问响应提供的 URL     | 设备响应名、类型、USN、LOCATION（仅展示） |

护栏：

- 不自动调用 UPnP `AddPortMapping` 等写操作。
- 不请求 SSDP 响应给出的 `LOCATION`，避免把局域网设备提供的 URL 当作可信目标访问。
- mDNS 结果过滤回环 IP 与仅在回环接口上发现的地址；没有任何非回环地址的实例不列为局域网服务。
- 浏览器式超时；同一 UUID 去重。
- 结果虚拟化（设备可能很多）。

### 3.3 NAT 类型（STUN）

| 项       | 约定                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 协议     | STUN Binding（RFC 8489）；多服务器对照；行为发现按 RFC 5780                                                                                                                     |
| 分类目标 | 按服务器报告当前映射行为与过滤行为：Endpoint-Independent、Address-Dependent、Address and Port-Dependent；不用旧式 cone / symmetric 名称代替协议观测结果                         |
| 当前实现 | 普通 Binding 报告映射地址和多源一致性；配置 RFC 5780 服务器后，按该服务器报告映射/过滤行为；不从普通 Binding 的跨服务器差异推断 NAT 类型                                        |
| 实现     | 使用 `rtc-stun`（webrtc-rs/rtc）处理 STUN 消息、随机事务 ID、XOR 映射和 RFC 5780 属性；**不必**引入完整 ICE/TURN 栈                                                             |
| 服务器   | Google / Cloudflare 仅用于普通 Binding；可配置 RFC 5780 服务域名（`_stun-behavior._udp` SRV）或明确的 `host:port`；最多 3 个；逐源显示映射/过滤结果和耗时，单源错误不影响其他源 |

普通 STUN Binding 可以发现某条 UDP 路径的映射地址，但不足以区分 RFC 5780 定义的映射与过滤行为。行为发现使用新建 UDP socket，并先做过滤测试再做映射测试；服务器必须返回合法的 `OTHER-ADDRESS` 与 `RESPONSE-ORIGIN`。备用地址为私网/保留地址时拒绝发送探测；过滤测试无响应后，还要测试备用地址的主端口可达性，只有可达才能报告「地址与端口相关过滤」。此检查针对 RFC 5780 已报告勘误 #7971 提出的误分类场景。该 RFC 为实验性规范，结果只描述相对所用服务器、端口和当次网络路径的行为，不是 NAT 永久特征。普通服务器的超时也只说明没有收到响应，不能单独证明 UDP 已被阻断。

RFC 5780 服务可使用 DNS 服务发现域名（查询 `_stun-behavior._udp.<domain>` SRV）或用户已知的 `host:port`；必须运行在 UDP 上并明确支持 `CHANGE-REQUEST`、`OTHER-ADDRESS`。SRV 目标按优先级和权重选择，域名解析和探测都有界超时。当前不支持需要认证的行为发现服务器；此类服务器显示为不支持/拒绝，不会覆盖普通 Binding 结果。

与「公网出口」区别：出口要的是 **IP/ASN**；NAT 面板报告的是 **STUN 观察到的映射/行为**。两处可共用一次 Binding 的 XOR-MAPPED-ADDRESS 候选，但 UI 分面板。

### 3.4 NTP 时间

| 项       | 约定                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 查询     | 标准 SNTP（UDP 123）；对 Apple、Cloudflare、Google、阿里云来源并发查询，逐源错误隔离                  |
| 输出     | 多源 offset 与 RTT 中位数；逐源 offset、RTT、stratum；阈值使用偏差绝对值（`>500ms warn`，`>2s high`） |
| 系统对照 | 可读系统时钟；**不**在本模块强制改系统时间（改时间属系统设置/需提权，避免越权）                       |

客户端使用成熟 Rust SNTP 实现校验响应来源、报文长度、mode/version、stratum、originate timestamp、KoD 与时间戳；单个来源的 DNS/UDP/协议错误不丢弃其他来源的有效样本。每源请求（含 DNS）最多等待 4 秒，多个来源并发执行。

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

| 项   | 约定                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 传输 | HTTPS REST；Rust `reqwest` 创建 measurement + 轮询 status；使用产品 User-Agent、压缩响应与 ETag，并在 macOS / Windows 遵循系统代理                                                |
| 能力 | 本产品接入 DNS A / Ping 3 包 / HTTP HEAD；Globalping API 另支持 traceroute / MTR，但当前 UI 不宣称可运行。**无带宽测速**                                                          |
| 位置 | 从 world / US / Europe / Asia 选择 1–3 个预设区域，每区请求 1 个在线探点；本机与远端并发执行                                                                                      |
| 配额 | 可匿名使用；可选 token 提高额度。token 只存 OS Keychain，renderer 只拿 configured / available 状态，提交后不回显、不进日志。429 显示响应头中的额度/重置数据，远端失败不丢本机结果 |
| 轮询 | 探点超时 20 秒；客户端总时限 35 秒；轮询间隔至少 500ms（产品默认 700ms），使用 ETag；超时保留已收到的探点结果；API JSON 响应上限 1 MiB；原始诊断详情默认折叠，失败摘要本地化      |
| HTTP | 本机与远端均使用 HEAD，不下载页面体；输入须为完整 HTTP(S) URL，不接受 URL 内嵌用户名/密码或 fragment。结果展示 origin，避免 query 被命令提示和历史命令暴露                        |
| 隐私 | UI 明示远端探点会收到目标和测量类型；用户输入到 Globalping 的目标由该服务执行。遵守官方限额                                                                                       |

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
同一 (tool, target) → 结果按节点并排展示（当前 DNS / Ping / HTTP HEAD）
例：本机 DNS 正常、探点 A 返回不同答案 → 显示单独节点行供用户对照
```

MVP：`listProbeNodes()` 至少返回 `local`；未实现执行能力的远程 kind 不得显示为可运行选项。agent 注册不表示自有 agent 已支持远程执行。

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
measureMulti(target, measurementType, locations): MultiNodeProbeResult
getGlobalpingTokenStatus(): { available: boolean; configured: boolean }
setGlobalpingToken(token) / clearGlobalpingToken()
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
- 多节点：先选 DNS / Ping / HTTP HEAD 和目标，再选 1–3 个 Globalping 区域并运行；DNS 至少返回一条有效 IPv4 A 记录、Ping 至少收到一个包、HTTP 收到 100–599 的状态码才报告该探点成功；部分节点失败不阻断其余结果。
- token 输入只在内存态；保存/移除由后端 Keychain 命令完成，loading 与错误可见，不回显 token。
- 命令透明：运行行展示测量类型、脱敏目标 origin 与区域；远端路径标注 Globalping。
- Post / C badge 与 roadmap 档位一致。

---

## 6. 安全与合规

- 局域网扫描默认私网；公网 CIDR 拒绝或强确认。
- agent 与 Globalping 流量仅测量结果 JSON；不中继用户任意 TCP 成开放代理。
- 发现类数据可进报告；导出提示内网拓扑敏感。
- **D-017**：ARP/深度发现若依赖 `adv-scanner`，走与安全 Tab 同一 `PackInstallDialog`；mDNS 使用 `mdns-sd` 完成标准 DNS-SD 查询与资源记录解析，STUN/NTP 优先主包轻量实现，不默认拆成下载项。

---

## 7. 验收清单（按档）

**Adv**

- [ ] ARP 有特权路径 + ping 降级；CIDR 硬顶
- [ ] 需要 pack 时正确返回 `missing_pack` 并完成安装校验流（D-017）
- [x] mDNS/SSDP 只读浏览；无 UPnP 写操作
- [x] STUN RFC 5780 映射/过滤行为分类、逐源耗时 + 多源故障隔离（显式兼容服务器）
- [x] NTP offset / RTT 多源中位数、逐源 stratum 与阈值（`>500ms warn` / `>2s high`）；不擅自改系统钟

**C**

- [x] `listProbeNodes` + Globalping DNS / Ping / HTTP HEAD 端到端；本机与远端并发、单节点失败保留
- [x] Globalping token 仅由后端写入/读取/删除系统钥匙串；不进入前端持久化与命令日志
- [ ] agent 鉴权/限速/拒绝 shell 有测试
- [ ] `store.byNode` 对比视图；单节点失败可诊断
- [ ] 远程能力不要求本机 Adv pack（本机零重库）

---

## 8. 参考

- [design.md](./design.md) §4 多节点 · §5.2 ARP · §11 Globalping
- Globalping API · librespeed（测速在测试 Tab，不在此重复）
- RFC 8489 STUN · Bonjour / DNS-SD · UPnP 设备发现（只读）
- [RFC 5780 NAT Behavior Discovery](https://www.rfc-editor.org/info/rfc5780/) · [RFC Editor Errata 7971](https://www.rfc-editor.org/errata/eid7971) · [webrtc-rs rtc-stun](https://github.com/webrtc-rs/rtc)
- NETworkManager IP Scanner / LLDP·CDP：发现与远程工具分栏——本 L1 对齐「周围有什么」
