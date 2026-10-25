# Network Probe（网络探测 / 网络急救箱）产品说明

> 本文件是 network-probe 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。
> 规划/未完成项见 `../planned/network-probe.md`；详细设计见 `../modules/network-probe/`（design*.md、roadmap.md、defaults.md）。

## 1. 定位

- **独立一级 feature**（`desktopOnly: true`，非 Bench 2.0 主序列，与 2.0 并行旁路），入口：路由 `/network-probe`，侧边栏注册。
- 用途：**网络急救箱 + 专业探测工具链**。对标 360 断网急救箱、NETworkManager、安全探测工具链。硬红线：**只检测、不攻击**（不做 ARP 欺骗攻击 / MITM 注入 / DoS / 爆破）。
- 平台：macOS 主路径（Local Network / 系统能力）；Windows 降级；Linux 非目标。
- 状态口径：模块 1.0 / MVP A+B 已闭环；Post-MVP（测速 · 多节点 · 安全 · 发现）主路径已交付，指纹增强与特权 helper 仍待（见 planned）。

## 2. 界面总览（L1×5 壳 + 基础视角同页分区）

```
┌──────────────────────────────────────────────────────────────┐
│ L1 顶栏（basic/sites/test/security/discover + 节点选择 + 能力包）│
├──────────────────────────────────────────┬───────────────────┤
│ 面板区（L2 内容，依 L1 而定）               │ 命令日志侧栏        │
│                                          │ (280px, 可折叠)    │
├──────────────────────────────────────────┴───────────────────┤
│ L2 底栏（其他 L1 的子面板切换，带 Post 徽标）                    │
└──────────────────────────────────────────────────────────────┘
```

- **L1 顶栏**：logo 圆点 + 标题 + 5 个一级 Tab（基础/站点延迟/测试/安全/发现）；右侧**探测节点选择器**（local + 已注册 remote agent/Globalping 节点）、**能力包管理按钮**（打开 PackInstallDialog）。
- **面包屑 + capabilities 横幅**：面板标题下显示 `L1 / L2 [/ offline 子项] · platform=… privilege=…`。
- **错误横幅**：`error` 非空时在面板上方显示（红框）。
- **安全授权条（SecurityAuthGate）**：仅 L1=security 时显示——未授权时琥珀色提示 +「确认」按钮；已授权显示「已授权」+「撤销」；授权状态持久化于 localStorage（`network-probe:security-authorized`）。
- **命令日志侧栏**：右侧 280px（折叠为 2.25rem 窄条），滚动展示每次探测的 `invoke` 命令文本 + 结果/取消/耗时摘要（时间戳前缀），可清空（二次确认）；开合状态持久化于 sessionStorage（`network-probe:side-log-open`）。
- **基础视角**：不显示 L2 底栏；同一可滚动页面按概览、一键体检、扫描建议、上不了网、一键修复、报告六区展示，页首按钮可跳到对应区块。各区复用现有面板、状态与动作，不清空运行结果；离开基础视角后再回来仍可继续查看。
- **其他 L1 的 L2 底栏**：当前 L1 的子面板按钮列表（见下表），Post-MVP 面板带「Post」徽标。

L1 → L2 映射：

| L1       | L2（子面板）                                                   |
| -------- | -------------------------------------------------------------- |
| basic    | overview · tree · opinion · offline · fix · report（同页六区） |
| sites    | official · packs                                               |
| test     | ping · dns · tcp · custom · traceroute · mtu · egress · speed  |
| security | ports · pollution · pcap · dnssec · whois                      |
| discover | arp · lan-svc · nat · ntp · nodes                              |

- 导航状态（当前 L1 / 其他 L1 的 L2 / offline 子项）持久化于 sessionStorage（`network-probe:nav`）；基础视角的旧 L2 值兼容读取，不参与区块选择。
- 未实现面板统一显示 ComingSoon 占位：显示当前工具 status（如 `portScan=missing_pack`）、外部工具（nmap）是否存在、能力包缺失提示与「管理能力包」按钮。

### 全局交互与反馈细节

- **bootstrap 加载**：首次进入 `bootstrap()` 并行拉取 capabilities / defaults / packs / nodes；任一失败在顶部错误横幅展示 `networkProbe.errors.bootstrapFailed`（可重试，重进页面或刷新按钮触发），不阻断其余面板。
- **错误横幅**：`error` 非空时面板上方红框展示，文案优先本地化 `networkProbe.errors.<tool>Failed`，兜底后端 `message`；每个操作开始前 `setError(null)`，结束（成功或失败）后由用例设置或清除，单条错误会随下一次操作被清掉。
- **每工具 loading 独立 + 防重入**：`loading*`（每工具一个）为真时对应「运行」按钮禁用并显示运行中文案（如「Ping → 探测中…」）；use-case 入口统一 `if (store.loadingX) return` 短路，同一工具不可并发、不同工具可并行。网络服务枚举有独立 loading / single-flight；修复执行时锁定服务和 DNS 目标，并暂停服务刷新。打开系统设置不等待探测或修复。
- **能力降级**：`toolEnabled=false`（status 为 `unsupported`/`missing_pack`）时按钮禁用并显示 toolDisabled 提示（`{{tool}} status={{status}} — 已按能力矩阵禁用`）；缺 pack 的工具给出「管理能力包」入口跳转 PackInstallDialog。
- **命令日志侧栏**：每个探测命令追加一行时间戳日志（`appendCommandLog`），运行中/成功/失败/取消均有摘要；可折叠（sessionStorage 记忆）、清空需二次确认。
- **键盘**：各面板均为表单 + 按钮触发（Enter 提交表单）；无全局快捷键（见 §9）。

