# Network Probe · L1「安全」技术设计（macOS）

> **范围**：暴露面、污染/劫持迹象、包级诊断——**只检测，不攻击**。
> **父文档**：[design.md](./design.md) §5.1 / §5.3 / §9 / §12.3.2。
> **平台**：macOS 14+；多数能力需特权或 Post-MVP。
> **交付档**：**整 Tab 默认 Post-MVP-Adv**（MVP 可只放入口灰显 + 授权声明骨架，不实现扫描内核）。

---

## 1. 用户心智与 L2 清单

| L2 id       | 面板         | 主能力                                            | 交付         |
| ----------- | ------------ | ------------------------------------------------- | ------------ |
| `ports`     | 端口扫描     | SYN / TCP connect 存活                            | Post-MVP-Adv |
| `pollution` | 污染检测     | DNS / hosts / 证书 MITM / ARP 欺骗迹象 / 路由绕行 | Post-MVP-Adv |
| `pcap`      | 包级诊断     | 重传/乱序/RST **统计**（默认不落盘全量）          | Post-MVP-Adv |
| `dnssec`    | DNSSEC / DoH | 验证链、DoH/DoT 可达性                            | Post-MVP-Adv |
| `whois`     | WHOIS        | 注册信息查询                                      | Post-MVP-Adv |

首次进入本 L1：展示**授权使用声明**（仅测自有/已授权资产）；用户确认后写入模块设置。

---

## 2. 硬红线（本 Tab 最高约束）

**禁止实现**（design §12.3.2）：

- ARP **攻击** / 欺骗投毒
- MITM **流量注入** / SSL strip
- DoS / 洪水 / 慢速攻击
- 密码爆破 / 凭证喷洒

允许的是对应 **检测**：`detectArpSpoofing`、`checkSsl`（mitmSuspected）、暴露面评估、弱服务提示（无爆破）。

与 `port-manager`：**禁止 Kill**；本 Tab 不做 PID/进程树。

---

## 3. 可选能力包与安装向导（D-017）

> 全局约束见 [design §9.7](./design.md) 与 [DECISIONS D-017](../../explanation/decisions.md)。本 Tab 是 **sidecar / 本机工具** 的主消费方。

### 3.1 哪些要包、哪些不要

| 能力                                                                  | 供给方式                             | 说明                                                          |
| --------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| TCP connect 降级扫描、污染里的 DNS/hosts/轻量 TLS、WHOIS、DNSSEC 只读 | **主包或轻量编译**                   | 无重内核依赖时可进主包；勿强行拆下载                          |
| Nmap SYN / 服务与 OS 指纹                                             | 用户本机已安装的 Nmap                | 不捆绑；缺失时基础 TCP connect 仍可用，指纹状态为 unavailable |
| 深度 ARP、未来的特权扫描                                              | 可选包 `adv-scanner` / `priv-helper` | 仅在代码确实调用对应 sidecar 后才可报告 supported             |
| 诊断抓包                                                              | 可选包 `pcap-diag`                   | 依赖 libpcap + 通常需特权                                     |
| 正式特权 helper                                                       | 可选包 `priv-helper`                 | 公证前仅提示限制（D-010）                                     |

### 3.2 点击流（强制）

```text
用户打开「端口扫描」
  → getNetworkProbeCapabilities()
  → externalTools.nmap=found → 优先 Nmap；否则以 `degraded` 显示内置 TCP connect
  → Nmap SYN 权限不足 → 改用 Nmap `-sT`，明确显示连接扫描降级
  → Nmap 缺失 / 失败 / 超时 → 内置 TCP connect，扫描不中断
  → 用户勾选服务 / OS 指纹 → 先确认额外探测；只对已安装 Nmap 启用
  → 其他工具确实缺少必需 sidecar 时才打开 PackInstallDialog
```

### 3.3 IPC（Post-MVP）

```ts
listCapabilityPacks(): PackInfo[]
installCapabilityPack(packId): PackInstallResult   // 进度可用 event
uninstallCapabilityPack(packId): void
// 禁止：installCapabilityPack({ url }) 一类由前端指定地址的 API
```

