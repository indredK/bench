# Network Probe（网络探测 / 网络急救箱）产品说明

> 本文件是 network-probe 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。
> 规划/未完成项见 `../planned/network-probe.md`；详细设计见 `../modules/network-probe/`（design*.md、roadmap.md、defaults.md）。

## 1. 定位

- **独立一级 feature**（`desktopOnly: true`，非 Bench 2.0 主序列，与 2.0 并行旁路），入口：路由 `/network-probe`，侧边栏注册。
- 用途：**网络急救箱 + 专业探测工具链**。对标 360 断网急救箱、NETworkManager、安全探测工具链。硬红线：**只检测、不攻击**（不做 ARP 欺骗攻击 / MITM 注入 / DoS / 爆破）。
- 平台：macOS 主路径（Local Network / 系统能力）；Windows 降级；Linux 非目标。
- 状态口径：模块 1.0 / MVP A+B 已闭环；Post-MVP（测速 · 多节点 · 安全 · 发现）主路径已交付，指纹增强与特权 helper 仍待（见 planned）。

## 2. 界面总览（L1×5 壳 + L2 底栏）

```
┌──────────────────────────────────────────────────────────────┐
│ L1 顶栏（basic/sites/test/security/discover + 节点选择 + 能力包）│
├──────────────────────────────────────────┬───────────────────┤
│ 面板区（L2 内容，依 L1 而定）               │ 命令日志侧栏        │
│                                          │ (280px, 可折叠)    │
├──────────────────────────────────────────┴───────────────────┤
│ L2 底栏（当前 L1 的子面板切换，带 Post 徽标）                   │
└──────────────────────────────────────────────────────────────┘
```

- **L1 顶栏**：logo 圆点 + 标题 + 5 个一级 Tab（基础/站点延迟/测试/安全/发现）；右侧**探测节点选择器**（local + 已注册 remote agent/Globalping 节点）、**能力包管理按钮**（打开 PackInstallDialog）。
- **面包屑 + capabilities 横幅**：面板标题下显示 `L1 / L2 [/ offline 子项] · platform=… privilege=…`。
- **错误横幅**：`error` 非空时在面板上方显示（红框）。
- **安全授权条（SecurityAuthGate）**：仅 L1=security 时显示——未授权时琥珀色提示 +「确认」按钮；已授权显示「已授权」+「撤销」；授权状态持久化于 localStorage（`network-probe:security-authorized`）。
- **命令日志侧栏**：右侧 280px（折叠为 2.25rem 窄条），滚动展示每次探测的 `invoke` 命令文本 + 结果/取消/耗时摘要（时间戳前缀），可清空（二次确认）；开合状态持久化于 sessionStorage（`network-probe:side-log-open`）。
- **L2 底栏**：当前 L1 的子面板按钮列表（见下表），Post-MVP 面板带「Post」徽标。

L1 → L2 映射：

| L1       | L2（子面板）                                                  |
| -------- | ------------------------------------------------------------- |
| basic    | overview · tree · opinion · offline · fix · report            |
| sites    | official · packs                                              |
| test     | ping · dns · tcp · custom · traceroute · mtu · egress · speed |
| security | ports · pollution · pcap · dnssec · whois                     |
| discover | arp · lan-svc · nat · ntp · nodes                             |

- 导航状态（当前 l1 / 各 l1 的 l2 / offline 子项）持久化于 sessionStorage（`network-probe:nav`）。
- 未实现面板统一显示 ComingSoon 占位：显示当前工具 status（如 `portScan=missing_pack`）、外部工具（nmap）是否存在、能力包缺失提示与「管理能力包」按钮。

### 全局交互与反馈细节

- **bootstrap 加载**：首次进入 `bootstrap()` 并行拉取 capabilities / defaults / packs / nodes；任一失败在顶部错误横幅展示 `networkProbe.errors.bootstrapFailed`（可重试，重进页面或刷新按钮触发），不阻断其余面板。
- **错误横幅**：`error` 非空时面板上方红框展示，文案优先本地化 `networkProbe.errors.<tool>Failed`，兜底后端 `message`；每个操作开始前 `setError(null)`，结束（成功或失败）后由用例设置或清除，单条错误会随下一次操作被清掉。
- **每工具 loading 独立 + 防重入**：`loading*`（每工具一个）为真时对应「运行」按钮禁用并显示运行中文案（如「Ping → 探测中…」）；use-case 入口统一 `if (store.loadingX) return` 短路，同一工具不可并发、不同工具可并行。无 loading 标志的动作（如刷新网络服务、打开系统设置）无禁用态。
- **能力降级**：`toolEnabled=false`（status 为 `unsupported`/`missing_pack`）时按钮禁用并显示 toolDisabled 提示（`{{tool}} status={{status}} — 已按能力矩阵禁用`）；缺 pack 的工具给出「管理能力包」入口跳转 PackInstallDialog。
- **命令日志侧栏**：每个探测命令追加一行时间戳日志（`appendCommandLog`），运行中/成功/失败/取消均有摘要；可折叠（sessionStorage 记忆）、清空需二次确认。
- **键盘**：各面板均为表单 + 按钮触发（Enter 提交表单）；无全局快捷键（见 §9）。