## 3. 基础（basic）L1

基础视角由单页六区组成，区块跳转支持鼠标与键盘；每个区块使用页面级滚动，不在内部创建独立滚动区。站点延迟继续作为独立 L1。

### 3.1 网络概览 overview

- 首次进入自动拉取；信息卡网格：IPv4 / IPv6 / 网关 / DNS 服务器 / Wi-Fi（SSID + dBm）/ 防火墙状态 / hosts 可疑条目数 / 非回环接口数。
- 按钮：刷新、打开系统网络设置。数据源 `getLocalNetworkSummary` + `getFirewallStatus` + `checkHostsOverrides` 并行加载；单项失败在对应卡片显示可读错误，其他成功数据照常呈现，刷新期间保留上一份数据。概览加载失败后停止自动重试，错误态保留并允许用户手动刷新恢复。

### 3.2 体检树 tree（L0–L3 健康扫描）

- 点击「运行体检」→ 后端 `runHealthScan` 逐项流式推送 `health-item` 事件，面板按层分组（L0 网络层 / L1 网关 / L2 DNS / L3 公网）实时渲染；每项显示 key、状态徽标（pass/warn/fail/error/skip）、detail、commandHint。
- 运行中可「取消」（走会话取消）；完成后显示耗时与「已取消」标记；未取消的结果自动加入报告历史。
- 空态提示 + 顶部命令提示（CommandHint）。

### 3.3 体检建议 opinion（Advisor）

- 展示 `healthResult.opinions`：每条建议按严重级别（critical/warn/info）着色卡片，含标题（i18n key）、正文、相关检查 key 列表。无结果时提示「先去运行体检」，可跳转 tree。

### 3.4 上不了网 offline（子导航 captive/proxy/ipv6/mtu/egress/diff）

- 子导航胶囊：全部 / 强制门户 / 代理·VPN / IPv6 / MTU / 公网出口 / 对比。
- 「一键诊断」并发执行：检测强制门户（CaptivePortal）、公网 IP（egress）、代理/VPN 状态、IPv6 栈、路径 MTU。
- **一键诊断为部分成功**：5 项并发执行，各自独立汇报结果；刷新期间保留上一次结果并显示运行态，完成后成功项写入 store，失败项清除过期结果、在对应区块显示错误并汇总到 `networkProbe.errors.offlinePartialFailed`。失败区块不同时显示“待运行”；再次运行或单项重试时清除本轮错误。批量诊断与 IPv6 / MTU / 公网出口单项检查互斥；同类请求 single-flight，避免重复执行。
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
- 服务列表有 idle/loading/ready/error 状态；失败可重试，服务依赖型的切换 DNS、续租 DHCP、重置网络栈仅在成功加载列表且选中服务后启用。刷新 DNS 不依赖服务列表，可单独使用。完成后展示结果（action / ok / message / commandHint）。

**交互细节**：

- 服务下拉自动优先 Wi-Fi → 有线 → 首个（正则匹配 `wi-?fi|wlan` → `ethernet|usb` → 首项），未加载完成前按钮 `disabled`；DNS 预设默认选中第一项。
- **各修复按钮禁用条件细化**：刷新 DNS 仅需 `!loadingFix`；切换 DNS 需服务枚举为 `ready`、`service` 非空**且** DNS 预设非空（`servers.length===0` 时禁用，如预设列表为空）；续租 DHCP / 重置网络栈需服务枚举为 `ready` 且 `service` 非空；修复执行期间锁定服务与 DNS 选择，服务刷新仅在无修复且未枚举时可点；「打开系统设置」无 loading 标志、任何时刻可点。服务/DNS 预设用**原生 `<select>`**（非 shadcn Select），label 以 `htmlFor` 关联。
- 所有修复按钮共用 `loadingFix` 全局禁用（防重入）；刷新 DNS / 切换 DNS / 续租 DHCP / 重置网络栈任一执行中，其余全部按钮禁用。
- 两步确认（切换 DNS / 续租 DHCP）：第 1 步「下一步」→ 延迟 320ms 弹第 2 步（确认服务与目标 DNS 服务器），任一步取消即中止；确认按钮在 `loadingFix` 时显示 loading。
- 三步确认（重置网络栈）：step1 后果说明 → step2 核对参数 → step3 勾选风险确认框 + 手输 `RESET` 才能点「立即重置」；后端忽略前端任何「已确认」标志，每次调用重新校验服务白名单（幂等）。
- 结果卡：`lastResult.action + ok/failed` + message + commandHint；失败不弹 toast，直接在结果卡呈现（修复动作有确定性结果语义）。

### 3.6 报告 report