安装进度 event 建议：`network-probe://pack-progress`（`packId`、bytes、phase）。取消安装须幂等。

### 3.4 UX 文案要点

- 说「可选组件 / 能力包」，**不说**「下载某个 crate / 动态库随便挂载」。
- capabilities 只把当前代码真正会调用的引擎标为 `supported`；本机 Nmap 是可选 CLI，不作为能力包下载。Nmap 在用时标 `supported`，指纹标 `partial`（OS 还依赖 RAW 权限）；sidecar 未接入具体工具前不报告其可用。
- 提供「管理已安装组件」入口（设置或安全 Tab 页脚）：版本、卸载。

---

## 4. 架构落点

```text
components/SecurityView/
  PortScanPanel.tsx
  PollutionPanel.tsx
  PacketCapturePanel.tsx
  DnsSecPanel.tsx
  WhoisPanel.tsx
  AuthScopeBanner.tsx      # 授权声明
  PackInstallDialog.tsx    # D-017 安装向导（可上提 shared）

src-tauri/src/net_probe/
  ports.rs
  pollution.rs
  packet_capture.rs
  dnssec.rs
  whois.rs
  privilege.rs             # 与 traceroute 共用特权探测
  packs.rs                 # manifest / 安装 / 校验 / 卸载（D-017）
```

特权分层（design §11.4，macOS）：

1. 触发式管理员授权（osascript / 一次性提权）——ad-hoc 包的主现实路径（D-010）
2. 正式签名后的 `SMAppService` helper（公证后才推荐；可选包 `priv-helper`）
3. 系统已装 `nmap` 时可选 fallback（探测其存在，不捆绑）
4. 可选 sidecar `adv-scanner` / `pcap-diag`（D-017）
5. 无特权 / 无包 → 自动降级或 `missing_pack`

---

## 5. macOS 实现细则

### 5.1 端口扫描（`scanPorts`）

| 模式             | 条件                                       | 行为                                                           |
| ---------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Nmap SYN         | PATH 中检测到 Nmap，且 RAW socket 可用     | 单主机 `-sS -Pn` 扫描用户指定端口；不运行 NSE 脚本             |
| Nmap TCP connect | Nmap 可用但 SYN 权限不足                   | 降级为 `-sT`；仍可选择轻量服务探测，不尝试 OS 探测             |
| 内置 TCP connect | Nmap 缺失、失败、超时、输出超限或 XML 无效 | Tokio connect 并发上限 32、每端口超时 800ms；能力标 `degraded` |

护栏：

- 后端只接受一个 IP literal 或 DNS hostname，拒绝 CIDR、Nmap IPv4 各段范围（即使域名解析器会把它当普通域名）与逗号分隔目标；端口表达式最多 4096 字节，最多 256 个去重端口。
- 公网目标、超过 64 个端口或开启指纹时先展示目标、完整端口表达式、端口数、速率/并发限制和超时，再要求确认；没有 CIDR 扫描入口。
- DNS hostname 在 3 秒内解析一次并固定到首个 IP；Nmap 接收该 IP 并使用 `-n -Pn`，不做反向 DNS 或额外主机发现。Nmap 以参数数组启动，不经过 shell；端口扫描限速 `--max-rate 50`、并行探测上限 16、最多 1 次重试、host timeout 30 秒；子进程总时限 35 秒、stdout/stderr 分别限 1 MiB / 128 KiB，取消时杀掉子进程。服务/OS 指纹探测有各自的时序，不受端口扫描的 `--max-rate` 完全约束，因此只在用户勾选后启用，OS 最多尝试一次，整个进程受 35 秒上限约束。
- 进度 event：`port-sample`（port、state、serviceHint、识别来源、风险标签）；`cancelScan` 幂等。Nmap 和内置扫描复用一个 session ID，降级时取消仍指向当前扫描。

库：`socket2` + `pnet`/`etherparse` + 可选 `pcap`；无 turnkey「完整 nmap」Rust 库——可接受薄封装或 nmap CLI fallback。