## 3. 基础（basic）L1

### 3.1 网络概览 overview

- 首次进入自动拉取；信息卡网格：IPv4 / IPv6 / 网关 / DNS 服务器 / Wi-Fi（SSID + dBm）/ 防火墙状态 / hosts 可疑条目数 / 非回环接口数。
- 按钮：刷新、打开系统网络设置。数据源 `getLocalNetworkSummary` + `getFirewallStatus` + `checkHostsOverrides`。

### 3.2 体检树 tree（L0–L3 健康扫描）

- 点击「运行体检」→ 后端 `runHealthScan` 逐项流式推送 `health-item` 事件，面板按层分组（L0 网络层 / L1 网关 / L2 DNS / L3 公网）实时渲染；每项显示 key、状态徽标（pass/warn/fail/error/skip）、detail、commandHint。
- 运行中可「取消」（走会话取消）；完成后显示耗时与「已取消」标记；未取消的结果自动加入报告历史。
- 空态提示 + 顶部命令提示（CommandHint）。

### 3.3 体检建议 opinion（Advisor）

- 展示 `healthResult.opinions`：每条建议按严重级别（critical/warn/info）着色卡片，含标题（i18n key）、正文、相关检查 key 列表。无结果时提示「先去运行体检」，可跳转 tree。

### 3.4 上不了网 offline（子导航 captive/proxy/ipv6/mtu/egress/diff）

- 子导航胶囊：全部 / 强制门户 / 代理·VPN / IPv6 / MTU / 公网出口 / 对比。
- 「一键诊断」并发执行：检测强制门户（CaptivePortal）、公网 IP（egress）、代理/VPN 状态、IPv6 栈、路径 MTU。
- **一键诊断为 all-or-nothing**（`runOfflineDiagnostics` 内 `Promise.all` 并发 5 项）：任一子项失败即整体失败，错误横幅 `networkProbe.errors.offlineFailed`，已成功的子项结果**不落 store**；要逐项结果可改用各子面板单独运行（refreshPublicIp / checkIpv6Stack / probePathMtu 各自独立错误码与 loading，与「一键诊断」互不抢占 `loadingOffline`——注意 refreshPublicIp 与 runOfflineDiagnostics 共用 `loadingOffline`，同一时刻不可并行）。
- 各子区块（依焦点显示）：
  - captive：状态（normal/captive/…）、detail、commandHint。
  - egress：公网 IP、来源、ASN/org、detail。
  - proxy：系统代理开关、VPN 接口列表、默认路由是否走隧道（warn）。
  - ipv6：IPv6 栈状态、双栈对比 detail（`Ipv6Panel` 可单独运行）。
  - mtu：路径 MTU 状态/数值，可跳转 Test→MTU 完整面板（`MtuPanel`）。
  - diff：对比说明文案（提示用不同出口对比）。

### 3.5 修复 fix（权限无关修复中心）

- 操作对象：网络服务下拉（自动优先 Wi-Fi → 有线 → 首个） + DNS 预设下拉（来自 defaults）。
- 操作按钮：**刷新 DNS**（DestructiveConfirm 一次确认）、**切换 DNS**（两步确认，第 2 步展示服务与目标 DNS 服务器）、**续租 DHCP**（两步确认）、**重置网络栈**（**TripleDestructiveConfirm 三步确认 + 手输 `RESET`**，最高危）、打开系统网络设置。
- 所有修复需加载网络服务列表；完成后展示结果（action / ok / message / commandHint）。

**交互细节**：