- 当前体检结果导出：**JSON**（整份 `HealthScanResult`，附导出时间；历史中能匹配到快照时附保存时间）与 **Markdown**（含每个检查项、建议和时间）浏览器下载；隐私提示文案。
- **历史快照**：最近 10 次未取消体检（localStorage `network-probe:report-history`），本地记录保存时间并显示 sessionId/项数/耗时/建议数；旧快照没有保存时间时显示“时间未知”，不丢弃历史；清空前二次确认。
- **跨次对比**：可分别选择两次快照，比较检查项状态（按 key 匹配），显示状态变化、未记录项及建议数变化；诊断详情不参与对比，避免 IP 等动态本机信息制造噪声。少于两条历史时说明需要保存第二次体检。
- **命令透明**：探测、修复、摘要/服务/Agent/能力包刷新及系统设置等 IPC 操作按钮均提供 hover 命令预览；组合操作列出全部子命令，契约标识保持原名。
- **命令日志**：保留最近 200 条本模块 IPC 命令名与可安全展示的状态摘要，不把用户输入参数或凭据写入日志；有记录时可清空，清空前二次确认。

## 4. 站点延迟（sites）L1

### 4.1 官方站点 official

- 官方站点包（`official` pack）卡片网格；每卡：站点名 + host、状态徽标（idle/ok/fail/running）、最近测试时间 + 延迟（HTTP TTFB 优先，回退 ICMP）、吞吐（HTTP 有界下载，≤1MiB/5s → `downloadMbps`）。
- 顶部「测试全部」+ 统计（总数/OK/失败）；点击单卡只测该站（保留既有结果不丢）；运行中可取消。
- 流式事件 `site-sample` 实时更新卡片；结果按 target 合并去重（指纹去重），单卡多次测试保留历史。
- **持续监测**：可启动官方站点整包监测；立即执行首轮，每轮结束后按 30/60/300 秒间隔再执行，始终串行、不积压。可设 1–10,000ms 阈值（默认 200ms）；HTTP TTFB 优先，缺失时回退 ICMP；延迟达到阈值或目标不可达时在面板显示当前告警目标。停止按钮会停止调度并尽可能取消当前会话；离开面板或应用窗口失去焦点时会停止监测，并请求取消正在执行的一轮（会话 ID 尚未回传时保留取消意图，待会话建立后立即取消）；回到窗口后需手动重新开始。仅前台面板运行，不启用系统通知、不后台常驻，不将监测结果保存到磁盘。

### 4.2 区域站点包 + 自定义 packs

- 区域包下拉（global / cn-friendly / dev / official，取自 defaults.sitePacks 除 official 外全部），运行整包。
- **自定义站点**：输入目标（多个，最多 24 个，去重）→「添加」→「运行自定义」；列表 chip 可逐个移除；持久化于 sessionStorage（`network-probe:custom-sites`）。
- 结果表：每行 id、target · channel（degraded 标记）、Sparkline 迷你趋势线（近 20 次延迟；不可达样本显示断点）、ICMP/HTTP/吞吐或失败原因；流式刷新。趋势以内存保留，每目标最多 20 点、最多保留 100 个目标；自定义站点按目标地址隔离历史。
- **持续监测**：可启动所选内置站点包监测，调度、阈值、告警、取消和前台限制与官方站点相同；运行时锁定站点包与自定义目标编辑，避免监测对象中途改变。

## 5. 测试（test）L1

| 面板       | 输入                                                                                     | 输出 / 行为                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ping       | 目标 + 次数（默认 1.1.1.1 / 4）                                                          | ICMP ping；流式 `ping-sample` 逐包；新一轮开始清除旧结果；汇总（解析 IP / 收发 / 丢包 / min-avg-max-jitter）；socket 不可用或全丢包时提示权限、防火墙和过滤等可能原因，并提供「隐私与安全性」设置入口 |
| dns        | 域名 + RR 类型（A/AAAA/CNAME/MX/TXT）+ 解析器（可选，datalist 联想 defaults.dnsPresets） | 解析记录表（RR / data / TTL）、耗时、使用的 resolver                                                                                                                                                  |
| tcp        | host + port（+ 超时）                                                                    | TCP 连接结果：status / rttMs / message                                                                                                                                                                |
| custom     | 目标串                                                                                   | 综合探测：ICMP + HTTP（状态/TTFB/吞吐/下载字节）+ 轻量 TLS（证书存在/握手）                                                                                                                           |
| traceroute | 目标 + maxTtl（默认 20）+ rounds（默认 3）                                               | 逐跳流式 `traceroute-hop`；跳点表（TTL / 地址 / ASN+AS名 / 丢包率[>50% 红、>0 琥珀] / avg-best-worst RTT）；显示解析 IP、privilegeMode、耗时；可取消                                                  |
| mtu        | 目标（默认 1.1.1.1）                                                                     | 路径 MTU 探测：状态 / pathMtu / message                                                                                                                                                               |
| egress     | —                                                                                        | 公网出口：IP、来源、ASN/org（复用 offline.egress）                                                                                                                                                    |
| speed      | 测速源下拉（LibreSpeed 公共源）                                                          | **带宽测速**：流式 `speed-sample` 阶段（ping/jitter/download/upload）；结果卡：ping / jitter / download / upload Mbps；**失败/源不可用进入 30s 冷却**（倒计时禁用）；可取消                           |

