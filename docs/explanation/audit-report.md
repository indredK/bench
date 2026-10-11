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

- [§3/§5/§9] [前端] `src/features/network-probe/components/HealthTreePanel.tsx` - **Low**：`HealthCheckItem.layer` 是可扩展字符串，但界面只渲染 L0–L3；后端新增层级时检查项及诊断会整行消失 - 为未知层级添加双语「其他检查」分组，保留每个原检查行，不暴露未知层级码；补 L0 与未来 L4 并存的回归 - **Philosophy**：展示分组不限制协议扩展，用户仍可看到未知来源的检查与中性状态，不会把缺数据误认为“没有问题” - **强制** - 状态：已修复（HealthTreePanel 14 项通过；macOS arm64 本机浏览器挂载真实组件，以合成 L0/L4 DTO 真机确认中文“其他检查”与英文 “Other checks” 均保留 L4 检查行，未运行网络探测）

- [§3/§5] [前端] `src/features/network-probe/services/network-probe.use-cases.ts::browseLanServices` - **Low**：浏览失败写入 `networkProbe.errors.lanSvcFailed`，重试开始却清除不存在的 `lanServicesFailed`，导致成功重试后旧错误横幅仍留在全局错误区 - 统一错误 key 并补失败后成功重试的回归，验证 `errors` 与主错误槽均清空 - **Philosophy**：反馈状态与产生它的操作使用同一错误身份，重试成功后用户看到的状态能反映当前结果 - **强制** - 状态：已修复（失败→成功 use-case 回归通过；macOS arm64 本机浏览器挂载真实错误通知组件，仓储 mock 中英文先显示相应失败提示，成功重试后错误横幅均消失，未执行网络发现）

- [§3/§5] [前端] `src/features/network-probe/page.tsx::handleProbeNodeChange`、`network-probe.use-cases.ts::clearProbeOriginResults` - **Low**：本机 Ping/自定义目标失败后切换至 Globalping，或反向切换时仅清结果而保留旧来源的错误横幅；相应面板会继续显示与当前探测原点无关的失败状态 - 清除 Ping/自定义目标本机错误及 Globalping 错误，同时保留 DNS 等无关错误；补通知列表和主错误槽回归 - **Philosophy**：来源选择变化会使旧来源的结果和错误一起失效，仍保留独立探测的诊断，不把一个面板的重置扩大成全局清空 - **强制** - 状态：已修复（回归先失败后通过；macOS arm64 本机浏览器挂载真实通知组件、store 与 use-case，中英文双向合成失败→切换→成功验证旧横幅消失且无网络请求）

- [§3/§5/§9] [前端] `src/features/network-probe/page.tsx::ProbeOriginSelector` - **Low**：Ping / 自定义 HTTP 探测尚未结束时仍可切换本机/Globalping；来源切换先清结果，而迟到的旧来源响应会被当前 UI 隐藏，迟到错误还可能出现在新来源下 - 探测进行时禁用原点选择器，并在 change handler 层拒绝迟到回调；增加运行中禁用/完成恢复组件回归 - **Philosophy**：运行中固定请求来源，避免前端选择状态与实际执行来源分离；恢复时仍允许用户切换，保持无额外取消语义的简单操作模型 - **强制** - 状态：已修复（ProbeOriginSelector 定向回归先失败后通过；macOS arm64 本机浏览器以真实选择器和慢速合成仓储确认运行中禁用、迟到回调忽略、完成后可切换，全程无网络请求）