指纹默认关闭。用户显式勾选并确认后，已安装 Nmap 才运行 `-sV --version-light` 服务探测和 `-O --osscan-limit --max-os-tries 1` OS 探测；若降级到 `-sT`，跳过 OS 探测；不启用 NSE 或漏洞检测脚本。无 Nmap 时完成基础扫描并返回 `unavailable` 指纹状态。

服务来源明确区分 Nmap 服务探测、Nmap 服务表和常见端口号推测。产品名/版本/OS 都是远程目标提供或 Nmap 推测的数据，不能当作身份凭证；风险标签只附在 `open` 端口，且仅提示复核暴露与访问控制，不代表漏洞。

### 5.2 污染检测（`pollution` 聚合）

| 子检测       | macOS 做法                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| DNS 污染     | 多 resolver（系统 + 1.1.1.1 + 8.8.8.8 + 用户）经 `hickory-resolver` 查同一域名；答案集合不一致 → warn  |
| hosts        | 复用 `checkHostsOverrides`；标指到 `127.0.0.1`/内网/异常                                               |
| 证书 MITM    | `reqwest`+rustls 拉目标；比对系统信任锚与叶子/中间异常；公司代理合法 MITM 标「企业中间盒」而非「黑客」 |
| ARP 欺骗迹象 | 周期性读网关 MAC（`arp -an` 结构化或 sysctl/路由邻接）；与首次绑定漂移 → warn；**只读**                |
| 路由绕行     | traceroute hop ASN 突变（需测试 Tab 引擎）；异常跨境绕行标 info/warn                                   |

输出统一为 `PollutionFinding[]`：`kind` / `severity` / `evidence` / `commandHint`。

### 5.3 包级诊断（`startPacketCapture`）