- 所有探测和修复动作按钮带 CommandHint（真实命令预览）；`toolEnabled=false` 时显示 toolDisabled 提示。

**交互细节**：

- **输入护栏（后端 clamp/校验）**：ping 次数 clamp `[1,20]`（默认 4）、间隔 clamp `[100,5000]ms`；traceroute `maxTtl` 默认 20、`rounds` 默认 3；端口扫描最多 256 端口（去重后超限返回 `INVALID_INPUT`）；自定义站点最多 24 个且去重；非法 host / 空端口列表返回 `INVALID_INPUT` 并走错误横幅。
- **单工具防重入**：ping / dns / tcp / custom / traceroute / mtu / egress / speed 各自独立 loading，运行中按钮禁用 + 运行中文案，不可重复触发；可取消的长任务（traceroute / speed）运行中同位置显示红色「取消」按钮。
- **ping 全丢包提示**：`packetsReceived === 0` 时命令日志追加「可能需 Local Network 权限」提示（不静默）。
- **测速冷却**：下载与上传均未返回带宽样本时（即使 ping 有响应）`speedCooldownUntil = now + 30s`，期间「开始测速」禁用并倒计时提示（`测速源失败 — {{seconds}} 秒后可重试`），冷却结束自动恢复；取消成功不计入冷却。
- **测速结果与冷却防护**：测速成功要求至少一个下/上行带宽样本；仅有 ping/jitter 时仍显示延迟，但标记测速源未返回带宽数据并进入冷却。仅有一个方向样本时标记为部分结果，不进入冷却。除按钮禁用外，`runSpeedTest` 用例入口 `if (speedCooldownUntil > now) return` 短路（连点/脚本调用也不触发）；冷却以 **500ms interval** 倒计时刷新；**源下拉在 `loading || coolingDown` 时同样 disabled**。内置测速源名称使用中英本地化，未知来源保留来源自身名称；结果卡不显示未经本地化的后端文本。
- **重新运行前状态复位（流式状态机）**：所有可重复探测（health / sites / traceroute / speed / ports / lan / pcap）每次开始时先 `resetXxxStreaming()` 清空上次流式数据 + `setActiveSessionId(null)`；speed 额外 `setSpeedSample(null)` / `setSpeedResult(null)`、ports 额外 `setPortScanResult(null)`，**新一次探测不留旧结果混淆**；`finally` 里统一 `setActiveSessionId(null)` 复位取消可用性。
- **长列表**：端口样本、Traceroute 跳点、ARP 邻居和局域网服务列表达到 50 项时启用虚拟化，保持滚动、列表/表格语义与总行数可访问；开放端口摘要只列前 16 个并显示剩余数量，完整结果仍可在列表中滚动查看。端口状态和缺失 MAC 的占位文案随界面语言显示。
- **流式采样去重**：`site-sample` / `port-sample` 按 target/port 合并去重（`upsert*`），单卡多次测试保留历史并绘制近 20 次 Sparkline；完成后对未取消的站点包结果保留已测卡片（取消提示「已完成的卡片结果会保留」）。

## 6. 安全（security）L1（全部要求 SecurityAuthGate 已授权）

> 未授权时 use-case 直接报 `securityAuthRequired`，不发起探测。

| 面板  | 说明                                                                                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ports | 端口扫描（默认 127.0.0.1 / 22,80,443,8080，支持 `,` / `-` 端口范围）；目标只允许单个 IP 或主机名，拒绝 CIDR / 通配符 / 多目标语法；公网目标或 >64 个去重端口需二次确认；Nmap 优先 SYN，权限不足回退 connect，无 Nmap 时使用内置 TCP；指纹识别需显式开启；风险标签只描述暴露类别，不代表漏洞或严重级别。 |

**端口扫描补充契约**：

- 高风险确认框展示目标、原样端口范围、按后端语法解析并去重后的实际端口数、探测速率和时长；范围无效时显示“无法估算”，不显示推算时长。Nmap 端口阶段使用 `--scan-delay 50ms` 与 `--host-timeout 30s`；内置 TCP 每目标至少间隔 50ms，最多 32 并发、单连接超时 800ms。
- Rust IPC 按目标及实际解析、去重后的端口数再次判断高风险；公网 IP、主机名或超过 64 个端口必须带 `highRiskConfirmed=true`，否则返回本地化确认提示且不创建扫描会话。该参数表达 UI 用户意图，不构成抵御被攻陷 renderer 的安全授权机制。
- Rust IPC 仅接受单 IP 或主机名，CIDR、通配符、IPv4 octet range 和逗号目标列表返回稳定错误码 `PORT_SCAN_SINGLE_HOST_REQUIRED`，不会创建扫描会话。
- 指纹模式使用 `-sV --version-light` 和 `-T2`；原始报文权限不足时以 `-sT` 继续服务识别并跳过 `-O`。服务 / OS 阶段由 Nmap 自身控制时序，因此 UI 的 50ms 只描述端口阶段，不是整次指纹扫描的总速率上限。
- stdout / stderr 分别最多保留 2 MiB / 64 KiB；超限后继续排空并明确失败。禁止 `-A`、`-sC` 和 NSE 脚本；显式指纹请求遇到 Nmap 缺失或失败时显示错误，不伪报成功；取消结束当前进程且不触发第二轮扫描。
  | pollution | DNS 污染检测：对域名跑检测（本地 + 公共 DNS 对照），输出 `PollutionReport`（finding 列表） |
  | pcap | 诊断抓包（`pcap-diag`，默认 5s）：重传/乱序/RST 统计；无特权时 tcpdump 计数降级；可取消；缺 pack 时引导安装 `pcap-diag` |
  | dnssec | DNSSEC 校验（Cloudflare DoH AD 位验证链），输出 `DnsSecCheckResult` |
  | whois | WHOIS 查询（任意 query），输出 `WhoisInfo` |