- [§4.4/UX §4] [前端] `src/features/network-probe/components/PackInstallDialog.tsx` - **Risk**：通用「安装」会让用户误以为已获取能力包，但后端在 sidecar 制品未发布时只写本地 marker，相关工具仍处于降级；安装后列表还显示「已安装」 - **Severity**：Low - **Refactor**：未发布制品时明确显示「仅安装标记」及降级说明；已记录 marker 时继续显示 marker-only 状态和降级说明；不可用/未知状态禁用安装 - **Philosophy**：把持久化标记与实际可执行能力分开表达，避免界面承诺超过后端能力 - **强制** - 状态：已修复（macOS 27.0.1 arm64 隔离 Bench QA 中英文真机确认安装前说明、marker-only 状态与安装后降级提示；命令日志记录 `mode=marker`，未安装 sidecar 可执行文件）
- [§3/§5] [前端] `src/features/network-probe/components/NatPanel.tsx` - **Low**：未知 `natType` 通过普通对象索引命中继承属性（如 `constructor`），观测状态在结果卡中消失 - 使用 `Object.hasOwn` 校验已知映射，其他值显示本地化中性标签；补原型键回归 - 设计理念：协议/后端新增值不会被 JavaScript 原型污染误判，界面始终提供有效、可理解的状态 - **强制** - 状态：已修复（NatPanel 原型键测试与 Network Probe 216 项测试通过；macOS 27.0.1 arm64 隔离 Bench QA 对 `constructor` 合成 DTO 真机复现，修复版中文显示“未知观测状态”、英文显示 “Unknown observation state”；未发起 STUN 请求）
- [§3/§5] [前端] `src/features/network-probe/components/PollutionPanel.tsx` - **Low**：finding `kind` 为 `constructor` 时 `KIND_LABELS` 命中继承属性，检测类别标题消失 - 用 `Object.hasOwn` 映射；未知类型显示本地化“其他检查”，补原型键回归 - 设计理念：后端扩展值或不完整 DTO 不会被 JavaScript 原型成员误当成类别翻译键，风险摘要仍保留且类别信息可读 - **强制** - 状态：已修复（污染面板未知类型与原型键用例通过；Network Probe 43 文件 / 217 项测试通过；macOS 27.0.1 arm64 隔离 QA 对 `constructor` 合成 finding 基线实机复现，修复版中文显示“其他检测”、英文显示 “Other check”，审慎风险摘要保留；未授权安全工具或运行检测）
- [§3/§5/§9] [前端] `src/features/network-probe/utils/translation-key.ts` 与 Network Probe 动态 DTO 标签 - **Low**：未知 DTO 值被拼入 i18next 路径时，i18next 沿 JavaScript 原型解析 `constructor` / `toString`，导致 IPv6 等用户可见状态变成空白；普通映射表对未知键也可能误命中原型成员 - **Refactor**：为对象映射使用自有键检查，为动态翻译路径逐段验证 locale JSON 自有键且只接受字符串叶子；未知值回退本地化文案，无法翻译的站点包 ID 保留原文；补跨组件原型键回归 - **Philosophy**：协议扩展值与语言资源解耦，异常或未来 DTO 值始终有可读结果，不因继承属性丢失状态，也不会误用成功/失败语义 - **强制** - 状态：已修复（Network Probe 44 文件 / 232 项测试、`lint:fe` 通过；macOS arm64 隔离 QA 基线复现 `status: constructor` 空白，修复版中文“未知”、英文 “unknown”，NDP 同样安全回退；未发起探测）

未完成 R00-R08 前不得切换 2.0.0 版本；未完成目标平台行为测试前不得把对应能力标记为发布对等。

## 记录格式

```markdown
- [§X] `文件路径:行号` - 问题 - 修改建议 - **强制/建议** - 状态：已报告/已修复/不修复
```

审计前先读本文件；修复后更新或删除对应风险，不追加无追踪价值的流水账。

