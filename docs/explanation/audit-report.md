# Bench 审计记录

本文件只保留审计豁免和仍有效的风险；已修复历史由 Git 保留，可复用规则已进入 [coding-standards.md](../how-to/coding-standards.md) 与 [ARCHITECTURE.md](../reference/architecture.md)。

## 不计违规决策

除非前提变化，后续审计不重复报告：

1. `src/data/phone.ts` 保留中文原始数据，展示层通过 `PHONE_*_KEYS` 和 `t()` 翻译；新增数据必须同步映射。
2. `src/features/hardware/` 无真实编排时无需空 `hooks/`、`services/`。
3. 各模块 `columns.tsx` 差异大，不为形式统一抽取。
4. `lib/tauri/commands/*` 已是纯 IPC 适配时，不新增只 re-export 的 feature repository。
5. 页面本地状态无需强制进入 Zustand；跨组件/页面共享后再上提。
6. `src-tauri/src/lib.rs` 启动链末端 `.expect()` 可保留；IPC 和可降级初始化路径仍禁止 panic。
7. 子组件用 selector 读取稳定 store action 可保留；禁止无 selector 整 store 订阅进入 hook 依赖。
8. `dev-toolbox` 是聚合 Tab，`updater` 是全局对话框，不强制拥有导航 feature 的完整结构。

## 当前风险