**交互细节**：

- **SecurityAuthGate**：未授权时 L1=security 显示琥珀色提示 + 「我确认 — 启用安全工具」按钮；点击后 `authorizeSecurity` 置位并持久化 localStorage；已授权显示「本机已授权使用安全工具。」+「撤销」；授权/撤销即时生效。未授权点击任何安全工具，use-case 直接 `setError(securityAuthRequired)` 且不发起 IPC。
- **端口扫描确认**：目标非内网（非私有/回环）或去重后的端口数 >64 时，点击「扫描端口」先弹 `DestructiveConfirmDialog`，展示目标、原样端口范围和按后端语法展开 / 去重后的准确端口数；端口范围无效时显示“无法估算”且不显示预计时长。确认「仍然扫描」才执行；勾选范围内可免确认。CIDR、多目标、通配符和 IPv4 octet range 会由 Rust IPC 拒绝，返回本地化单主机提示。启用指纹时，额外说明轻量服务探测与 OS 识别会向授权目标发送探测包；没有已检测到的本机 Nmap 时禁用该选项。端口范围解析失败（如超 256、非法语法）由后端返回 `INVALID_INPUT`。
- **空态细分（arp）**：按 `emptyReason` 区分「权限不足（引导打开系统网络设置）/ 客户端隔离（仅网关响应）/ 安静网络（无邻居）」三种空态文案，不统一显示空。

## 7. 发现（discover）L1