- [§3/§5] `src/features/network-probe/components/FixPanel.tsx` - **Low**：一键修复结果卡原样显示 `flushDns` 等后端动作值、系统英文诊断与 `commandHint`；命令已在工具栏预览，造成重复并让中文界面混入英文 - 动作名改为本地化映射；成功/失败状态提供 `status` / `alert` 语义，原始 `message` 和命令收进默认折叠的技术详情；补已知/未知动作回归 - **强制** - 状态：已修复（macOS 27.0.1 arm64 隔离 QA 真机先后在中文/英文复现和复验；刷新 DNS 成功状态本地化，原始诊断与命令默认折叠，展开仍可查看）
- [§3/§5/§9] `src/features/network-probe/components/SpeedPanel.tsx` — Risk [前端]：测速结果卡在诊断默认折叠、调用已记入命令日志后仍直出含 `sessionId` 的 `commandHint`，重复信息挤占指标卡空间。Severity: Low。Refactor: 诊断与命令统一使用共享 `TechnicalDetails` 默认折叠，按钮预览和带时间戳命令日志保留；增加失败和成功结果回归。Philosophy: 普通用户先看到结果和本地化状态，原始实现信息按需展开，同时保留可追溯性和双语标签。状态：已修复；macOS 27.0.1 arm64 隔离 QA 真机中英文失败路径均确认结果卡隐藏命令、日志保留调用，技术详情默认收起且可展开查看诊断和命令。
- [§3/§5/§9] `src/features/network-probe/components/LanServicesPanel.tsx` — Risk [前端]：局域网部分失败的 `MDNS_*` / `SSDP_*` 内部码直接进入 `role=alert`，中文界面也会显示英文标识。Severity: Low。Refactor: 用户提示只说明失败协议；原始错误码收进默认折叠的共享 `TechnicalDetails`，覆盖已知码与未知码回退。Philosophy: 用户先获得可理解、可翻译的结果，支持排障的协议码仍可按需查阅。状态：已修复；macOS 27.0.1 arm64 QA 中英文实机均验证本地化提示、默认折叠和展开后的 `SSDP_SEARCH`，正常发现路径返回 6 个服务。
- [§3/§5/§9] [前端] `src/features/network-probe/components/PingPanel.tsx` - **Risk**：Ping 结果卡只展示解析 IP 和统计；探测完成后仍可编辑目标，用户会将旧结果误认为新输入的探测结果，本机与 Globalping 均未在卡片标出实际目标 - **Severity**：Low - **Refactor**：本机 `PingProbeResult.target` 和 Globalping `GlobalpingPingResult.target` 均显示为本次探测目标，复用 `networkProbe.probe.resultFor` 双语资源；新增编辑输入后旧结果仍显示原目标的组件回归 - **Philosophy**：把结果与生成它的请求参数绑定在同一视觉卡片中，保留可编辑表单同时避免目标错配；长目标可换行，不推挤相邻命令日志 - **强制** - 状态：已修复（Network Probe 17 项定向回归、全量前端 104 文件 / 596 项测试、`lint:fe`、Prettier 通过；macOS 27.0.1 arm64 隔离 Bench QA 先用 `127.0.0.1` 成功探测，编辑输入为 `127.0.0.2` 后在中英文界面均确认结果卡仍显示原目标 `127.0.0.1`；仅探测回环地址。Globalping 目标由组件回归验证，未发起远端请求）。

- [§3/§5] [前端] `src/features/network-probe/services/network-probe.use-cases.ts` - **Low**：四类一键修复共用 `fixResult`；重试失败时保留上次成功卡，同时显示本次失败横幅，用户无法判断当前操作结果 - `flushDns`、`switchDns`、`renewDhcp`、`resetNetworkStack` 在设置 loading 后、调用仓储前清空旧结果；回归覆盖请求开始时清空、失败后只保留当前错误 - **Philosophy**：共享结果槽始终对应最近一次操作，失败结果不会与历史成功状态并列误导用户 - **强制** - 状态：已修复（四项 use-case 回归通过；macOS arm64 本机浏览器挂载真实 FixPanel、错误通知、store 与 use-case，以合成仓储复验失败后旧结果卡消失、错误横幅出现、成功重试显示新结果，并验证中文动作与状态；未修改真实网络配置）
- [§3/§5/§9] [前端] `src/features/network-probe/hooks/useNetworkProbeController.ts::revokeSecurity`、`network-probe.use-cases.ts` - **Low**：撤销授权卸载活动端口扫描/抓包面板，却未取消其后台会话；撤权前的一次性安全查询仍可在重新授权后写回结果或错误 - 撤权时清空安全结果并取消活动扫描/抓包，通过授权修订号阻止迟到响应、错误和流式采样回写；覆盖活动及迟到会话事件 - **Philosophy**：用户撤权后界面、可见结果和后端长任务同步反映授权状态；旧授权启动的异步结果不能跨越撤权边界污染新一轮状态 - **强制** - 状态：已修复（3 项回归覆盖活动端口/抓包、迟到 session 事件和并行查询；macOS arm64 本机浏览器以真实 SecurityAuthGate 和 PortScanPanel 配合合成仓储基线复现 `loading=true` 且取消调用为 0，修复版取消调用为 1、loading 结束、无结果回写；无真实扫描或网络请求）