- 服务下拉自动优先 Wi-Fi → 有线 → 首个（正则匹配 `wi-?fi|wlan` → `ethernet|usb` → 首项），未加载完成前按钮 `disabled`；DNS 预设默认选中第一项。
- **各修复按钮禁用条件细化**：刷新 DNS 仅需 `!loadingFix`；切换 DNS 需 `service` 非空**且** DNS 预设非空（`servers.length===0` 时禁用，如预设列表为空）；续租 DHCP / 重置网络栈需 `service` 非空；「打开系统设置」无 loading 标志、任何时刻可点。服务/DNS 预设用**原生 `<select>`**（非 shadcn Select），label 以 `htmlFor` 关联。
- 所有修复按钮共用 `loadingFix` 全局禁用（防重入）；刷新 DNS / 切换 DNS / 续租 DHCP / 重置网络栈任一执行中，其余全部按钮禁用。
- 两步确认（切换 DNS / 续租 DHCP）：第 1 步「下一步」→ 延迟 320ms 弹第 2 步（确认服务与目标 DNS 服务器），任一步取消即中止；确认按钮在 `loadingFix` 时显示 loading。
- 三步确认（重置网络栈）：step1 后果说明 → step2 核对参数 → step3 勾选风险确认框 + 手输 `RESET` 才能点「立即重置」；后端忽略前端任何「已确认」标志，每次调用重新校验服务白名单（幂等）。
- 结果卡：`lastResult.action + ok/failed` + message + commandHint；失败不弹 toast，直接在结果卡呈现（修复动作有确定性结果语义）。

### 3.6 报告 report

- 当前体检结果导出：**JSON**（整份 `HealthScanResult`）与 **Markdown**（含每个检查项与建议）浏览器下载；隐私提示文案。
- **历史快照**：最近 10 次未取消体检（localStorage `network-probe:report-history`），显示 sessionId/项数/耗时/建议数，可清空。
- **命令日志**：完整命令列表，可清空。

## 4. 站点延迟（sites）L1

### 4.1 官方站点 official

- 官方站点包（`official` pack）卡片网格；每卡：站点名 + host、状态徽标（idle/ok/fail/running）、最近测试时间 + 延迟（HTTP TTFB 优先，回退 ICMP）、吞吐（HTTP 有界下载，≤1MiB/5s → `downloadMbps`）。
- 顶部「测试全部」+ 统计（总数/OK/失败）；点击单卡只测该站（保留既有结果不丢）；运行中可取消。
- 流式事件 `site-sample` 实时更新卡片；结果按 target 合并去重（指纹去重），单卡多次测试保留历史。

### 4.2 区域站点包 + 自定义 packs

- 区域包下拉（global / cn-friendly / dev / official，取自 defaults.sitePacks 除 official 外全部），运行整包。
- **自定义站点**：输入目标（多个，最多 24 个，去重）→「添加」→「运行自定义」；列表 chip 可逐个移除；持久化于 sessionStorage（`network-probe:custom-sites`）。
- 结果表：每行 id、target · channel（degraded 标记）、Sparkline 迷你趋势线（近 20 次延迟）、ICMP/HTTP/吞吐或失败原因；流式刷新。

## 5. 测试（test）L1

| 面板       | 输入                                                                                     | 输出 / 行为                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ping       | 目标 + 次数（默认 1.1.1.1 / 4）                                                          | ICMP ping；流式 `ping-sample` 逐包；汇总（解析 IP / 收发 / 丢包 / min-avg-max-jitter）；全丢包提示「可能需 Local Network 权限」                                             |
| dns        | 域名 + RR 类型（A/AAAA/CNAME/MX/TXT）+ 解析器（可选，datalist 联想 defaults.dnsPresets） | 解析记录表（RR / data / TTL）、耗时、使用的 resolver                                                                                                                        |
| tcp        | host + port（+ 超时）                                                                    | TCP 连接结果：status / rttMs / message                                                                                                                                      |
| custom     | 目标串                                                                                   | 综合探测：ICMP + HTTP（状态/TTFB/吞吐/下载字节）+ 轻量 TLS（证书存在/握手）                                                                                                 |
| traceroute | 目标 + maxTtl（默认 20）+ rounds（默认 3）                                               | 逐跳流式 `traceroute-hop`；跳点表（TTL / 地址 / ASN+AS名 / 丢包率[>50% 红、>0 琥珀] / avg-best-worst RTT）；显示解析 IP、privilegeMode、耗时；可取消                        |
| mtu        | 目标（默认 1.1.1.1）                                                                     | 路径 MTU 探测：状态 / pathMtu / message                                                                                                                                     |
| egress     | —                                                                                        | 公网出口：IP、来源、ASN/org（复用 offline.egress）                                                                                                                          |
| speed      | 测速源下拉（LibreSpeed 公共源）                                                          | **带宽测速**：流式 `speed-sample` 阶段（ping/jitter/download/upload）；结果卡：ping / jitter / download / upload Mbps；**失败/源不可用进入 30s 冷却**（倒计时禁用）；可取消 |