| 面板    | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| arp     | 局域网发现：ARP 缓存 + TCP /24 扫（degraded；特权 RAW 扫待 helper）；输出邻居表（ip/mac/iface/source）；空态区分 权限不足（引导开 Local Network 权限）/隔离/安静；可取消                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| lan-svc | mDNS/DNS-SD + SSDP/UPnP 服务浏览（只读），输出 `LanServicesResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| nat     | NAT 类型（多 STUN），输出 `NatProbeResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ntp     | NTP 时间偏移（多源中位数），输出 `NtpProbeResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| nodes   | **多节点 DNS、Globalping remote Ping/HTTP + agent 注册**：DNS 对比列出本机与 Globalping 结果；Ping 与 HTTP HEAD/GET/OPTIONS 从 world、US、Europe 各选 1 个探点（最多 3 次测试）。HTTP URL 拆为 API 所需的主机、协议、路径、查询串与可选端口。目标（含 URL 查询参数）发送给 Globalping；输入限制为公网 IP/主机名与 HTTP(S)，私有/保留 IP、保留域名、凭据与片段拒绝；系统探点会阻止私有 IP。测量记录通常保留 6 个月，不得填入密钥或私人数据。交互请求启用 `inProgressUpdates`；创建与响应体最多 10 秒、之后每 700ms（按响应后间隔）使用 ETag 轮询最长 45 秒；提交后不可取消。显示响应头实际提供的 quota/credits；可选 Bearer token 按 bundle identifier 独立保存在系统钥匙串，不进入页面持久化、日志或测量结果。终态失败、请求错误与超时保留部分结果；客户端请求被拒与 Globalping 服务不可用显示不同提示。节点列表（local / Globalping 区域 / remote-agent）；注册 agent（label + HTTPS 基础地址或完整 WSS 健康检查地址）→ `addAgent`（HTTPS `GET <base>/v1/health` 或 WSS TLS/Upgrade 握手；健康检查不发送 WebSocket 消息），可移除；刷新节点时最多 8 个并发重查健康状态、保持注册顺序，并显示已本地化的可达状态；注册表读取失败显示错误与重试，不得冒充空列表，且不得阻断其他启动数据 |

### DNS 多节点结果状态

- Globalping 探测行只有 `status=finished` 且 DNS `statusCode=0` 时才标记为成功；未知或缺失响应码必须失败关闭。
- `NXDOMAIN` 显示为“域名不存在”；成功的 `NOERROR` 空响应显示为“无记录”。测量超时时保留已返回的节点结果，并单独标记未完成状态。
- 原始 resolver 诊断默认折叠；执行前明确告知用户域名会发送给 Globalping，以及测量记录的保留和隐私注意事项。

## 8. 能力包（D-017 packs）

- **能力包**：`adv-scanner`（SYN 扫描）、`pcap-diag`（诊断抓包）、`priv-helper`（特权 helper）。内置 manifest（packId / version / hash / 签名来源）。
- PackInstallDialog：pack 列表（version / sizeMB / status / markerOnly 提示 / 描述），安装 / 卸载 / 刷新；安装走后端（**禁止前端传 URL**，marker + hash 校验，debug 验证通道可强制 hash-fail）；进度事件 `pack-progress` 实时显示 `packId phase bytes/totalBytes`。
- 安装/卸载成功后自动刷新 capabilities 与 packs 列表；失败时显示本地化原因并保留原列表状态。capabilities 中 `tools.<key>` 可反映 `missing_pack`（缺能力包时面板显示缺失提示并可跳转安装）。

**交互细节**：

- pack 列表为单选项列表（点击选中高亮），选中后右侧描述区展示 pack 描述 + Gatekeeper 说明；安装/卸载按钮带 CommandHint 包裹（hover 显示真实命令）。
- **focusPackId 自动聚焦**：从 pcap 面板「管理能力包」入口进入时自动选中 `pcap-diag`、从端口/ARP 面板进入时自动选中 `adv-scanner`（`focusPackId → setSelected`）；pack 列表为空时右侧显示 `packs.empty` 占位。
- `busy` 为真时**全部按钮禁用**（刷新/安装/卸载/测试哈希失败），安装按钮文案切为「安装中…」；进度文本 `packId phase bytes/totalBytes` 实时刷新，安装完成/失败后清除。
- **能力包刷新防重入与反馈**：`refreshCapabilityPacks` 在用例层 single-flight；页面显示 `packsRefreshing` 状态，刷新期间禁用刷新、安装、卸载与哈希校验入口，并显示“刷新中…”；刷新完成后恢复操作，失败时保留重试入口。
- 已安装 pack 显示「卸载」（destructive 样式）；未安装显示「安装」；`markerOnly`（制品未发布）显示标记提示。
- 「测试哈希失败」按钮（验证通道）仅在开发构建显示：强制返回本地化 hash 不匹配并写入命令日志，不实际安装；release 实现 fail-closed，不运行该测试通道。

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
- `LocalNetworkSummary`：interfaces / primaryIpv4·6 / gateway / dnsServers / wifiSsid / wifiSignalDbm。macOS Wi‑Fi 信息经共享的 CoreWLAN helper 读取；SSID 未连接或受系统隐私授权限制时不返回，应用不主动申请定位授权。
- `HealthCheckItem`（key/layer/status/detail/commandHint）、`HealthOpinion`（id/severity/relatedKeys/titleKey/bodyKey）、IPC `HealthScanResult`（items/opinions/elapsedMs/sessionId/cancelled/commandHint）；前端本地 `HealthReportSnapshot` 另含可选 `savedAt`，不改变 IPC 契约。
- `PingProbeResult` / `PingSample`；`DnsLookupResult` / `DnsRecordItem`；`TcpConnectResult`；`ProbeTargetResult`（icmp/http/tls）；`TracerouteHop` / `TracerouteResult`；`PathMtuResult`；`SpeedTestResult` / `SpeedSampleEvent` / `SpeedSource`。
- `SitesProbeResult` / `SiteSampleResult`；`FixResult`；`CaptivePortalResult`；`PublicIpInfo`；`ProxyVpnStatus`；`Ipv6StackResult`。
- `PortScanResult` / `PortSampleEvent`；`PollutionReport`；`WhoisInfo`；`DnsSecCheckResult`；`PcapDiagResult`。
- `LanDiscoveryResult`（neighbors/mode/cidr/emptyReason）、`LanServicesResult`；`NatProbeResult`；`NtpProbeResult`；`MultiNodeDnsResult` / `ProbeNode`。
- `NetworkProbeDefaultsCatalog` / `DefaultsOverride`；`HostsOverride`；`FirewallStatus`。
- store 关键状态：nav、capabilities、capabilityPacks、defaults、各结果/流式数组、overviewErrors / offlineErrors、networkServicesStatus、loading*（每工具独立）、error、securityAuthorized、activeSessionIdByKind、cancelRequestedSessionIdByKind、commandLog、reportHistory。

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

| 错误码                                 | 场景                                                                                                                                         | 前端行为/提示                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `INTERNAL` / `TASK_FAILED`             | 内部错误 / `spawn_blocking` JoinError                                                                                                        | 错误横幅显示 `networkProbe.errors.*Failed` + 后端 message                                        |
| `INVALID_INPUT`                        | 非法 host、空端口列表、>256 端口、非法 DNS IP、DNS 服务不在白名单、DNS 服务器 >4；探测目标长度 >2048、URL scheme 非 http/https（`input.rs`） | 错误横幅展示，不重试；修正输入后重试                                                             |
| `NOT_FOUND`                            | 目标资源不存在                                                                                                                               | 错误横幅                                                                                         |
| `UNSUPPORTED`                          | Windows/Linux 上 macOS-only 操作（网络服务枚举、修复、防火墙状态等）                                                                         | 面板降级/隐藏，或显示「仅 macOS 实现」提示                                                       |
| `IO_ERROR` / `FORBIDDEN_PATH`          | networksetup 等外部命令失败、路径越界                                                                                                        | 错误横幅 + 后端 message                                                                          |
| `ICMP_UNAVAILABLE`                     | ICMP socket 打开失败（ping.rs）                                                                                                              | 提示「可能需 Local Network 权限」，引导打开系统网络设置；ping 全丢包时命令日志追加同提示         |
| `DNS_LOOKUP_FAILED` / `DNS_CONFIG`     | DNS 解析失败 / 解析器配置读取失败                                                                                                            | 错误横幅 `networkProbe.errors.dnsFailed`                                                         |
| `NETWORKSETUP_FAILED`                  | `networksetup -listallnetworkservices` 失败                                                                                                  | 错误横幅 `networkProbe.errors.servicesFailed`                                                    |
| `NTP_BIND/DNS/SEND/RECV/TIMEOUT/SHORT` | NTP 探测各阶段失败                                                                                                                           | 错误横幅 `networkProbe.errors.ntpFailed`                                                         |
| `NAT_BIND/DNS/SEND/RECV/TIMEOUT`       | NAT/STUN 探测各阶段失败                                                                                                                      | 错误横幅 `networkProbe.errors.natFailed`                                                         |
| `SPEED_CLIENT`                         | 测速源请求失败                                                                                                                               | 进入 30s 冷却 + 错误横幅 `networkProbe.errors.speedFailed`                                       |
| `GP_CLIENT`                            | Globalping 客户端创建失败（配置错误）；Globalping 创建响应解析失败时保留本机 DNS 结果并显示远程失败行                                        | 客户端创建错误走错误横幅；请求/终态/超时在对应 Globalping 失败行展示，保留本机及已有远程部分结果 |
| `WHOIS_CLIENT`                         | RDAP 查询失败                                                                                                                                | 错误横幅 `networkProbe.errors.whoisFailed`                                                       |
| `MDNS_BIND/SEND` / `SSDP_BIND/SEND`    | 局域网服务浏览失败                                                                                                                           | 错误横幅 `networkProbe.errors.lanSvcFailed`                                                      |
| `TRACEROUTE_BUILD` / `TRACEROUTE_RUN`  | traceroute 构建/运行失败                                                                                                                     | 错误横幅 `networkProbe.errors.tracerouteFailed`                                                  |
| `PACK_URL_INSECURE`                    | 包下载 URL 非 https（仅后端 manifest）                                                                                                       | 错误横幅 `networkProbe.errors.packsFailed`（正常不可达，防篡改）                                 |
| `PACK_CLIENT` / `PACK_DOWNLOAD`        | 包下载网络失败（120s 超时）                                                                                                                  | 错误横幅 `networkProbe.errors.packsFailed`；可刷新后重试                                         |
| `PACK_HASH_MISMATCH`                   | SHA-256 校验失败（marker-only / 下载损坏）                                                                                                   | 双语错误横幅 `networkProbe.errors.packHashMismatch`，二进制不安装、不执行                        |
| 前端 `securityAuthRequired`            | 安全 Tab 未授权调用                                                                                                                          | 错误横幅「请先确认安全 Tab 授权声明。」，不发起 IPC                                              |

### 13.2 常见失败场景与行为

| 场景                                     | 行为/提示                                              | 恢复/降级                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 网络断开/超时                            | 各探测命令返回对应错误码 → 错误横幅                    | 重试；`caps.localNetworkHint` 提示「全部探测丢失可能是权限/防火墙/真实断网，不要当唯一结论」                                                                                                            |
| 权限拒绝（Local Network / TCC / 无特权） | `ICMP_UNAVAILABLE`、arp `emptyPermission`、pcap 无特权 | 降级到 tcpdump 计数 / ARP 缓存读取；给出「打开系统网络设置」入口，不静默                                                                                                                                |
| 平台不支持（Windows/Linux）              | `UNSUPPORTED` 或能力矩阵 `unsupported`                 | 面板隐藏/禁用 + toolDisabled 提示；firewall 返回 status=unsupported + detail                                                                                                                            |
| 能力包缺失                               | `tools.<key> = missing_pack`                           | 面板禁用 + 「管理能力包」入口跳转安装；安装后自动刷新                                                                                                                                                   |
| 外部工具缺失或探测超时（如 nmap）        | externalTools 反映                                     | nmap `-V` 探测最多等待 2 秒；缺失或超时按未检测到处理，普通端口扫描降级为 TCP connect（degraded），显式指纹模式禁用并在执行竞态时明确报错；marker-only 或尚未接入执行路径的能力包不得伪装为已解锁扫描器 |
| 测速源不可达                             | `!result.ok && !cancelled`                             | 30s 冷却倒计时禁用，可换源；取消成功不计冷却                                                                                                                                                            |
| 取消命令本身失败                         | `cancelFailed`                                         | 错误横幅提示；仅清除仍处于活动状态的该会话取消标记，允许重试，不影响新会话                                                                                                                              |
| 一键诊断部分子项失败                     | `runOfflineDiagnostics` 各项独立结算                   | 成功项保留，失败项在对应区块显示错误并汇总为 `offlinePartialFailed`；可单项重试或重跑                                                                                                                   |
| 概览单项加载失败                         | 概览三项并行、逐项结算                                 | 已成功卡片继续呈现；失败卡片清除该项旧值并显示错误，刷新后可恢复                                                                                                                                        |
| 单次探测刷新失败                         | TCP、DNS、自定义目标及单次诊断请求被拒绝或失败         | 刷新中保留旧结果并锁定输入；请求失败后只清除本次对应的旧结果并显示错误；其他独立结果保留                                                                                                                |
| Agent 节点列表读取失败                   | 节点注册表独立于本机能力、默认值与能力包结算           | 保留其他成功数据；节点区显示错误与重试，不显示空列表                                                                                                                                                    |
| 网络服务枚举失败                         | `networkServicesStatus = error`                        | 显示重试入口；切换 DNS、续租 DHCP、重置网络栈保持禁用，DNS 刷新仍可单独使用                                                                                                                             |

### 13.3 幂等 / 取消 / 并发保护

- **会话取消幂等（前后端双保险）**：前端按 `kind` 保存 `cancelRequestedSessionIdByKind`，保证同一 `sessionId` 只发一次 `cancelScan`；取消 IPC 失败时，仅在该会话仍为活动会话且取消标记仍匹配时清除标记，允许重试；后端 `session.rs` 以 `HashSet` 记录已取消 id，重复取消为 no-op 成功。新会话（新 sessionId）自动重置取消标记（有单测 `cancel-idempotency.test.ts`）。
- **测速及时取消**：测速会话额外持有 Tokio `watch` 取消信号；ping 请求、下载/上传请求、下载响应体读取与阶段间等待均通过 `select!` 与取消竞争。用户取消后后端立即结束当前请求并返回 `cancelled`，前端结束 loading、不启动 30 秒冷却，允许立即重跑；会话用 RAII 清理取消信号。
- **端口扫描及时取消**：扫描会话的 Tokio `watch` 信号同时中断 nmap 子进程与内置 TCP connect 任务；内置扫描的速率间隔等待也必须响应取消、取消后不再启动新连接；nmap 使用 Tokio 子进程和 `kill_on_drop`，取消后终止子进程、回收任务并返回 `cancelled`，不得再降级启动第二轮 TCP 扫描。界面显示本地化取消状态；会话用 RAII 清理。
- **事件监听清理**：所有流式长任务在 `finally` 中 `unlisten()` 全部事件订阅（health-item / site-sample / traceroute-hop / ping-sample / speed-sample / port-sample / scan-session / pack-progress），避免泄漏与跨会话串扰。
- **单工具防重入**：每个 use-case 入口检查对应 loading；服务列表加载使用 `networkServicesStatus === "loading"` single-flight；批量离线诊断与 IPv6 / MTU / 公网出口单项检查互斥，同一工具不可并发，不同工具可并行（store 每工具独立 loading）。
- **单次探测结果与输入一致性**：TCP、DNS、自定义目标面板在请求期间禁用本次目标输入，结果卡片标明实际探测的主机/端口、域名或 URL。重试期间保留旧结果；如果本次调用拒绝/失败，仅清除对应旧结果并展示错误，避免把上一次成功误认为当前输入的结果；一个概览子请求失败时也只清除对应卡片，成功的兄弟项仍保留。后端返回的有效失败状态属于新结果，照常展示。
- **修复幂等**：后端每次执行前重新校验服务白名单（忽略前端「已确认」标志）；刷新 DNS 对 `dscacheutil`/`killall` 分别报告成功/失败，不把权限失败当成功。
- **single-flight 式刷新与 Agent 写入**：刷新概览（`loadingSummary`）、节点（`loadingNodes`）在用例内以 loading 标志防重复触发；节点刷新期间按钮禁用并显示进度，避免可点击但无操作；Agent 添加/移除共享 `agentMutation` single-flight，期间锁定两个写按钮与节点刷新；成功后直接更新当前节点列表，避免二次读取失败或并发旧响应覆盖。节点列表以 revision 丢弃过期 bootstrap/refresh 响应。能力包刷新也由用例层 single-flight，并在页面显示刷新态、禁用冲突操作。
- **测速冷却计时器生命周期**：冷却期间每 500ms 更新倒计时；达到 `cooldownUntil` 后清除 interval，卸载或冷却值变化时也清理，避免冷却结束后持续触发 React 重渲染。
- **系统设置导航**：`openSystemNetworkSettings` 只打开操作系统网络设置，不改变网络配置；保持在探测/修复期间可用，不参与目标写入锁。
- **Agent 注册与刷新安全**：HTTPS 健康检查请求 `<base>/v1/health` 并要求 2xx；WSS 输入完整健康检查地址，仅要求可信 TLS + WebSocket Upgrade 握手成功，连接后立即关闭且不发送消息。添加与刷新超时 5 秒、最多 8 个 Agent 并发，刷新保持注册顺序；不跟随 HTTP 重定向；不接受明文、URL 凭据、query 或 fragment；签名参数与 agent 凭据待 C2-3 的安全存储方案落地。

### 13.4 数据与安全

- 报告导出（JSON/Markdown）含公网 IP、Wi-Fi SSID、hosts 异常等，导出前展示隐私提示；reportHistory 仅保留最近 10 条（localStorage），清空需确认。
- 能力包安装路径：前端禁止提交下载 URL；仅后端 manifest 的 https URL + SHA-256 校验；`PACK_HASH_MISMATCH` 时二进制不落盘。
- `saveDefaultsOverride`/`resetDefaults` 失败 → `networkProbe.errors.defaultsFailed`；默认资源损坏时重置即可恢复内置值。
