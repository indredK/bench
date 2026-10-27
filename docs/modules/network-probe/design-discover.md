# Network Probe · L1「发现」技术设计（macOS）

> **范围**：周围有什么设备/服务、NAT/时间环境怎样、从哪几个节点测。
> **父文档**：[design.md](./design.md) §4 / §5.2 / §11。
> **平台**：macOS 14+ 主路径；Windows 有降级发现路径。
> **交付档**：**整 Tab 默认 Post-MVP**（ARP/局域网服务/NAT/NTP = Adv；多节点 = C）。MVP 仅保留 L1 入口与能力灰显。

---

## 1. 用户心智与 L2 清单

| L2 id     | 面板       | 主能力                          | 交付         |
| --------- | ---------- | ------------------------------- | ------------ |
| `arp`     | 局域网邻居 | 局域网主机表 + ARP 欺骗迹象入口 | Post-MVP-Adv |
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

| 模式          | 条件               | 行为                                                                                                                         |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 原始 ARP 扫描 | 有 RAW/BPF 特权    | 尚未实现；未来对本机 CIDR 发 ARP Request 并收集 MAC↔IP                                                                       |
| 当前降级发现  | 默认               | `netdev` 获取默认接口 / 网关 / IPv4 前缀后合并邻居缓存与 TCP connect 探测；仅 RFC 1918 私网、含其他主机且不大于 `/24` 时探测 |
| 范围超限      | 当前子网大于 `/24` | 不发起主动连接，只显示系统邻居缓存，并说明跳过原因                                                                           |
| 增强          | 可选               | 对存活主机做 rDNS（`hickory` PTR）                                                                                           |

护栏：

- 使用 `netdev` 获取系统默认接口、网关与实际 IPv4 前缀，不解析命令输出，也不把所有网络硬编码为 `/24`。
- 私有 `/32` 主机路由没有可探测的其他地址，只显示系统缓存并返回 `no-peers`，不把它误报为安静网络。
- 同一接口在同一子网配置多个 IPv4 地址时均视作本机地址，从 TCP 探测范围中排除。
- macOS 通过 `arp -an` 读取系统邻居缓存；Windows 通过 `GetIpNetTable2(AF_INET)` 读取 IPv4 邻居表，并按 `InterfaceIndex` 关联 `netdev` 接口。Windows API 失败时继续 TCP-only，不把读取失败升级为整个发现失败。
- 仅 macOS / Windows 属于产品支持平台。邻居缓存读取报错时显示 TCP-only 或未执行；成功返回空表仍表示已读取缓存。Windows 原生 API 的空表、接口映射和错误降级仍需 Windows 真机验收。
- 默认路由指向隧道时，仅当唯一物理 RFC 1918 私网接口可确认时回退；接口选择歧义时不猜测、不扫描，也不展示无法归属的缓存记录。
- TCP 探测只对用户拥有或获准检查的 RFC 1918 私网运行；并发上限 32、单连接超时 250 ms；大于 `/24` 或非 RFC 1918 地址时跳过主动探测，不静默截断网段。
- 探测端口为 TCP 80/443/22，不发送原始 ARP 请求；UI 与命令提示必须说明这是主动连接探测。
- `cancelScan` 幂等；系统拒绝本地网络连接时停止后续分块，并返回权限提示。
- ARP 发现通过 `network-probe:lan-discovery-progress` 发出带 `sessionId` 的进度：`preparing` 阶段不提供百分比；确定可探测主机列表后，`scanning` 阶段以实际完成的 host probe / host 总数显示进度。邻居数按唯一 IP 计算，包含已归属的系统缓存和 TCP 响应；取消或权限拒绝后只计入已完成任务，不计入被中止任务。
- macOS Local Network 拒绝状态尚不能由普通 TCP socket 的 `ErrorKind::PermissionDenied` 稳定判定。Apple TN3179 指出没有通用权限查询 API，并建议用 `NWConnection` 的 waiting 状态及 `NWPath.UnsatisfiedReason.localNetworkDenied` 识别；当前路径仍待 TCC 拒绝真机验证，未通过前不把“权限被拒”检测标记为已验收。
- **不做** ARP 投毒；欺骗检测只读网关 MAC 漂移（与安全 Tab 共用 `detectArpSpoofing`）。

macOS 注意：

- **本地网络**隐私权限；TCP 探测收到权限拒绝时停止扫描并引导到系统设置的「本地网络」权限项。
- 权限拒绝识别实现需遵循 Apple TN3179 推荐的 Network.framework 连接状态；`tokio::TcpStream` 错误种类只可作为兼容信号，不能单独证明 TCC 拒绝。
- Wi‑Fi 客户端隔离（宾客网络）会导致「扫不到邻居」——结果空要区分「真无设备」vs「隔离/权限」。