- 所有探测按钮带 CommandHint（真实命令预览）；`toolEnabled=false` 时显示 toolDisabled 提示。

**交互细节**：

- **输入护栏（后端 clamp/校验）**：ping 次数 clamp `[1,20]`（默认 4）、间隔 clamp `[100,5000]ms`；traceroute `maxTtl` 默认 20、`rounds` 默认 3；端口扫描最多 256 端口（去重后超限返回 `INVALID_INPUT`）；自定义站点最多 24 个且去重；非法 host / 空端口列表返回 `INVALID_INPUT` 并走错误横幅。
- **单工具防重入**：ping / dns / tcp / custom / traceroute / mtu / egress / speed 各自独立 loading，运行中按钮禁用 + 运行中文案，不可重复触发；可取消的长任务（traceroute / speed）运行中同位置显示红色「取消」按钮。
- **ping 全丢包提示**：`packetsReceived === 0` 时命令日志追加「可能需 Local Network 权限」提示（不静默）。
- **测速冷却**：测速源失败/不可达时 `speedCooldownUntil = now + 30s`，期间「开始测速」禁用并倒计时提示（`测速源失败 — {{seconds}} 秒后可重试`），冷却结束自动恢复；取消成功不计入冷却。
- **测速冷却双重防护**：除按钮禁用外，`runSpeedTest` 用例入口 `if (speedCooldownUntil > now) return` 短路（连点/脚本调用也不触发）；冷却以 **500ms interval** 倒计时刷新；**源下拉在 `loading || coolingDown` 时同样 disabled**；结果卡 `unavailable`（`!ok && !cancelled && downloadMbps==null`）额外显示「测速源不可用」琥珀提示。
- **重新运行前状态复位（流式状态机）**：所有可重复探测（health / sites / traceroute / speed / ports / lan / pcap）每次开始时先 `resetXxxStreaming()` 清空上次流式数据 + `setActiveSessionId(null)`；speed 额外 `setSpeedSample(null)` / `setSpeedResult(null)`、ports 额外 `setPortScanResult(null)`，**新一次探测不留旧结果混淆**；`finally` 里统一 `setActiveSessionId(null)` 复位取消可用性。
- **流式采样去重**：`site-sample` / `port-sample` 按 target/port 合并去重（`upsert*`），单卡多次测试保留历史并绘制近 20 次 Sparkline；完成后对未取消的站点包结果保留已测卡片（取消提示「已完成的卡片结果会保留」）。

## 6. 安全（security）L1（全部要求 SecurityAuthGate 已授权）

> 未授权时 use-case 直接报 `securityAuthRequired`，不发起探测。

| 面板      | 说明                                                                                                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ports     | TCP connect 端口扫描（默认 127.0.0.1 / 22,80,443,8080，端口范围语法支持 `,`/`-`）；**目标非内网或端口数 >64 时强制二次确认**（DestructiveConfirm）；流式 `port-sample`；显示开放端口列表、每个端口状态/serviceHint/rtt、degraded 提示（本机 nmap -sS/-sT 可用时回退） |
| pollution | DNS 污染检测：对域名跑检测（本地 + 公共 DNS 对照），输出 `PollutionReport`（finding 列表）                                                                                                                                                                            |
| pcap      | 诊断抓包（`pcap-diag`，默认 5s）：重传/乱序/RST 统计；无特权时 tcpdump 计数降级；可取消；缺 pack 时引导安装 `pcap-diag`                                                                                                                                               |
| dnssec    | DNSSEC 校验（Cloudflare DoH AD 位验证链），输出 `DnsSecCheckResult`                                                                                                                                                                                                   |
| whois     | WHOIS 查询（任意 query），输出 `WhoisInfo`                                                                                                                                                                                                                            |

**交互细节**：

