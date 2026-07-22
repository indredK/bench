# Network Probe — 实施路线

> 配合 [README.md](./README.md) 与 [design.md](./design.md)。勾选代表已完成。
> **当前状态**：全局设计 + L1 四分册 + 场景用例 + **Defaults 目录**已齐（[defaults.md](./defaults.md)），**暂不进入实现**（决策 2）。前端仅有占位 feature。
> **范围口径（2026-07-22）**：
>
> - **MVP（首版交付）= A + B**：Local 急救箱体检 +「上不了网」高频诊断 + traceroute/MTR。
> - **Post-MVP（仍须完整设计，不删）**：测速 / Globalping·agent 多节点、高级安全探测、打磨项、P5–P7 愿景。
> - 硬性红线见文末；能力细节与选型见 [design.md](./design.md)。

---

## 范围一览

| 档位                | 含什么                                                                                                                         | 文档位置           | 实现优先级         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------ |
| **MVP-A**           | Local L0→L3 体检（含 DNS/IP 对照、hosts/路由/防火墙只读）、站点延迟看板、Advisor、免特权修复、TCP connect/自定义探测等基础工具 | 下方「MVP」P0–P1   | 首版               |
| **MVP-B**           | Traceroute/MTR；Captive / 公网 IP·ASN / 代理·VPN / IPv6 / MTU                                                                  | 下方「MVP」P1–P2   | 首版（与 A 同批）  |
| **Post-MVP-C**      | librespeed 测速、Globalping remote、自有 agent、多节点对比                                                                     | 「Post-MVP」C      | 设计保留，实现靠后 |
| **Post-MVP-Adv**    | SYN/ARP/指纹/污染/抓包/特权 helper、mDNS/NAT/NTP/DNSSEC                                                                        | 「Post-MVP」Adv    | 设计保留，实现靠后 |
| **Post-MVP-Polish** | 虚拟化、持续监控、报告历史、全量 i18n/测试打磨                                                                                 | 「Post-MVP」Polish | 随各档交付补齐     |
| **Vision P5–P7**    | 配置向导、重型抓包、企业网管、授权漏扫                                                                                         | 「Vision」         | 设计保留，远期     |

---

## MVP（首版交付 = A + B）

### P0 地基（后端模块 + Local 基础探测）

- [ ] 新建 `src-tauri/src/net_probe/` 模块（commands / types / state / node）
- [ ] 接入 crate：`surge-ping`、`hickory-resolver`、`netdev`、`if-addrs`、`reqwest`（MVP 免特权底座）
- [ ] **Defaults 目录落地**〔[defaults.md](./defaults.md)〕：内置 JSON（DNS / reach / Captive / 公网 IP / 站点包 / MTU）；用户覆盖与重置；多源故障转移 + TTL
- [ ] `pingHost` 升级版：延迟 / 抖动 / 丢包 + 流式 `pingSample`（替换旧 diagnostics 仅延迟）
- [ ] `dnsLookup`：A/AAAA/CNAME/MX/TXT + 指定 resolver + TTL
- [ ] **基础鉴别工具**〔design §5.7 / §6.1〕
  - [ ] `getLocalNetworkSummary` / `getDefaultRoute`
  - [ ] `tcpConnect(host, port)`
  - [ ] `probeTarget`（自定义 host/URL；HTTP(S)+可选 ICMP；轻量 TLS 摘要）
  - [ ] `checkHostsOverrides` / `getFirewallStatus`（不支持则 `unsupported`）
  - [ ] `openSystemNetworkSettings`
- [ ] `listProbeNodes` + `nodeId` 路由骨架（**MVP 仅 `local`**；remote 槽位预留，见 Post-MVP-C）
- [ ] 按 [design §13](./design.md) 落地与 `dev-toolbox` / `system-settings` ping 的边界：共用 `net_probe` 实现，禁止双份算法；diagnostics 改为跳转或薄封装
- [ ] `getNetworkProbeCapabilities()` + 前端按 [design §14](./design.md) 矩阵灰显/降级

### P1 综合体检（MVP-A 核心 + MVP-B「上不了网」）

- [ ] `health.rs` 编排 L0→L3，流式 `healthEvent`；**检查项 key 对齐 [design §5.4.1](./design.md)**（缺项不算完成）
- [ ] **DNS vs 纯 IP 对照**合成项 `diff.dns_vs_ip`〔§5.4.2〕+ Advisor 规则
- [ ] `advisor_rules` + 前端 `network-probe.advisor.ts`（扫描意见，精简可操作 [决策7]）
- [ ] 前端 `BasicView`：NetworkSummaryHeader + HealthTree + ScanOpinion + ComprehensiveScan + QuickTools
- [ ] **命令透明 UI**〔design §3.5〕：控件 hover 显示 IPC；侧栏/结果区命令日志；体检项展开显示 `commandHint`（对照 [prototype.html](./prototype.html)）
- [ ] **导航记忆**〔design §3.1〕：记住当前 L1、各 L1 上次 L2、「上不了网」子页；切换回来不丢；建议保留各 L3 最近结果直至重跑
- [ ] 可自愈修复：`flushDns` / `switchDns` / `renewDhcp`（高危 `resetNetworkStack` **三次确认** [决策4]）
- [ ] 健康报告导出（JSON/Markdown）
- [ ] **固定站点延迟探针**（常驻看板：预设+自定义、并发 ping/HTTP、火花线、阈值）〔design §12.5〕
- [ ] **「上不了网」高频故障诊断**（MVP-B，〔design §12.2 #1–5〕）
  - [ ] Captive Portal 检测〔#2〕
  - [ ] 公网出口 IP + ASN / 地理归属〔#3〕
  - [ ] 系统代理 / PAC / VPN 隧道检测〔#5〕
  - [ ] IPv6 全栈：NDP + ICMPv6 traceroute + 双栈连通性对比〔#1〕
  - [ ] MTU / PMTUD 路径 MTU 黑洞检测〔#4〕