库：`pnet` / `socket2`；邻居表使用操作系统 API（macOS `arp -an`、Windows `GetIpNetTable2`）作补全（缓存≠完整发现）。Windows API 参考：[GetIpNetTable2](https://learn.microsoft.com/en-us/windows/win32/api/netioapi/nf-netioapi-getipnettable2)、[MIB_IPNET_ROW2](https://learn.microsoft.com/en-us/windows/win32/api/netioapi/ns-netioapi-mib_ipnet_row2)。

### 3.2 局域网服务（mDNS / SSDP）

| 协议          | 实现                                                                                                                                           | 产出                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| mDNS / DNS-SD | [`mdns-sd` 0.21.5](https://github.com/keepsimple1/mdns-sd)：先浏览 `_services._dns-sd._udp.local.`，再浏览发现的服务类型，由库解析 PTR/SRV/TXT | 服务实例、类型、主机、端口、TXT      |
| SSDP / UPnP   | UDP 1900 M-SEARCH；只解析响应状态行与 USN/ST/SERVER/LOCATION，不请求 LOCATION                                                                  | 设备类型、响应主机、设备名、LOCATION |

护栏：

- 不自动调用 UPnP `AddPortMapping` 等写操作，也不访问响应中的 LOCATION URL。
- mDNS 服务类型最多浏览 64 种；mDNS + SSDP 总结果最多 256 项；TXT 与诊断详情最多 2048 字符。
- 依赖复核（2026-10-16）：锁定版本 `mdns-sd` 0.21.5 支持 macOS / Windows、同步与异步接收，并按 RFC 6762/6763 解析；上游明确标记为 beta，因此仅用于受限的只读浏览，真机权限、常见设备兼容和退出清理需通过 S-DIS-02 后才能验收。另评估系统 DNS-SD wrapper [`mdns-sd-discovery`](https://github.com/abbyssoul/mdns_sd_discovery) 0.3.2：虽然能调用 macOS / Windows 原生栈，但仍是低采用度的新 crate，Windows 不报告服务移除事件，Linux / FreeBSD 依赖 Avahi daemon。现阶段没有证据表明它是更成熟、跨平台行为更完整的替代品，暂不替换；待 Local Network 权限真机验收与新版本发布后再评估。
- mDNS 按 DNS-SD 完整服务实例名去重；SSDP 优先按 USN 去重，缺少 USN 时使用响应 IP、ST 和 LOCATION。
- mDNS 监听窗口 1.2 秒、SSDP 窗口 2 秒；两个阶段可通过共享 `scan-session` 取消，取消轮询上限 40 ms，保留已解析结果。`mdns-sd` daemon 有独立线程；正常退出有界等待 shutdown 回执，任务提前丢弃或 unwind 时由 RAII guard best-effort 排入 Exit。
- `network-probe:lan-services-progress` 以 session ID 隔离 `preparing` / `mdns` / `ssdp` 阶段，并在每个唯一服务加入时更新计数；只计实际服务，不把协议错误当作发现项。
- 列表总量硬限 256 项，避免异常局域网广播造成无界内存和渲染负担；后续需要扩大时再增加虚拟列表。
- macOS Local Network 权限拒绝与无服务响应是否能由当前纯 Rust mDNS daemon 明确区分，尚未通过隔离 QA 真机确认；UI 暂不宣称已完成权限专用提示。未验证前 S-DIS-02 保持待验收。

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

| 项   | 约定                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 传输 | HTTPS REST；Rust `reqwest` 创建 measurement + 轮询 status                                                                                                                                                                                                                                                                                                                                                    |
| 能力 | Globalping API 支持 ping / traceroute / dns / mtr / http（**无带宽**）；Bench 接入 DNS、Ping、HTTP，暂不接入 traceroute / mtr                                                                                                                                                                                                                                                                                |
| 配额 | 匿名额度用尽 → 可选配置 token；结果按探点返回结构化失败类型并本地化显示                                                                                                                                                                                                                                                                                                                                      |
| 鉴权 | API 支持匿名与可选 Bearer token；token 只发给固定 HTTPS API `api.globalping.io`，401/403 显示独立授权错误                                                                                                                                                                                                                                                                                                    |
| 密钥 | token 由 Rust 后端写入系统钥匙串；renderer 仅短暂持有输入值，不写应用存储、日志或命令历史。显式检查/保存/移除；DNS / Ping / HTTP 测量读取已保存 token 时可能触发系统钥匙串授权                                                                                                                                                                                                                               |
| ToS  | 遵守官方限额；前端展示响应实际提供的限额与 credit 字段                                                                                                                                                                                                                                                                                                                                                       |
| 隐私 | Globalping 将测量数据公开提供，且不允许对本地网络执行测试；只提交已获准公开的目标。DNS 的语法检查会拒绝 IP 字面值、单标签名及已知本地 / 保留名称，但不能识别所有 split-horizon 私有域；HTTP 只允许无凭据、无查询串 / 片段的 HTTP(S) URL 与 GET / HEAD。参照 [Globalping 官方说明](https://github.com/jsdelivr/globalping#things-to-keep-in-mind) 与[使用条款](https://globalping.io/terms/terms-of-use.md)。 |

Bench 当前只发布 world、US、Europe 三个 Globalping 节点，并只接受这三个不重复的 preset；每次最多三个位置，空列表回退到 world。IPC 不会把任意字符串拼进命令提示或远端请求；节点清单只显示实际进入测量请求的区域。

DNS 对比要求域名输入，并在创建本机 DNS 会话前拒绝 IP 字面值、单标签名和已知本地 / IANA 特殊用途名称。该语法检查无法识别所有使用公开后缀的 split-horizon 私有域；因 Globalping 测量数据公开，持续显示的隐私提示要求用户确认目标已获准公开。系统钥匙串读取失败时，合规目标的 DNS 对比保留本机 DNS 结果并跳过远程请求；Ping / HTTP 不发起远端测量并显示凭据读取失败。token 被 Globalping 拒绝时将远端节点标记为授权失败。token 只由 Rust 后端存取并发给固定 Globalping HTTPS API，不向 renderer 返回明文。

DNS 对比按 Globalping 的 `in-progress` 状态轮询，至少间隔 700 ms；创建请求设置 `inProgressUpdates: true`，按官方交互式客户端契约请求实时部分结果。收到本机 DNS 结果后立即发送一次部分快照；后续快照只包含本次轮询中已结束的远端探点，并合并此前完成的探点。测量状态 GET 遵循官方建议：服务器返回 ETag 后，后续请求发送 `If-None-Match`；`304 Not Modified` 保持当前结果并等待下一轮，不重复解析或重置已完成探点。跨事件使用 session ID 过滤，避免旧任务更新新结果；监听器在用例结束时释放。界面在远端测量仍运行时明确标示当前行是部分结果。收到其他整体状态即停止轮询。只有探点状态为 `finished` 且至少返回一条 DNS 答案时标为成功；已完成但无答案显示本地化无答案状态，测量失败或离线显示测量失败。摘要显示节点结果行数（包含失败节点），不将 DNS 记录条数称为答案总数。Globalping 单个 HTTP 请求最多等待 8 秒，远端流程总时限 20 秒，本机 DNS 最多等待 5 秒。本机请求失败 / 超时与 Globalping 请求失败 / 超时使用各自的本地化说明，避免将本机错误归因给远端服务。用户可停止本机等待；Globalping 不提供撤销已创建测量的接口，提交后的远端工作可能继续。超时和远端错误作为失败节点显示，不丢弃本机结果。

多节点面板提供 DNS / Ping / HTTP 模式。Ping 输入裸公网主机名或 IP，仅展示 Globalping 探点的解析地址、RTT 与丢包；HTTP 输入绝对 HTTP(S) URL，默认 GET，可选 HEAD，展示 HTTP 状态码与 DNS / TCP / TLS / 首字节 / 下载时序。URL 用户信息、查询串和片段会在本地拒绝，私网 / 保留 IP、单标签主机名、`.local` / `.localhost` / `.internal` 等本地名称以及 IANA 特殊用途域名及其子域（如 `.arpa`、`.alt`、`.onion`、`example.com/.net/.org`）不提交；Globalping 本身也只允许公网目标。裸目标复用 `url` crate 的 WHATWG 主机解析，先规范化十进制缩写、八进制和十六进制 IPv4 写法，再按 IANA 特殊用途登记表检查全球可达性；其中 192.0.0.9/32 与 192.0.0.10/32 是明确例外，保留为允许目标，其余不可全球到达地址仍拒绝。Ping / HTTP 的 `inProgressUpdates` 结果以 `sessionId` 隔离，逐个展示已完成探点；用户取消只停止本机等待，已提交测量仍可能继续。创建请求最多等待 8 秒，整体轮询最多 20 秒，状态请求至少间隔 700 ms，收到 ETag 后发送 `If-None-Match` 并接受 `304`。通用顶栏的节点选择器仍只路由本机探测；Globalping 远程 Ping / HTTP 必须从多节点面板显式发起，自有 agent 目前仅进行 HTTPS/WSS 健康检查。

Globalping 创建与状态轮询只解析成功响应；每个 JSON 响应先按 `Content-Length` 提前拒绝，并在解压后的流读取中累计限制为 512 KiB。超限或 JSON 无效按远端请求失败处理，不影响已得到的本机 DNS / 其他探点结果；`429` 与 `304` 仍按状态码和响应头处理，不读取响应体。

#### 自有 agent（`remote-agent`）

见 design §4.4 摘要落地：

| 项       | 约定                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| 传输     | HTTPS 或 WSS；禁止明文                                                                                                   |
| 健康检查 | HTTPS `GET /v1/health` 返回 2xx；WSS 在同一路径完成 TLS 升级并通过 Ping/Pong；单端点最多 5 秒，列表刷新最多并发 8 个检查 |
| 鉴权     | 每 agent token 或 mTLS；HMAC(timestamp+body)                                                                             |
| 方法     | 白名单 tool id；**拒绝任意 shell**                                                                                       |
| 限速     | 每 token QPS/并发；超限 → 429 语义                                                                                       |
| SSRF     | 注册端点校验拒绝已知云元数据 IPv4 / IPv6 地址与元数据主机名；手动配置的其他内网端点仍允许                                |
| 发现     | **手动**添加 endpoint；不做局域网自动扩散（防变僵尸网络）                                                                |
| 密钥     | Keychain / 系统安全存储；不进前端持久化明文                                                                              |

注册表最多保存 256 个 agent，JSON 文件最多 1 MiB；读取使用有界字节数并在解析后验证条目数，写入前重复校验两个上限。超限文件 fail-closed，节点加载和新增操作均显示双语恢复提示；已有注册表条目超限使用独立错误码，避免误报成当前新增已满。新增到上限时先在不持锁跨越网络请求的预检中拒绝，之后在串行 upsert 再校验以处理并发新增；同标签和规范化 URL 的重复注册仍幂等。注册表只保存不含用户名/密码、查询参数和片段的端点 URL。TLS 使用系统证书根，HTTPS 不跟随重定向；注册及每次健康检查会拒绝直接指向 `169.254.169.254`、AWS IPv6 IMDS `[fd00:ec2::254]`、Google Cloud IPv6 metadata `[fd20:ce::254]`、`metadata`、`metadata.goog`、`metadata.google.internal` 及其子域的地址，其他用户手动配置的内网端点仍允许。每次健康检查会解析主机名并拒绝任何命中上述元数据 IP 的结果，再将 HTTPS / WSS 连接固定到这组已检查地址，防止别名和 DNS 重绑定绕过；为保证目标 IP 固定，agent 健康检查直连且不使用系统代理。WSS 健康检查只需小型 Ping/Pong，入站帧、消息和读缓冲限制为 4 KiB，避免健康端点推送大消息消耗内存。健康检查只证明 agent 在线，不表示凭证鉴权或远程探测执行已启用。IPv4 / IPv6 地址及 `metadata.goog` 别名见 [AWS 官方文档](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html) 与 [Google Cloud 官方文档](https://docs.cloud.google.com/compute/docs/metadata/querying-metadata)。

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

| kind           | 行为                                              |
| -------------- | ------------------------------------------------- |
| `local`        | 本机执行                                          |
| `remote-proxy` | Globalping 适配器                                 |
| `remote-agent` | HTTPS / WSS agent 健康检查；远程探测执行仍待 C2-3 |

未知 `nodeId` → `INVALID_INPUT`；remote 未配置 → `UNSUPPORTED`（诚实）。

---

## 5. UX

- ARP 扫描：接口 / 缓存预检显示不定进度状态；开始主动探测后按已完成 host probe / 目标数显示真实进度与唯一邻居数，事件按 `sessionId` 过滤并在结束后清理。取消保留已完成的邻居结果，未完成任务不计入进度。
- 局域网服务浏览：显示 mDNS / SSDP 阶段和唯一服务计数；取消后保留已发现服务，空取消态与完整扫描空态使用不同文案。session ID 过滤迟到进度，结束后释放监听器。
- 多节点：先选 tool + target，再勾选节点并跑；部分节点失败不阻断整表；等待中可停止本机轮询，结果细节和状态使用本地化文案。
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
- [ ] mDNS/SSDP 只读浏览；不请求 LOCATION，不提供 UPnP 写操作；进度、取消、去重和数量上限符合 S-DIS-02
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