| 项             | 约定                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| 库             | [`pcap`](https://docs.rs/pcap)（macOS 自带 libpcap）；完整诊断路径可要求 `pcap-diag` pack |
| 权限           | 通常需 root 或 BPF 可读；失败 → `unsupported`                                             |
| 默认           | **只累计计数器**：retrans / out-of-order / RST / TLS alert（若可解析）                    |
| 全量 pcap 落盘 | 默认关；显式开启 + 用户选路径 + 体积上限                                                  |
| 过滤器         | BPF 字符串白名单校验；禁止空过滤对全接口长时间抓                                          |

隐私：info 日志禁止打完整 payload；UI 默认不展示原始 hex。

### 5.4 DNSSEC / DoH·DoT

| 能力   | 实现要点                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNSSEC | Hickory `dnssec-ring` 在本机用内置 root trust anchor 验证 DoH wire-format 响应；只在全部查询 RRset 验证成功时显示 secure，签名错误为 bogus，安全链缺失为 insecure，其余为 unknown |
| DoH    | Hickory `https-ring` 通过 RFC 8484 wire format 请求 Cloudflare `/dns-query`；本地执行 DNSSEC 验证，单次探测总截止时间 5 秒                                                        |
| DoT    | Hickory TLS resolver 连接 Cloudflare DoT hostname；`webpki-roots` 验证 TLS 证书，只有握手与 DNS 查询都成功才标记可用，不把 TCP 端口连通当成 DoT 成功                              |

DNSSEC 面板的有限状态须由 zh/en locale 映射，未知值显示本地化「未知」。DoH 使用标准 DNS wire format，不依赖提供商专有 JSON 字段；本地验证只有在完整 RRset / 否定证明均有证据时才给出确定状态。SERVFAIL、缺少认证否定证明或网络错误都不能单独证明 DNSSEC bogus。resolver 原始诊断和命令提示默认收在折叠的技术详情中。DoH、DoT、DNSSEC 统一使用 Hickory resolver。

协议与实现依据：[RFC 8484](https://www.rfc-editor.org/rfc/rfc8484)、[Hickory DNS](https://github.com/hickory-dns/hickory-dns)。Cloudflare 也建议关键用途使用标准 wire format，因为其 DoH JSON schema 没有 IETF 标准且可能变化：[Cloudflare DoH JSON 文档](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)。

系统是否已启用加密 DNS：可读 Network Extension / 配置描述（能读多少算多少；读不到则 `partial`）。

### 5.5 WHOIS

- 优先 RDAP（HTTPS JSON），WHOIS 文本协议作 fallback。
- 超时与输出截断；解析失败返回原始截断文本 + `partial`。
- 不缓存无限；遵守源站 ToS / 速率。

---

## 6. IPC（Post-MVP-Adv · design §6.3）

```ts
scanPorts(nodeId, target, range, opts): ScanSessionId
// event network-probe://port-sample

detectDnsPollution(nodeId, domain, resolvers[]): DnsPollution
checkSsl(domain): SslCert
detectArpSpoofing(nodeId): ArpThreat
startPacketCapture(opts): ScanSessionId
// event network-probe://pcap-stat

// DNSSEC/DoH/WHOIS：可 sync 短命令
whois(query): WhoisInfo

// 能力包（D-017）
listCapabilityPacks(): PackInfo[]
installCapabilityPack(packId): PackInstallResult
uninstallCapabilityPack(packId): void
// event network-probe://pack-progress
```

全部进入 `contracts.ts` + `commands.rs`；能力矩阵 `getNetworkProbeCapabilities().tools`（含 `missing_pack`）驱动灰显 / 安装向导。

---

## 7. UX

- 所有危险范围扫描：确认对话框展示**精确目标、端口范围、速率、预计时长**。
- 命令透明：降级路径必须写明，例如 `scanPorts … // degraded: tcp connect`；缺包写 `// missing_pack: adv-scanner`。
- 结果风险色：info / warn / high；high 仅用于「高度疑似劫持/暴露」，避免恐吓式全红。
- Post 标签：L2 与按钮统一 `Post` badge，不进 MVP 验收。
- `missing_pack`：统一 `PackInstallDialog`，不各自为政弹窗。

---

## 8. 验收清单（进入 Adv 实现时）

- [ ] 授权声明可持久化；未确认前不可启动 Adv 扫描
- [ ] D-017：`missing_pack` → 安装向导 → manifest 校验；前端不能传下载 URL
- [x] 本机 Nmap 和尚未接入的 sidecar 分开声明；能力状态必须匹配实际执行路径
- [x] capabilities 的 Nmap/pack 状态与当前真正可调用的扫描引擎一致；端口扫描仅在 Nmap 可运行时标为 `supported`，否则标为 `degraded`
- [x] 自动化覆盖完整 `scanPorts` 在 Nmap 缺失时回退到 loopback TCP connect，并以 fake executable 覆盖 RAW 权限失败后重试 `-sT`；另外覆盖参数隔离/指纹开关、输出截断、超时/取消终止子进程、无效 XML、单主机校验、hostname 单次解析及风险标签。Nmap 真实安装路径和应用内扫描仍需 macOS 真机复验
- [x] 指纹默认关闭；前端回归覆盖 opt-in 与确认，Rust 参数回归覆盖 `-sV --version-light` / 有限 `-O`、TCP 降级不运行 OS 探测，且不添加 NSE 脚本
- [ ] 无攻击类 API；代码审不出现投毒/注入/爆破入口
- [ ] pcap 默认统计模式；落盘需显式开关
- [ ] 速率/CIDR/端口硬顶后端强制（不信任前端）
- [ ] 与 port-manager 边界测试：占用 vs 存活

---

## 9. 参考

- NETworkManager Port Scanner / WiFi Analyzer：分工具、可配置速率
- [Nmap service/version detection](https://nmap.org/book/man-version-detection.html)、[OS detection](https://nmap.org/book/man-os-detection.html)、[target specification](https://nmap.org/book/man-target-specification.html)、[timing and performance](https://nmap.org/book/man-performance.html)（官方语义对照，非捆绑义务）
- rust-pcap · pnet · hickory DNSSEC
- Apple Network Extension（加密 DNS / 透明代理——只读检测，不实现自有 VPN 攻击面）
- [D-017](../../explanation/decisions.md) 可选能力包 · [design §9.7](./design.md)
