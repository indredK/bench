# Network Probe — 实施路线

> 配合 [README.md](./README.md) 与 [design.md](./design.md)。勾选代表已完成。
> **当前状态**：**模块 1.0 / MVP A+B 已闭环**（D-016，2026-07-22）；剩余 = Post-MVP（C / Adv / Polish）+ Vision P5–P7。
> **范围口径**：
>
> - **已交付（1.0）**：Local 急救箱体检 +「上不了网」+ traceroute/MTR + 基础鉴别工具。
> - **待交付**：指纹增强、特权 helper、Globalping ping/http/token、agent 远程执行、Vision Wave 6。
> - 硬性红线见文末；能力细节与选型见 [design.md](./design.md)。

---

## 范围一览

| 档位                | 含什么                                                                   | 文档位置           | 状态                                   |
| ------------------- | ------------------------------------------------------------------------ | ------------------ | -------------------------------------- |
| **MVP-A / MVP-B**   | Local L0→L3、站点延迟、Advisor、修复、traceroute、「上不了网」、基础探测 | 下方「已交付」     | ✅ 已闭环                              |
| **Post-MVP-C**      | librespeed 测速、Globalping remote、自有 agent、多节点对比               | 「剩余」Wave 2     | ✅ 测速 + Globalping DNS + agent 骨架  |
| **Post-MVP-Adv**    | D-017 packs、SYN/ARP/指纹/污染/抓包、mDNS/NAT/NTP/DNSSEC/WHOIS           | 「剩余」Wave 1/3/4 | ✅ 主路径已交付；指纹/特权 helper 仍待 |
| **Post-MVP-Polish** | 虚拟化、监控告警、报告历史、关键测试                                     | 「剩余」Wave 0/5   | 部分随档穿插                           |
| **Vision P5–P7**    | 配置向导、重型抓包、企业网管、授权漏扫                                   | 「剩余」Wave 6     | 设计保留 · 最远                        |

---

## 已交付（模块 1.0 / MVP A+B）

> 历史细节以 Git 为准；此处只保留验收摘要。

- 后端 `net_probe/`：summary / tcp / ping / dns / probe / sites / health / fix / offline / traceroute / ipv6 / mtu / asn / session / defaults / capabilities
- 前端 L1×4 壳 + 基础/测试面板可用；安全/发现为 ComingSoon + Post 徽标
- 场景：MVP 档（S-FA / S-TT / S-X 除 S-X-05）可演示
- 验证链：`lint:fe` + `test:critical` + `clippy -D warnings` 通过

---

## 剩余 backlog · 建议实施波次

> **目标**：把规划功能做完。波次按依赖排序（先地基后消费方）。
> **红线不变**：不实现 ARP 攻击 / MITM 注入 / DoS / 爆破。
> **与 Bench 2.0**：本模块仍不进 R00–R10（D-016）；可并行，争用人力时优先 2.0。

- [x] Wave 0 · P0-2 Advisor 纯函数单测 + defaults overlay 单测
- [x] Wave 0 · P0-3 Defaults 用户覆盖 / 重置 IPC（`save/reset`）
- [x] Wave 0 · P0-4 ping 流式 `pingSample` 事件
- [x] Wave 1 · D-017 packs 骨架：manifest / list / install(marker) / uninstall / capabilities.`missing_pack` / `PackInstallDialog`

### Wave 0 · Polish 基线（可与任意波次并行）

| ID   | 项                                                         | 场景 / 设计           | 依赖 | 预估 | 状态 |
| ---- | ---------------------------------------------------------- | --------------------- | ---- | ---- | ---- |
| P0-1 | MVP 面板空态 / 失败态 / 重入与取消一致性扫尾               | S-X-\* · coding §3/§5 | 无   | S    | ⬜   |
| P0-2 | 关键测试：契约 · cancel 幂等 · Advisor 纯函数 · 无特权降级 | roadmap Polish        | 无   | M    | ◐    |
| P0-3 | Defaults 用户覆盖与重置                                    | defaults.md           | 无   | S    | ✅   |
| P0-4 | ping 流式 `pingSample` 事件                                | design-test           | 无   | S    | ✅   |

### Wave 1 · D-017 能力包基础设施（Adv 前置硬依赖）