- **SecurityAuthGate**：未授权时 L1=security 显示琥珀色提示 + 「我确认 — 启用安全工具」按钮；点击后 `authorizeSecurity` 置位并持久化 localStorage；已授权显示「本机已授权使用安全工具。」+「撤销」；授权/撤销即时生效。未授权点击任何安全工具，use-case 直接 `setError(securityAuthRequired)` 且不发起 IPC。
- **端口扫描确认**：目标非内网（非私有/回环）或展开端口数 >64 时，点击「扫描端口」先弹 `DestructiveConfirmDialog`（展示目标 + 约 N 个端口 + 「仅扫描自有或已授权资产，当前为 TCP connect」），确认「仍然扫描」才执行；勾选范围内可免确认。端口范围解析失败（如超 256、非法语法）由后端返回 `INVALID_INPUT`。
- **空态细分（arp）**：按 `emptyReason` 区分「权限不足（引导打开系统网络设置）/ 客户端隔离（仅网关响应）/ 安静网络（无邻居）」三种空态文案，不统一显示空。

## 7. 发现（discover）L1

| 面板    | 说明                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| arp     | 局域网发现：ARP 缓存 + TCP /24 扫（degraded；特权 RAW 扫待 helper）；输出邻居表（ip/mac/iface/source）；空态区分 权限不足（引导开 Local Network 权限）/隔离/安静；可取消                                                              |
| lan-svc | mDNS/DNS-SD + SSDP/UPnP 服务浏览（只读），输出 `LanServicesResult`                                                                                                                                                                    |
| nat     | NAT 类型（多 STUN），输出 `NatProbeResult`                                                                                                                                                                                            |
| ntp     | NTP 时间偏移（多源中位数），输出 `NtpProbeResult`                                                                                                                                                                                     |
| nodes   | **多节点 DNS 对比 + agent 注册**：域名对比（local + 各节点 DNS 结果按节点列出）；节点列表（local / Globalping 区域 / remote-agent）；注册 agent（label + https endpoint）→ `addAgent`（HTTPS 注册/健康检查/白名单），可移除；刷新节点 |

## 8. 能力包（D-017 packs）

- **能力包**：`adv-scanner`（SYN 扫描）、`pcap-diag`（诊断抓包）、`priv-helper`（特权 helper）。内置 manifest（packId / version / hash / 签名来源）。
- PackInstallDialog：pack 列表（version / sizeMB / status / markerOnly 提示 / 描述），安装 / 卸载 / 刷新；安装走后端（**禁止前端传 URL**，marker + hash 校验，测试通道可强制 hash-fail）；进度事件 `pack-progress` 实时显示 `packId phase bytes/totalBytes`。
- 安装/卸载后自动刷新 capabilities 与 packs 列表；capabilities 中 `tools.<key>` 可反映 `missing_pack`（缺能力包时面板显示缺失提示并可跳转安装）。

**交互细节**：

- pack 列表为单选项列表（点击选中高亮），选中后右侧描述区展示 pack 描述 + Gatekeeper 说明；安装/卸载按钮带 CommandHint 包裹（hover 显示真实命令）。
- **focusPackId 自动聚焦**：从 pcap 面板「管理能力包」入口进入时自动选中 `pcap-diag`、从端口/ARP 面板进入时自动选中 `adv-scanner`（`focusPackId → setSelected`）；pack 列表为空时右侧显示 `packs.empty` 占位。
- `busy` 为真时**全部按钮禁用**（刷新/安装/卸载/测试哈希失败），安装按钮文案切为「安装中…」；进度文本 `packId phase bytes/totalBytes` 实时刷新，安装完成/失败后清除。
- **能力包刷新防重入由对话框承载**：`refreshCapabilityPacks` 用例**没有**自身 loading 标志（连续调用会并发重读），其防重入依赖 PackInstallDialog 的页面级 `busy` 状态（`onRefresh/onInstall/onUninstall/onVerifyFail` 均以 `busy` 包裹，执行中按钮全部禁用）。
- 已安装 pack 显示「卸载」（destructive 样式）；未安装显示「安装」；`markerOnly`（制品未发布）显示标记提示。
- 「测试哈希失败」按钮（验证通道）仅用于开发验证：安装强制返回 hash 不匹配并写入命令日志，不实际安装。

## 9. 快捷键

无全局快捷键（本模块未实现）；交互以按钮 + CommandHint 为主。

## 10. 技术实现要点