- [§3/§5] [前端] `src/features/network-probe/components/OfficialSitesPanel.tsx::handleTestOne` - **Low**：单站重测前会在 store 清除上次整包结果，但组件本地按 target 缓存未清除；请求整体失败时全局错误横幅出现，旧成功卡仍显示绿色状态和延迟，违反“运行或失败不得显示旧结果为当前结果”约定 - 重测开始只移除目标站点的本地样本，其他卡片结果保留；成功流继续更新目标卡，请求整体失败时保持未测，正常返回的失败样本仍显示失败 - **Philosophy**：卡片状态仅代表最近一轮已完成结果，错误反馈不会与过期成功状态并列误导用户 - **强制** - 状态：已修复（官网重测回归通过；macOS arm64 本机浏览器真实挂载 OfficialSitesPanel 与错误通知，以合成仓储失败基线复现“失败横幅 + 旧绿色卡”，修复后目标卡回到未测、其他卡片保留；未访问公网或运行真实探测）
- [§3/§5/§9] [前端/后端] `SitesProbePanel.tsx::loadCustomSites`、`src-tauri/src/net_probe/sites.rs::sites_probe_custom` - **Risk**：sessionStorage 中旧版或异常缓存超过文档规定的 24 项时，界面只禁用“添加”却仍允许运行全部目标；Rust IPC 原先限制为 32 项，因此 25–32 个目标会实际执行，重复缓存也可能重复探测 - **Severity**：Low - **Refactor**：读取缓存时 trim 并去重，超 24 项时保留条目、显示双语超额数并禁用运行；Rust 在探测前去重，并拒绝超过 24 个唯一目标。加入 UI 交互和纯 Rust 输入校验回归 - **Philosophy**：保留用户数据并提供修复路径，同时让 UI 与后端执行相同的资源上限，避免过量或重复的外部探测 - **强制** - 状态：已修复；macOS arm64 本机浏览器合成 25 项缓存复现仍能运行，修复后中英文禁用并提示，移除一项后仅传 24 项；前端全量 615 项、关键 244 项、Sites 面板 11 项、Rust sites 校验 2 项、Rust Clippy、i18n/文档守卫和生产构建通过；全程未访问站点。
- [§3/§5] [前端] `src/features/network-probe/components/OverviewPanel.tsx` - **Risk**：工具栏把 `getLocalNetworkSummary()` 原始 IPC 命令作为常驻文本显示在刷新按钮旁，挤占概览操作区并把内部实现标识放进普通用户主视图。**Severity**：Low。**Refactor**：将命令移至刷新按钮的 `CommandHint` hover/focus 预览；回归验证预览仍绑定刷新操作、常驻正文不再含命令且按钮仍能调用。**Philosophy**：默认界面聚焦可执行动作与网络摘要，排障命令按需查看。**强制** - 状态：已修复（macOS arm64 本机浏览器挂载真实 OverviewPanel 和项目样式，修复前复现命令常驻、修复后确认工具栏不再展示；只使用合成 DTO，无系统网络刷新或外部请求）。