| ID   | 项                                                                          | 场景 / 设计                 | 依赖 | 预估 | 状态                                                    |
| ---- | --------------------------------------------------------------------------- | --------------------------- | ---- | ---- | ------------------------------------------------------- |
| A1-1 | `packs.rs` + canonical manifest（packId / hash / 签名来源）                 | D-017 · design §9.7         | 无   | L    | ✅                                                      |
| A1-2 | IPC：`list/install/uninstallCapabilityPack`；进度 event；**禁止前端传 URL** | S-X-05                      | A1-1 | L    | ✅（marker + hash-fail 测试通道；sidecar 下载路径已留） |
| A1-3 | capabilities：`missing_pack` / `packs` 字段刷新                             | S-X-04 · S-X-05             | A1-1 | M    | ✅                                                      |
| A1-4 | 前端 `PackInstallDialog` + 安装/卸载 UX                                     | S-X-05 · design-security §3 | A1-2 | M    | ✅                                                      |

建议 pack id：`adv-scanner` · `pcap-diag` · `priv-helper`（已发布勿乱改）。

### Wave 2 · Post-MVP-C · 测速与多节点

| ID   | 项                                                       | 场景 / 设计             | 依赖         | 预估 |
| ---- | -------------------------------------------------------- | ----------------------- | ------------ | ---- |
| C2-1 | librespeed 带宽测速（公共/自建源 · 配额护栏）            | S-TT-04 · design §11.3  | 无           | L    | ✅（硬上限 32/8MB + 冷却）                  |
| C2-2 | Globalping 代理：remote ping/traceroute/dns/http + token | design §11.1            | node 路由    | L    | ◐（DNS multi 已交付；ping/http/token 待）   |
| C2-3 | 自有 agent：TLS / 鉴权 / 限速；`nodeId` 贯通             | S-DIS-05 · design §11.2 | node 路由    | XL   | ◐（HTTPS 注册/健康检查/白名单；远程执行待） |
| C2-4 | `listProbeNodes` 扩展 + `store.byNode` 多节点对比 UI     | S-DIS-04 · design §4.3  | C2-2 或 C2-3 | L    | ✅（DNS 对比 UI）                           |
| C2-5 | remote / 测速源不可用时的降级提示                        | design §9               | C2-1/2       | S    | ✅                                          |

> Wave 2 与 Wave 3 **可并行**（测速不依赖 packs；SYN/抓包依赖 Wave 1）。

### Wave 3 · Post-MVP-Adv · 安全 Tab

| ID   | 项                                                      | 场景 / 设计     | 依赖       | 预估 |
| ---- | ------------------------------------------------------- | --------------- | ---------- | ---- |
| S3-0 | 安全 Tab 授权声明 + 设置持久化                          | S-SEC-01        | 无         | S    | ✅                           |
| S3-1 | 污染检测（DNS / hosts / 轻量 TLS MITM 迹象 / 路由绕行） | S-SEC-02        | 无（主包） | L    | ✅                           |
| S3-2 | WHOIS 面板                                              | S-SEC-05        | 无         | M    | ✅                           |
| S3-3 | DNSSEC / DoH·DoT 可达与验证链                           | S-SEC-05        | 无         | L    | ✅（Cloudflare DoH AD 位）   |
| S3-4 | 端口扫描：TCP connect 降级路径（主包）                  | S-SEC-03        | 无         | M    | ✅                           |
| S3-5 | 端口扫描：SYN + 速率护栏（`adv-scanner` / 本机 nmap）   | S-SEC-03        | Wave 1     | L    | ✅（本机 nmap -sS/-sT 回退） |
| S3-6 | 服务 / OS 指纹 + 风险标注                               | design-security | S3-5       | L    | ⬜                           |
| S3-7 | 诊断抓包（重传/乱序/RST 统计；`pcap-diag`）             | S-SEC-04        | Wave 1     | XL   | ✅（tcpdump 计数降级）       |
| S3-8 | 特权分层：helper / 触发提权 / 自动降级文案              | design §11.4    | Wave 1     | L    | ⬜                           |

### Wave 4 · Post-MVP-Adv · 发现 Tab