- **架构分层**（Feature-sliced）：`page.tsx`（装配）→ `components/`（面板 UI，`ProbePanelShell` 统一工具栏/内容壳）→ `hooks/useNetworkProbeController`（store↔use-cases 桥接，逐项 selector）→ `services/network-probe.use-cases.ts`（业务编排、事件订阅、防重入、取消幂等）→ `services/network-probe.repository.ts`（IPC 适配）→ `@/lib/tauri/commands/network-probe`。
- **store**（zustand）：单一 feature store，保存全部结果/loading/error/导航/安全授权/报告历史/命令日志/会话状态；持久化仅 nav（sessionStorage）、securityAuthorized 与 reportHistory（localStorage）。
- **IPC 契约**：`src/lib/tauri/contracts.ts` + `src-tauri/src/net_probe/commands.rs` 双边集中维护；全部命令返回 `AppResult<T>`。
- **长任务**：events 流式（`network-probe:health-item` / `traceroute-hop` / `site-sample` / `ping-sample` / `speed-sample` / `port-sample` / `pack-progress` / `scan-session`）；会话取消统一 `network-probe-cancel-scan(sessionId)`，**同一会话只允许发一次取消（幂等）**，新会话重置取消标记（有单测 `cancel-idempotency.test.ts`）。
- **capabilities 能力声明**：后端 `build_capabilities` 返回 platform / privilegeLevel / tools 状态（supported/partial/degraded/unsupported/missing_pack）/ externalTools（如 nmap）；前端 `toolEnabled` 依此控制按钮可用性与降级提示。
- **defaults 目录**：`get_network_probe_defaults` 返回 DNS 预设、站点包、探测目标、强制门户、公网 IP API、MTU 目标等默认资源；支持用户覆盖（`saveDefaultsOverride`）与重置（`resetDefaults`）。
- **面板复用**：offline 内的 ipv6/mtu/egress 复用同一 `Ipv6Panel`/`MtuPanel`/`EgressPanel`（`dualFrom` 区分来源），避免双入口冲突。
- **测速护栏**：LibreSpeed 硬上限 32/8 MB、失败 30s 冷却。
- **体检健壮性**：VPN/utun 默认路由无 gateway 行不误报；识别 DNS Fake-IP（198.18/15）与本地系统代理；`reach.public_name` 在 Fake-IP 下跳过 ICMP。

## 11. 数据模型（关键类型）

- `NetworkProbeCapabilities`：platform / privilegeLevel / tools / packs / externalTools。
- `CapabilityPackInfo` / `CapabilityPackInstallResult` / `CapabilityPackProgress`。
- `LocalNetworkSummary`：interfaces / primaryIpv4·6 / gateway / dnsServers / wifiSsid / wifiSignalDbm。
- `HealthCheckItem`（key/layer/status/detail/commandHint）、`HealthOpinion`（id/severity/relatedKeys/titleKey/bodyKey）、`HealthScanResult`（items/opinions/elapsedMs/sessionId/cancelled/commandHint）。
- `PingProbeResult` / `PingSample`；`DnsLookupResult` / `DnsRecordItem`；`TcpConnectResult`；`ProbeTargetResult`（icmp/http/tls）；`TracerouteHop` / `TracerouteResult`；`PathMtuResult`；`SpeedTestResult` / `SpeedSampleEvent` / `SpeedSource`。
- `SitesProbeResult` / `SiteSampleResult`；`FixResult`；`CaptivePortalResult`；`PublicIpInfo`；`ProxyVpnStatus`；`Ipv6StackResult`。
- `PortScanResult` / `PortSampleEvent`；`PollutionReport`；`WhoisInfo`；`DnsSecCheckResult`；`PcapDiagResult`。
- `LanDiscoveryResult`（neighbors/mode/cidr/emptyReason）、`LanServicesResult`；`NatProbeResult`；`NtpProbeResult`；`MultiNodeDnsResult` / `ProbeNode`。
- `NetworkProbeDefaultsCatalog` / `DefaultsOverride`；`HostsOverride`；`FirewallStatus`。
- store 关键状态：nav、capabilities、capabilityPacks、defaults、各结果/流式数组、loading*（每工具独立）、error、securityAuthorized、activeSessionId、cancelRequestedSessionId、commandLog、reportHistory。

## 12. 边界与限制