### P2 Traceroute / MTR（MVP-B 路径视角）

- [ ] 接入 `trippy-core`（不自研 traceroute）；特权不足时 UI 降级提示〔design §2 / §11.4〕
- [ ] `traceroute.rs`：每跳 loss% / 延迟 / AS·运营商
- [ ] 前端 `TraceroutePanel`：跳点表 + MTR 着色

**MVP 验收（实现期）**：上述勾选完成；[scenarios.md](./scenarios.md) 中档位=MVP 的场景可演示；`lint:fe` + `test:critical` + 相关 Rust 测试通过；macOS 主路径可用；无特权场景有明确降级文案。

---

## Post-MVP（设计保留 · 不进首版交付）

> 下列能力**必须在 design.md 中保持完整设计**（选型、协议、降级、护栏），roadmap 只跟踪未完成项。实现顺序可在进入 /feature 前再排期。

### C · 测速与分布式多节点〔决策 5/6〕

- [ ] **带宽测速**（librespeed 协议，公共/自建多源可选）〔design §11.3〕
- [ ] **Globalping 代理**：remote 分布式 ping / traceroute / mtr / dns / http〔design §11.1〕
- [ ] **自有 agent**：TLS / 鉴权 / 限速；`nodeId` 路由贯通〔design §11.2〕
- [ ] 多节点结果对比视图（`store.byNode`）
- [ ] 无可用 remote / 测速源时的降级提示

### Adv · 安全向探测与高级面板（高级视角）

- [ ] **可选能力包基础设施（D-017）**：`packs.rs` + canonical manifest；`list/install/uninstallCapabilityPack`；`missing_pack` 进 capabilities；`PackInstallDialog`；禁止前端传下载 URL〔design §9.7〕
- [ ] `ports.rs`：SYN stealth + 速率/重试；无特权 → TCP connect；无 pack → `missing_pack` 或 degraded〔design §5.1 / §11.4〕
- [ ] `fingerprint.rs`：服务 / OS 指纹 + 风险标注
- [ ] `host_discovery.rs`：ARP 局域网发现；无特权 → ICMP/ping 扫
- [ ] 污染检测：DNS / hosts / 证书 MITM / ARP 欺骗 / 路由异常绕行
- [ ] `packet_capture.rs`：诊断级抓包（重传 / 乱序 / RST）；可绑定 `pcap-diag` pack
- [ ] 特权分层落地：helper pack / 触发式提权 / nmap 本机探测 / sidecar / 自动降级〔design §11.4〕
- [ ] 前端 `AdvancedView` / SecurityView 各面板
- [ ] DNS / WHOIS / SSL 面板补齐
- [ ] mDNS/DNS-SD + SSDP/UPnP〔§12.2 #6〕
- [ ] NAT 类型检测（STUN）〔#7〕
- [ ] NTP 时间同步偏移〔#9〕
- [ ] DNSSEC / DoH·DoT〔#10〕

### Polish · 打磨（随各档交付补齐，不绑死 MVP 关门）

- [ ] 长列表虚拟化（端口 / 跳点 / 设备）
- [ ] 取消幂等、重入保护、断网 / 空态 / 失败态
- [ ] i18n 全量 `networkProbe.*` key
- [ ] 持续监控 / 阈值告警〔§12.2 #8〕
- [ ] 健康报告历史快照 + 跨时间对比〔#11〕
- [ ] 关键测试矩阵（契约 / 取消幂等 / 无特权降级 / Advisor 纯函数）

---

## Vision P5–P7（远期设计保留）

### P5 网络配置向导与重型诊断

- [ ] 网络配置向导（静态 IP / 路由 / VPN / 防火墙；向导式 + 三次确认）〔design §12.3.1〕
- [ ] 重型抓包（会话重组 / 应用层解码，按需加载）

### P6 企业网管 / 服务端运维 / 流量监控

- [ ] 邮件 SPF/DKIM/DMARC、RBL、邮件服务器诊断
- [ ] SNMP / BGP / VLAN 等企业网管面板
- [ ] 按进程流量监控（nethogs 类，可独立子模块）

### P7 安全审计（授权范围）

- [ ] 授权资产审计：nuclei / amass 风格（**仅限授权资产/自有域名**，不做无差别大规模扫描）

---

## 硬性红线（不实现 · 法律/合规约束，详见 design.md §12.3.2）

- **主动攻击能力**：ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破** → 违法，绝不构建
- 对应**检测/防御**版本属 Post-MVP-Adv（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估 / 弱口令风险提示）