| ID   | 项                                                    | 场景 / 设计         | 依赖        | 预估 |
| ---- | ----------------------------------------------------- | ------------------- | ----------- | ---- |
| D4-1 | ARP / 局域网发现（特权 RAW；无特权 ping 扫 degraded） | S-DIS-01            | 可选 Wave 1 | L    | ✅（arp-cache + tcp /24 + 可取消；特权扫仍待） |
| D4-2 | ARP 欺骗**检测**（与安全污染复用 backend）            | S-SEC-02 · S-DIS-01 | D4-1        | M    | ✅（只读 MAC 冲突提示）                        |
| D4-3 | mDNS/DNS-SD + SSDP/UPnP 浏览                          | S-DIS-02 · §12.2 #6 | 无          | L    | ✅（只读）                                     |
| D4-4 | NAT 类型（STUN）                                      | S-DIS-03 · #7       | 无          | M    | ✅（多 STUN）                                  |
| D4-5 | NTP 时间偏移                                          | S-DIS-03 · #9       | 无          | M    | ✅（多源中位数）                               |
| D4-6 | 发现壳 + 与多节点（C2-4）串联                         | design-discover     | Wave 2 可选 | M    | ✅                                             |

### Wave 5 · Polish 增强（产品化）

| ID   | 项                                 | 场景 / 设计  | 依赖     | 预估 | 状态 |
| ---- | ---------------------------------- | ------------ | -------- | ---- | ---- |
| P5-1 | 长列表虚拟化（端口 / 跳点 / 设备） | UX-STANDARDS | Wave 3/4 | M    | ⬜   |
| P5-2 | 持续监控 / 阈值告警                | §12.2 #8     | Wave 0   | L    | ⬜   |
| P5-3 | 健康报告历史快照 + 跨时间对比      | §12.2 #11    | 报告已有 | L    | ◐    |
| P5-4 | 一体化 BasicView 视觉合并          | design-basic | 无       | M    | ⬜   |

### Wave 6 · Vision P5–P7（远期 · 体积与合规风险最高）

| ID   | 项                                                       | 说明              | 预估 |
| ---- | -------------------------------------------------------- | ----------------- | ---- |
| V6-1 | 网络配置向导（静态 IP / 路由 / VPN / 防火墙 · 三次确认） | P5                | XL   |
| V6-2 | 重型抓包（会话重组 / 应用层解码 · 按需加载）             | P5 · 强依赖 pack  | XL   |
| V6-3 | 邮件 SPF/DKIM/DMARC、RBL、邮件服务器诊断                 | P6                | L    |
| V6-4 | SNMP / BGP / VLAN 企业网管                               | P6                | XL   |
| V6-5 | 按进程流量监控（nethogs 类）                             | P6 · 可独立子模块 | L    |
| V6-6 | 授权资产审计（nuclei/amass 风格 · **仅授权资产**）       | P7 · 强授权 UX    | XL   |

---

## 推荐开工顺序（默认）

```text
Wave 0（小扫尾）─┬─► Wave 1（D-017 packs）──► Wave 3（安全）──► Wave 4（发现）
                 └─► Wave 2（测速 / Globalping）──► Wave 4.nodes / C2-4
                              └─► Wave 5（产品化 Polish）
                                       └─► Wave 6（Vision，需单独授权范围）
```

**建议首刀**：`Wave 0` 小项 + `Wave 1` packs 骨架，或并行 `Wave 2` 的 `C2-1` 测速（不依赖 pack）。

---

## 场景覆盖（剩余）

| 档位     | 场景 ID                          | 对应波次   |
| -------- | -------------------------------- | ---------- |
| Post-C   | S-TT-04, S-DIS-04, S-DIS-05      | Wave 2     |
| Post-Adv | S-SEC-01…05, S-DIS-01…03, S-X-05 | Wave 1/3/4 |
| 全程     | S-X-06 红线负向                  | 每波验收   |

MVP 场景（S-FA-\* / S-TT-01…03 / S-X-01…04 / S-X-07）属 1.0，回归即可。

---

## 硬性红线（不实现 · 法律/合规约束，详见 design.md §12.3.2）

- **主动攻击能力**：ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破** → 违法，绝不构建
- 对应**检测/防御**版本属 Post-MVP-Adv（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估 / 弱口令风险提示）