- **硬红线（法律/合规）**：不实现主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破** 一律不构建；仅提供对应检测/防御（`detectArpSpoofing` 只读 MAC 冲突提示、`checkSsl.mitmSuspected`、暴露面评估）。
- 平台：macOS 主路径；Windows 能力降级/隐藏；Linux 非目标。权限不足（Local Network / TCC）给出稳定错误 + 打开系统设置入口，不静默失败。
- 高危修复（重置网络栈）三次确认 + 手输 `RESET`；端口扫描非内网/超 64 端口二次确认；安全 Tab 需显式授权。
- 测速/探测均有冷却与取消；长任务可取消，取消幂等。
- 命令日志与报告导出可能含本机网络信息，报告导出带隐私提示；数据不落盘（除 reportHistory 最近 10 条）。
- 能力包为 marker + hash 校验安装路径（sidecar 下载路径已预留），前端禁止传下载 URL。

## 13. 异常处理

### 13.1 错误码 → 前端提示映射

后端统一返回 `{ code, message }`（`src-tauri/src/error.rs` AppError），前端 `parseCommandError`/`getErrorMessage` 解析；use-case 统一 `setError({ key: "networkProbe.errors.<tool>Failed", fallback })`，顶部错误横幅展示本地化文案。

| 错误码                                 | 场景                                                                                                                                         | 前端行为/提示                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `INTERNAL` / `TASK_FAILED`             | 内部错误 / `spawn_blocking` JoinError                                                                                                        | 错误横幅显示 `networkProbe.errors.*Failed` + 后端 message                                |
| `INVALID_INPUT`                        | 非法 host、空端口列表、>256 端口、非法 DNS IP、DNS 服务不在白名单、DNS 服务器 >4；探测目标长度 >2048、URL scheme 非 http/https（`input.rs`） | 错误横幅展示，不重试；修正输入后重试                                                     |
| `NOT_FOUND`                            | 目标资源不存在                                                                                                                               | 错误横幅                                                                                 |
| `UNSUPPORTED`                          | Windows/Linux 上 macOS-only 操作（网络服务枚举、修复、防火墙状态等）                                                                         | 面板降级/隐藏，或显示「仅 macOS 实现」提示                                               |
| `IO_ERROR` / `FORBIDDEN_PATH`          | networksetup 等外部命令失败、路径越界                                                                                                        | 错误横幅 + 后端 message                                                                  |
| `ICMP_UNAVAILABLE`                     | ICMP socket 打开失败（ping.rs）                                                                                                              | 提示「可能需 Local Network 权限」，引导打开系统网络设置；ping 全丢包时命令日志追加同提示 |
| `DNS_LOOKUP_FAILED` / `DNS_CONFIG`     | DNS 解析失败 / 解析器配置读取失败                                                                                                            | 错误横幅 `networkProbe.errors.dnsFailed`                                                 |
| `NETWORKSETUP_FAILED`                  | `networksetup -listallnetworkservices` 失败                                                                                                  | 错误横幅 `networkProbe.errors.servicesFailed`                                            |
| `NTP_BIND/DNS/SEND/RECV/TIMEOUT/SHORT` | NTP 探测各阶段失败                                                                                                                           | 错误横幅 `networkProbe.errors.ntpFailed`                                                 |
| `NAT_BIND/DNS/SEND/RECV/TIMEOUT`       | NAT/STUN 探测各阶段失败                                                                                                                      | 错误横幅 `networkProbe.errors.natFailed`                                                 |
| `SPEED_CLIENT`                         | 测速源请求失败                                                                                                                               | 进入 30s 冷却 + 错误横幅 `networkProbe.errors.speedFailed`                               |
| `GP_CLIENT` / `GP_PARSE`               | Globalping 节点请求/解析失败                                                                                                                 | 错误横幅 `networkProbe.errors.multiNodeFailed`                                           |
| `WHOIS_CLIENT`                         | RDAP 查询失败                                                                                                                                | 错误横幅 `networkProbe.errors.whoisFailed`                                               |
| `MDNS_BIND/SEND` / `SSDP_BIND/SEND`    | 局域网服务浏览失败                                                                                                                           | 错误横幅 `networkProbe.errors.lanSvcFailed`                                              |
| `TRACEROUTE_BUILD` / `TRACEROUTE_RUN`  | traceroute 构建/运行失败                                                                                                                     | 错误横幅 `networkProbe.errors.tracerouteFailed`                                          |
| `PACK_URL_INSECURE`                    | 包下载 URL 非 https（仅后端 manifest）                                                                                                       | 错误横幅 `networkProbe.errors.packsFailed`（正常不可达，防篡改）                         |
| `PACK_CLIENT` / `PACK_DOWNLOAD`        | 包下载网络失败（120s 超时）                                                                                                                  | 错误横幅 `networkProbe.errors.packsFailed`；可刷新后重试                                 |
| `PACK_HASH_MISMATCH`                   | SHA-256 校验失败（marker-only / 下载损坏）                                                                                                   | 错误横幅 `networkProbe.errors.packsFailed`，二进制不安装                                 |
| 前端 `securityAuthRequired`            | 安全 Tab 未授权调用                                                                                                                          | 错误横幅「请先确认安全 Tab 授权声明。」，不发起 IPC                                      |

