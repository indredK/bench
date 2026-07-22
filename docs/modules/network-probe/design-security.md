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

> 全局约束见 [design §9.7](./design.md) 与 [DECISIONS D-017](../../DECISIONS.md)。本 Tab 是 **sidecar / 本机工具** 的主消费方。

### 3.1 哪些要包、哪些不要

| 能力                                                                  | 供给方式                              | 说明                                           |
| --------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| TCP connect 降级扫描、污染里的 DNS/hosts/轻量 TLS、WHOIS、DNSSEC 只读 | **主包或轻量编译**                    | 无重内核依赖时可进主包；勿强行拆下载           |
| SYN stealth、深度 ARP、指纹增强                                       | 可选包 `adv-scanner` 和/或本机 `nmap` | 首次点击若 `missing_pack` 且无 nmap → 安装向导 |
| 诊断抓包                                                              | 可选包 `pcap-diag`                    | 依赖 libpcap + 通常需特权                      |
| 正式特权 helper                                                       | 可选包 `priv-helper`                  | 公证前仅提示限制（D-010）                      |

### 3.2 点击流（强制）

```text
用户打开「端口扫描」
  → getNetworkProbeCapabilities()
  → tool=missing_pack 且无 external nmap
      → PackInstallDialog：用途 / 体积 / 版本 / 签名来源 / Gatekeeper 提示
      → 用户同意 → installCapabilityPack(packId)  // 无 URL 参数
      → 后端读 canonical manifest → 下载到 App Support → 校验 hash/签名
      → 刷新 capabilities → 若仍需特权再走提权/降级
  → tool=degraded（仅有 connect）→ 可直接跑，并提示「安装 adv-scanner 可启用 SYN」
  → tool=supported → 正常扫描
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
- 同时探测到本机 `nmap` 时：优先提示「检测到 nmap，可直接增强」；仍允许安装官方 sidecar（二选一或并存由 capabilities 决定）。
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

| 模式        | 条件             | 行为                                                                           |
| ----------- | ---------------- | ------------------------------------------------------------------------------ |
| SYN stealth | 有 RAW/pcap 特权 | 发 SYN，pcap 匹配 SYN-ACK/RST；**不回 RST 完成握手**（减少日志噪音，仍属探测） |
| TCP connect | 无特权默认       | `connect()` 超时矩阵；能力标 `degraded`                                        |

护栏：

- 默认目标：RFC1918 / 本机 / 用户显式单个公网 host。
- 大端口范围、公网、大 CIDR：二次确认 + 速率硬顶 + 并发上限。
- 进度 event：`port-sample`（port、state、serviceHint?）；`cancelScan` 幂等。

库：`socket2` + `pnet`/`etherparse` + 可选 `pcap`；无 turnkey「完整 nmap」Rust 库——可接受薄封装或 nmap CLI fallback。

指纹（可选同面板）：匹配常见 banner/端口→服务名风险标签；**不做**漏洞利用。

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

| 能力   | 实现要点                                                          |
| ------ | ----------------------------------------------------------------- |
| DNSSEC | `hickory-resolver` 开启验证；结果：secure / bogus / insecure      |
| DoH    | HTTPS POST/GET 到可信 DoH URL（可配）；测延迟与是否被劫持到非 TLS |
| DoT    | TLS 853；证书校验                                                 |

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
- [ ] 本机 nmap 探测与 sidecar 并存策略有明确 capabilities 语义
- [ ] SYN→connect 降级路径单测 + 真机
- [ ] 无攻击类 API；代码审不出现投毒/注入/爆破入口
- [ ] pcap 默认统计模式；落盘需显式开关
- [ ] 速率/CIDR/端口硬顶后端强制（不信任前端）
- [ ] 与 port-manager 边界测试：占用 vs 存活

---

## 9. 参考

- NETworkManager Port Scanner / WiFi Analyzer：分工具、可配置速率
- nmap host discovery & port states（语义对照，非捆绑义务）
- rust-pcap · pnet · hickory DNSSEC
- Apple Network Extension（加密 DNS / 透明代理——只读检测，不实现自有 VPN 攻击面）
- [D-017](../../DECISIONS.md) 可选能力包 · [design §9.7](./design.md)