- [§7/§8/§4] `src/features/photo-triage/`、`src-tauri/src/photo_triage/` - 2026-09-03 复查发现并已修复：11 处 IPC 路径 `lock().unwrap()`（Mutex 中毒回归）、阻塞 I/O 未 `spawn_blocking`（7 命令）、sips/ffmpeg/qlmanage 无超时未复用 `subprocess.rs`、`prune` 源目录不可达时静默清除引用、`move_items` 部分失败不回滚、`ConfirmSheet` 硬编码中文插值、`window.confirm` 原生弹窗、文档注册三缺口（modules/README 索引、check-docs 豁免、D-020 决策）与持久化治理（config.json schema v1 + manifest 256MB 上限 + persistence-schema 登记） - 均已修复；`trash/restore/move/prune` 补 5 个 Rust 行为测试待验证链执行 - **强制** - 状态：代码已修复/待验证
- [§3/§5/§6/§9] `src/features/account-manager/` - 缺区域 error/retry 与大文件分层；Keyring/WebView/Deep Link 双平台行为未验收 - 区域 error/retry、分层拆分与错误统一已由 R01 关闭；真机部分执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待验收
- [§3.3/§7/§8] `src-tauri/src/account_manager/` - 同源 Web Storage/IndexedDB、canonical Cookie expiry、single-flight、Deep Link inbox 和 capability 已实现；partition key 不可用且目标平台行为未验收 - 保持 partitioned Cookie fail-closed，执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待验收
- [§7.4/§9] `src-tauri/src/app_manager/` - 缺双平台 inventory fixture、启动/更新/卸载 smoke 和 CI runner；快照缓存契约（损坏/上限/schema/取消）已由 R02 代码项关闭 - fixture 与 smoke 执行 [App Manager roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/app-manager/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§6/§9] `src/features/quick-launch/` - 缺 macOS/Windows 启动 smoke 和 500/2000 应用性能证据；2000 项虚拟化单元测试已入 `test:critical` - 性能数据执行 [Quick Launch roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/quick-launch/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§5/§7/§9] `src/features/system-settings/`、`src-tauri/src/clean_space/` - 核心保护已实现，macOS 权限拒绝、read-after-write、受保护目录、timeout 和真实释放量未真机验收 - 执行 [R03](../roadmap/ROADMAP.md#r03-macos-system-settings-与-clean-space) - **强制** - 状态：代码已修复/待验收
- [§7/§9] `.github/workflows/ci-build.yml` - RC dry-run 入口与 Release 副作用 guard 已由 R05 落地；仍缺真实 updater 私钥三目标 run - 执行 [R05](../roadmap/ROADMAP.md#r05-updater供应链与-rc-流水线) dry-run - **强制** - 状态：部分修复/待验收
- [§9] 全局 UX - Playwright/axe 基建、viewport 矩阵与键盘用例已落地（`pnpm run test:e2e`）；截图 baseline 人工审查与屏幕阅读器 smoke 未执行 - 执行 [R07](../roadmap/ROADMAP.md#r07-ux可访问性与视觉回归) - **强制** - 状态：部分修复/待验收
- [§7/§9] 持久化与 updater - 持久化 schema 清单已建立（[persistence-schema.md](../reference/persistence-schema.md)），1.23.0 脱敏 fixture 与迁移幂等测试已入 `cargo test`；真机升级/回滚演练未执行 - 执行 [R06](../roadmap/ROADMAP.md#r06-1230-升级迁移与回滚) - **强制** - 状态：代码已修复/待验收
- [§7/§9] `src-tauri/tauri.conf.json` - `com.bench.app` 后缀警告已接受；D-011 要求 2.0 保留，不得直接改字符串 - **建议** - 状态：接受风险
- [§3.3/§5] `src/features/network-probe/components/DnsLookupPanel.tsx` - DNS 查询期间仍可修改域名、RR 类型和 resolver，慢响应或失败时结果/错误会与当前表单值错配 - 请求期间锁定全部查询参数并补状态回归测试 - **强制** - 状态：已修复（macOS arm64 隔离 QA 真机复验）
- [§3/§5] `src/features/network-probe/components/WhoisPanel.tsx`、`src-tauri/src/net_probe/whois.rs` - WHOIS 查询失败时原始 RDAP 响应、网络诊断和命令直接显示；HTTP 状态串重复暴露英文，且无正文的失败结果被误标为部分响应 - 失败摘要本地化、来源只显示 `rdap.org`、技术诊断/命令默认折叠；仅截断的有效正文保持可见，失败响应不再写入 `rawText` - **强制** - 状态：已修复（macOS arm64 隔离 QA 真机验证失败与成功路径）
- [§3/§5/§9] `src-tauri/src/net_probe/advisor.rs` - Captive 探测的 `warn`（异常响应、尚不能确认门户）被 Advisor 分支静默丢弃 - 生成 `warn` 级不确定建议，增加纯函数与双语面板回归，并将 Health DTO 纳入 Rust/TS 契约检查 - **强制** - 状态：已修复（macOS arm64 原生规则测试、组件双语回归；隔离 Bench 验证导航/空态和语言切换，因 IPv6 约束未执行完整体检 UI 流程）
- [§3/§5/§9] `src/features/network-probe/components/Ipv6Panel.tsx` - 双栈/NDP 状态及原生摘要、诊断、traceroute 提示和命令直接显示，摘要漏本地化且普通用户默认暴露技术细节 - 双栈结论与 NDP 状态改为按结构化 DTO 本地化；原始信息与结果命令移入默认折叠的技术详情，运行按钮保留 IPC 命令悬浮预览；补组件回归 - **强制** - 状态：已修复（macOS arm64 QA 包以合成 DTO 验证中英结果、折叠和展开，不执行 IPv6 探测）
- [§3/§4/§5/§9] `src/features/network-probe/components/OfflinePanel.tsx` - 上不了网概览摘要直接显示 Captive/代理诊断、命令及 IPv6/MTU 原生错误细节，部分未知状态也会把后端标识原样暴露给用户 - 状态本地化并增加未知值回退；Captive/代理原始诊断与命令移入默认折叠的技术详情，IPv6/MTU 摘要精简为本地化状态与路径 MTU，完整细节保留在各自面板；补合成 DTO 回归 - **强制** - 状态：已修复（macOS arm64 隔离 QA 验证中英文摘要及展开/收起，未执行 IPv6/MTU/一键网络探测）
- [§3/§5/§9] `src/features/network-probe/components/PcapDiagPanel.tsx` - PCAP 结果卡直接显示内部模式名、原始英文诊断和含 session ID 的命令；不可用结果仍显示零计数，容易被理解为成功的空采样 - 按 locale 本地化状态与模式；只在计数采样模式展示统计；不可用时明确显示无采样且隐藏重复模式标签；诊断和命令收进默认折叠的共享技术详情组件；补中英文、未知模式、不可用及取消回归 - **强制** - 状态：已修复（macOS arm64 合成 DTO 真机验证中英文成功/不可用状态和详情展开/收起；未授权、未抓包）
- [§3/§5/§9] `src/features/network-probe/components/PortScanPanel.tsx`、`src/features/network-probe/page.tsx`、`src/features/network-probe/utils/capability-presentation.ts` - 端口扫描结果没有标明原目标，表单可编辑导致旧结果被误认；零样本取消无结果说明；原始命令直出；能力禁用提示与平台/权限摘要泄漏 `portScan`、`unsupported`、`macos`、`none` 内部标识 - 结果显示 DTO 原目标，零样本增加本地化状态，诊断与命令默认折叠，能力摘要映射为中性本地化平台/权限文案 - **强制** - 状态：已修复（macOS arm64 隔离 QA 用合成 DTO 验证中英文目标关联、禁用提示、平台摘要和详情展示；SecurityAuthGate 未授权、未扫描）

- [§3/§5/§9] `src/features/network-probe/components/SitesProbePanel.tsx:301` - 区域/自定义站点探测完成后，结果卡直接展示原始 `commandHint`（含内部 IPC 调用与 session ID），且右侧命令日志已记录同一次调用；macOS arm64 QA 对 `https://example.com` 两次复现 HTTP 200 后均可见 - 移除结果卡中的重复命令文本，保留工具栏命令预览与命令日志，并补中英文成功/失败回归 - **强制** - 状态：已修复（Medium；macOS 27.0.1 arm64 隔离 QA 在中英界面两次探测均返回 HTTP 200，结果卡隐藏 commandHint、命令日志保留调用；前后截图见 `/tmp/bench-dogfood-20261010/sites-command/screenshots/`）

- [§3/§5/§9] `src/features/network-probe/components/TcpConnectPanel.tsx` - TCP 结果卡在系统错误已默认折叠、调用已写入带时间戳命令日志的情况下，仍在卡片正文重复展示原始 `commandHint`；macOS 27.0.1 arm64 对 `127.0.0.1:1` 实测“连接被拒绝”后复现 - 移除结果卡重复命令，保留按钮悬浮预览、折叠技术详情及命令日志；补成功/失败回归 - **强制** - 状态：已修复（Medium；macOS 27.0.1 arm64 隔离 QA 中英文拒绝路径和本机监听成功路径均验证结果卡无 raw command，调用仍保留在带时间戳日志；组件 9 项、`lint:fe`、文档链接检查通过）

- [§3/§5/§9] `src/features/network-probe/components/ProbeTargetPanel.tsx` - 自定义目标结果卡重复展示已记入命令日志的原始 `commandHint`，直接暴露后端 `host/url` 标识，且未标明结果所属输入，改表单后容易将旧结果误认为新目标的结果 - 结果卡展示脱敏后的 DTO 输入，按 locale 映射输入类型并移除重复命令；保留按钮命令预览与时间戳日志；覆盖本地/Globalping 命令去重、脱敏、未知类型与编辑输入后的关联回归 - **强制** - 状态：已修复（Medium；macOS 27.0.1 arm64 隔离 QA 对 `https://example.com` 实测 HTTP 200，中英文卡片显示“本次探测目标 / Probed target”与本地化 URL、无命令重复；改输入为 `https://iana.org` 后旧结果仍标明原目标，带时间戳命令日志保留；组件 3 项、Network Probe 42 个文件/198 项、`lint:fe`、88 份文档链接检查及 debug QA `.app` 构建通过；Globalping UI 状态由组件测试覆盖，未调用远端测量）

- [§3/§5/§9] `src/features/network-probe/components/HealthTreePanel.tsx` - Health Tree 完成后在检查树下方直接重复输出含 `sessionId` 的 `HealthScanResult.commandHint`，即使工具栏已显示通用命令预览且右侧命令日志已记录该会话；不符合体检规格的命令/诊断默认收纳方式 - 移除结果区重复输出，保留工具栏预览、命令日志和行级默认折叠技术详情；补 session-specific command 不渲染的回归 - **强制** - 状态：已修复（Medium；macOS 27.0.1 arm64 隔离 QA 真机运行 21 项体检复现，完成后结果区暴露 session ID，行级详情保持折叠；修复版 macOS 27.0.1 arm64 QA 再跑 21 项，结果区不再显示该命令，工具栏预览、带时间戳启动/完成日志和行级折叠详情保留；HealthTreePanel 5 项、Network Probe 42 个文件/199 项、`test:critical` 244 项、`lint:fe`、88 份 Markdown 链接与 Prettier 通过；前后截图见 `/tmp/bench-dogfood-20261010/health-command/screenshots/baseline-window.png` 和 `after-window.png`）
- [§5/§9] `src-tauri/src/net_probe/health.rs::synthesize_dns_vs_ip` - 公网 IP 可达、域名 HTTP 探测失败时无条件归因 DNS/Hosts，即使独立 DNS/Hosts 检查通过；Advisor 因此可能提示无关修复 - 合成诊断结合 `dns.servers`、`dns.resolve_name`、`hosts.override` 证据，无支持证据时改为原因未定警告，并本地化对应摘要 - **强制** - 状态：已修复（Medium；macOS 27.0.1 arm64 隔离 QA 真机运行 21 项，复现公网 IP/DNS/Hosts 正常、域名探测失败和公网出口 HTTP 200 的组合；Health Tree 显示原因未定警告，Advisor 显示代理/TLS/防火墙/目标服务建议，无 DNS/Hosts 严重错误）

- [§4/§5] `src/features/network-probe/components/PackInstallDialog.tsx` - **Low**：能力包列表把后端 `installed` / `available` / `unavailable` 状态直接插入界面，中文用户可见原始英文 `available` - 状态按中英文 locale 映射，未知值回退为本地化“状态未知”；补四态组件回归 - **强制** - 状态：已修复（macOS 27.0.1 arm64 隔离 Bench QA 基线与修复版 UI 分别复现与确认；中文显示“可用”，英文显示“Available”；QA 进程退出且正式 `bench-host` 保留）
- [§3/§5] `src/features/network-probe/components/ReportPanel.tsx` - **Low**：报告页在导出按钮下直接显示带 session ID 的原始 `commandHint`，同一会话已在两个命令日志区域展示 - 移除报告摘要中的重复原始命令，保留命令日志和带隐私提示的导出；补报告页回归 - **强制** - 状态：已修复（macOS 27.0.1 arm64 隔离 QA 对只读 21 项体检两次复现；修复版再次实跑 21 项，中英文报告页均不再显示原始命令，隐私提示、历史与命令日志保留）

- [§3/§5/§9] [前端] `src/features/network-probe/components/HealthTreePanel.tsx` - **Low**：Health DTO 允许任意状态字符串，未识别状态原样显示为内部标识，且没有明确的状态语义/视觉层级 - 已知值走双语映射，未知值统一显示本地化中性徽标，避免把协议扩展值误当用户文案 - 设计理念：界面语言与协议标识解耦，未识别值不会误用通过/失败颜色或暴露内部码 - **强制** - 状态：已修复（HealthTreePanel 定向测试 12 项；Map 查找覆盖 `toString` / `constructor` 等原型键；macOS arm64 隔离 QA 实际运行 21 项体检，合成未知状态在中文显示“未知状态”、英文显示 “UNKNOWN STATUS”，默认中性色；本次无注入的隔离 debug `.app` 构建成功）

- [§3/§5/§9] [前端] `src/features/network-probe/components/SitesProbePanel.tsx` - **Low**：自定义站点达到 24 项上限后仍可输入并点击“添加”，`.slice(0, 24)` 会静默丢弃新目标并清空输入；超限的既有列表再添加时还可能覆盖末尾旧目标 - 显示中英文计数与上限提示，达到上限后禁用添加、保留输入，并在状态更新时保护已有列表；补满额、草稿保留和 sessionStorage 不变回归 - 设计理念：约束在操作前明确可见，用户输入与持久化目标不会因容量限制被静默丢失 - **强制** - 状态：已修复（macOS 27.0.1 arm64 隔离 QA 真机先复现第 25 项输入被清空但列表未增加；修复版中英文均显示 24/24 和移除提示、禁用添加，并保留待添加输入及原 24 项；Network Probe 回归通过，QA 应用/专属数据与构建 staging 已移入系统废纸篓）
- [§4.4/UX §4] [前端] `src/features/network-probe/components/MultiNodePanel.tsx` - **Low**：Agent 端点允许最长 2048 字符，未断行的长路径在节点列表中横向覆盖命令日志 - 将名称/状态/移除操作与端点分行，端点限宽省略并保留完整值；补长端点组件回归 - 设计理念：长内容不挤占相邻面板，仍可通过悬停和无障碍树读取完整端点 - **强制** - 状态：已修复（macOS 27.0.1 arm64 隔离 Bench QA 基线真机复现；修复版中文/英文界面确认端点均限宽且命令日志可见；MultiNodePanel 定向测试 10 项通过）

未完成 R00-R08 前不得切换 2.0.0 版本；未完成目标平台行为测试前不得把对应能力标记为发布对等。

## 记录格式

```markdown
- [§X] `文件路径:行号` - 问题 - 修改建议 - **强制/建议** - 状态：已报告/已修复/不修复
```

审计前先读本文件；修复后更新或删除对应风险，不追加无追踪价值的流水账。

- [§3/§5] `src/features/network-probe/components/FixPanel.tsx` - **Low**：一键修复结果卡原样显示 `flushDns` 等后端动作值、系统英文诊断与 `commandHint`；命令已在工具栏预览，造成重复并让中文界面混入英文 - 动作名改为本地化映射；成功/失败状态提供 `status` / `alert` 语义，原始 `message` 和命令收进默认折叠的技术详情；补已知/未知动作回归 - **强制** - 状态：已修复（macOS 27.0.1 arm64 隔离 QA 真机先后在中文/英文复现和复验；刷新 DNS 成功状态本地化，原始诊断与命令默认折叠，展开仍可查看）
- [§3/§5/§9] `src/features/network-probe/components/SpeedPanel.tsx` — Risk [前端]：测速结果卡在诊断默认折叠、调用已记入命令日志后仍直出含 `sessionId` 的 `commandHint`，重复信息挤占指标卡空间。Severity: Low。Refactor: 诊断与命令统一使用共享 `TechnicalDetails` 默认折叠，按钮预览和带时间戳命令日志保留；增加失败和成功结果回归。Philosophy: 普通用户先看到结果和本地化状态，原始实现信息按需展开，同时保留可追溯性和双语标签。状态：已修复；macOS 27.0.1 arm64 隔离 QA 真机中英文失败路径均确认结果卡隐藏命令、日志保留调用，技术详情默认收起且可展开查看诊断和命令。
- [§3/§5/§9] `src/features/network-probe/components/LanServicesPanel.tsx` — Risk [前端]：局域网部分失败的 `MDNS_*` / `SSDP_*` 内部码直接进入 `role=alert`，中文界面也会显示英文标识。Severity: Low。Refactor: 用户提示只说明失败协议；原始错误码收进默认折叠的共享 `TechnicalDetails`，覆盖已知码与未知码回退。Philosophy: 用户先获得可理解、可翻译的结果，支持排障的协议码仍可按需查阅。状态：已修复；macOS 27.0.1 arm64 QA 中英文实机均验证本地化提示、默认折叠和展开后的 `SSDP_SEARCH`，正常发现路径返回 6 个服务。