### 13.2 常见失败场景与行为

| 场景                                     | 行为/提示                                                  | 恢复/降级                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 网络断开/超时                            | 各探测命令返回对应错误码 → 错误横幅                        | 重试；`caps.localNetworkHint` 提示「全部探测丢失可能是权限/防火墙/真实断网，不要当唯一结论」 |
| 权限拒绝（Local Network / TCC / 无特权） | `ICMP_UNAVAILABLE`、arp `emptyPermission`、pcap 无特权     | 降级到 tcpdump 计数 / ARP 缓存读取；给出「打开系统网络设置」入口，不静默                     |
| 平台不支持（Windows/Linux）              | `UNSUPPORTED` 或能力矩阵 `unsupported`                     | 面板隐藏/禁用 + toolDisabled 提示；firewall 返回 status=unsupported + detail                 |
| 能力包缺失                               | `tools.<key> = missing_pack`                               | 面板禁用 + 「管理能力包」入口跳转安装；安装后自动刷新                                        |
| 外部工具缺失（如 nmap）                  | externalTools 反映                                         | 端口扫描降级为 TCP connect（degraded），提示安装 adv-scanner/nmap 可启用 SYN                 |
| 测速源不可达                             | `!result.ok && !cancelled`                                 | 30s 冷却倒计时禁用，可换源；取消成功不计冷却                                                 |
| 取消命令本身失败                         | `cancelFailed`                                             | 错误横幅提示；会话取消在前后端均幂等                                                         |
| 一键诊断部分子项失败                     | `runOfflineDiagnostics` 用 `Promise.all`，任一失败整体失败 | `offlineFailed` 错误横幅、已成功子项不落 store；改用各子面板单独运行可逐项定位               |

### 13.3 幂等 / 取消 / 并发保护

- **会话取消幂等（前后端双保险）**：前端 `cancelRequestedSessionId` 保证同一 `sessionId` 只发一次 `cancelScan`；后端 `session.rs` 以 `HashSet` 记录已取消 id，重复取消为 no-op 成功。新会话（新 sessionId）自动重置取消标记（有单测 `cancel-idempotency.test.ts`）。
- **事件监听清理**：所有流式长任务在 `finally` 中 `unlisten()` 全部事件订阅（health-item / site-sample / traceroute-hop / ping-sample / speed-sample / port-sample / scan-session / pack-progress），避免泄漏与跨会话串扰。
- **单工具防重入**：每个 use-case 入口 `if (store.loadingX) return`；同一工具不可并发，不同工具可并行（store 每工具独立 loading）。
- **修复幂等**：后端每次执行前重新校验服务白名单（忽略前端「已确认」标志）；刷新 DNS 对 `dscacheutil`/`killall` 分别报告成功/失败，不把权限失败当成功。
- **single-flight 式刷新**：刷新概览（`loadingSummary`）、节点（`loadingNodes`）在用例内以 loading 标志防重复触发；**能力包刷新除外**——`refreshCapabilityPacks` 无 loading 标志，防重入由 PackInstallDialog 的 `busy` 提供（见 §8）。
- **无 loading 标志的写操作（防重入缺口）**：`addAgent` / `removeAgent` / `loadNetworkServices` / `openSystemNetworkSettings` 均无 loading 短路与禁用态，快速连点会重复提交/重复打开（标记为已知并发边界，未见修复实现）。

### 13.4 数据与安全

- 报告导出（JSON/Markdown）含公网 IP、Wi-Fi SSID、hosts 异常等，导出前展示隐私提示；reportHistory 仅保留最近 10 条（localStorage），清空需确认。
- 能力包安装路径：前端禁止提交下载 URL；仅后端 manifest 的 https URL + SHA-256 校验；`PACK_HASH_MISMATCH` 时二进制不落盘。
- `saveDefaultsOverride`/`resetDefaults` 失败 → `networkProbe.errors.defaultsFailed`；默认资源损坏时重置即可恢复内置值。
