# Network Probe（网络探测 / 网络急救箱）规划功能

> 本文件记录 network-probe 模块**未实现 / 待验证**的功能规划，与 `../product-specs/network-probe.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 来源：`../modules/network-probe/roadmap.md` 的 Wave 表格（⬜ 待实现 / ◐ 部分完成）、ROADMAP 与 design 文档。

## 当前状态

- 模块 1.0 / MVP A+B 已闭环（D-016）。
- Post-MVP：测速 + Globalping DNS + agent 注册骨架 + 安全/发现主路径已交付；**指纹增强与特权 helper 仍待**。

## 待实现（未完成项）

### Wave 0 · Polish 基线（可并行）

- [ ] **P0-1** MVP 面板空态 / 失败态 / 重入与取消一致性扫尾（S-X-\* · coding §3/§5）。

### Wave 3 · 安全 Tab（续）

- [ ] **S3-6** 服务 / OS 指纹 + 风险标注（依赖 S3-5）。
- [ ] **S3-8** 特权分层：`priv-helper` / 触发提权 / 自动降级文案（依赖 Wave 1）。

### Wave 5 · Polish 增强（产品化）

### Wave 2 · Post-MVP-C（续）

- [ ] **C2-2** Globalping 代理补全：remote ping / http + token（DNS multi 已交付，◐）。
- [ ] **C2-3** 自有 agent 远程执行：TLS / 鉴权 / 限速贯通，`nodeId` 全链路（HTTPS 与 WSS 注册/健康检查、白名单已交付；凭据存储与远程执行待，◐）。

## 待验证（真机 / 行为）

- [ ] macOS 真机：Local Network / TCC 权限不足时各探测（ping/ARP/抓包）的稳定错误码与「打开系统设置」引导生效。
- [x] macOS 隔离 QA 真机：测速源指向 `127.0.0.1:9` 后进入 30s 不可用冷却；倒计时结束后恢复重试，interval 停止（诊断计数连续 2.2s 不变）。
- [x] macOS 隔离 QA 真机：ping 正常但下载请求超时、上传失败时进入 30s 冷却；倒计时结束可重新测速，取消重试不进入冷却。
- [x] macOS 隔离 QA 真机：下载响应体持续挂起时取消测速，界面立即结束 loading 且不进入冷却；马上重跑并再次取消成功，本机 loopback 服务两次都观察到响应连接关闭。
- [ ] `priv-helper` 提权路径（Wave 1 pack）在真实系统上可安装、触发提权、自动降级文案正确。
- [x] 能力包 hash 校验失败通道（`installCapabilityPackVerifyFail`）行为符合预期：本地化错误可见、不安装、不执行二进制，能力包列表保持未安装状态。
- [ ] Windows 降级路径：各工具 `unsupported`/`degraded` 状态与按钮禁用一致，不误报。

## 远期（Vision P5–P7 · Wave 6）

> 体积与合规风险最高，需单独授权范围。

- [ ] **V6-1** 网络配置向导（静态 IP / 路由 / VPN / 防火墙 · 三次确认）。
- [ ] **V6-2** 重型抓包（会话重组 / 应用层解码 · 按需加载 · 强依赖 pack）。
- [ ] **V6-3** 邮件诊断：SPF/DKIM/DMARC、RBL、邮件服务器。
- [ ] **V6-4** SNMP / BGP / VLAN 企业网管。
- [ ] **V6-5** 按进程流量监控（nethogs 类，可独立子模块）。
- [ ] **V6-6** 授权资产审计（nuclei/amass 风格 · **仅授权资产** · 强授权 UX）。

## 红线（不实现）

- 主动攻击能力：ARP 欺骗攻击 / MITM 流量注入 / DoS / 密码爆破 → 违法，绝不构建（每波验收含 S-X-06 红线负向）。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：首版生成——依据 `docs/modules/network-probe/roadmap.md`（Wave 0–6）与 `docs/roadmap/ROADMAP.md` D-016，提炼 ⬜/◐ 未完成项为「待实现」「待验证」「远期」三档；产品说明见 `../product-specs/network-probe.md`。
- 2026-10-22：完成 P5-4；基础视角改为六区同页滚动与页首跳转，站点延迟保留为独立一级页；产品规格同步更新。
- 2026-10-22：P0-1 部分推进；概览与一键诊断改为逐项结算、保留刷新中的旧结果并呈现失败项，失败项清理过期结果；修复取消失败后的重试标记，网络服务列表增加 single-flight / retry / 空态与恢复清错，离线批量与 IPv6 / MTU / 出口检查互斥。P0-1 保持未完成，权限拒绝真机验收及其余 S-X 覆盖仍待验证。
- 2026-10-22：修复执行期间锁定网络服务与 DNS 目标，并暂停服务刷新，防止结果与当前选择不一致；同步产品规格。P0-1 仍未完成。
- 2026-10-22：补齐 Agent WSS 健康握手（复用 reqwest TLS/系统代理）、原子串行注册表写入、错误可见和前端添加/移除 single-flight；节点刷新按 revision 丢弃过期响应。P0-1 仍未完成，权限拒绝与其余场景验收待做。
- 2026-10-22：修正 Agent 节点刷新曾将所有 Agent 固定标为不可达的问题；HTTPS/WSS 刷新现做最多 8 路并发健康检查、保留注册顺序，节点类型与可达状态增加双语展示。macOS QA bundle 已真机验证基础页与 WSS 握手/刷新；PR #154 的 `24e7177a` 全部远程检查通过。
- 2026-10-22：P0-1 复查修复节点刷新期间按钮仍可点击但用例无操作的反馈问题；按钮现与 `loadingNodes` 同步禁用并有关键测试覆盖，规格同步更新。基础页真机验收通过；PR #154 的 `24e7177a` 全部远程检查通过。
- 2026-10-22：完成 P0-2；关键测试门禁现覆盖 network-probe 行为测试与 IPC contracts，后端已有 cancel 幂等、Advisor 纯函数和无特权降级状态测试；`test:critical`、`cargo test net_probe:: --lib` 已通过。
- 2026-10-22：用独立 `com.bench.qa.netprobe20261022` QA HOME 真机检查 BasicView 六区与锚点跳转；`wss://ws.postman-echo.com/raw` 握手成功，刷新后仍为可达；隔离不可达地址显示正确提示。测试 Agent 已从 QA 注册表移除，窗口关闭，QA HOME 与打包产物移入废纸篓；PR #154 的 `24e7177a` 全部远程检查通过。
- 2026-10-22：Wi‑Fi 摘要改用共享 CoreWLAN helper，替换 macOS 15.4+ 已移除的 `airport` 解析；真机读取到信号与信道但无 SSID（无权限弹窗）。基础页现会在 SSID 缺失时显示 dBm，隔离 QA bundle 真机复验通过；SSID 正向路径仍待系统允许读取的环境验证。
- 2026-10-23：修复概览首次加载失败后因 `summary` 仍为空而自动无限重试的问题；失败态现停止自动请求，保留手动刷新恢复入口。回归用例覆盖自动停止与手动重试；macOS Bench 六区页面真机复验通过，`test:critical` 280 项与前端门禁通过；P0-1 及其权限拒绝和其他场景验收仍未完成。
- 2026-10-23：报告历史与命令日志清空现要求二次确认，空日志时禁用清空按钮；产品规格同步更新。隔离 macOS QA bundle 真机验证历史弹窗与取消后数据保留，`test:critical` 282 项通过；PR #154 的 `24e7177a` 全部远程检查通过。
- 2026-10-23：补齐 Network Probe IPC 命令日志覆盖，统一只记录命令名、避免用户输入参数落入日志；产品规格同步隐私约束。回归测试覆盖概览、离线诊断、single-flight 与参数脱敏；隔离 QA bundle 真机确认 8 条启动命令只显示命令名、取消清空后日志保留；`test:critical` 284 项、`lint:fe` 通过，PR #154 的 `24e7177a` 全部远程检查通过。
- 2026-10-23：补齐概览、修复、IPv6、MTU、公网出口、ARP 设置、Agent 刷新/移除、能力包刷新/校验入口的 IPC hover 命令提示；组合概览 tooltip 列出全部三个子命令，产品规格同步更新。`test:critical` 286 项、`lint:fe` 通过；隔离 `com.bench.qa.commandhints20261023` 真机通过键盘焦点验证概览与修复命令提示；未执行网络探测或修复；PR #154 的 `e88e0f07` 全部远程检查通过；P0-1 仍未完成。
- 2026-10-23：修复 Agent 注册表损坏导致 Network Probe 启动数据整体丢失、节点列表错误显示为空的问题。能力、默认值、能力包与节点独立结算；已成功的本机数据在节点读取失败时仍可用，节点区显示双语错误与重试。回归测试证明原行为会丢能力数据；修复后 `test:critical` 289 项、`lint:fe` 通过；隔离 `com.bench.qa.bootstrap20261023` macOS 真机以损坏 JSON 验证本机面板加载、节点错误态和重试；未运行网络探测/修复；提交 `8c225d86` 的 GitHub CI 与 Security Scan 已全部通过。P0-1 及权限拒绝等场景验收仍未完成。
- 2026-10-23：完成 P5-3。历史快照增加本地保存时间及容错校验，保留无时间戳的旧快照；报告页支持选择两次快照并按检查项状态对比、标明缺失项与建议数变化，详情不参与对比；JSON/Markdown 导出含时间信息。修复切换对比快照时默认基准意外改变的 UX 问题。产品规格与 S-FA-05 同步；`test:critical` 295 项、`lint:fe`、Prettier、前端构建通过；隔离 macOS QA bundle 真机验证中英双语、意见复数、基准保持、快照选择及状态/缺失项对比，未运行真实网络探测；PR #154 提交 `621c11f0` 的远程检查全部通过。P0-1 及权限拒绝等场景验收仍未完成。
- 2026-10-23：P0-1 复查修复能力包刷新缺少 single-flight 与进行中反馈的问题；刷新期间安装、卸载及校验按钮禁用，刷新结束恢复。`test:critical` 297 项、`lint:fe`、前端构建通过；隔离 macOS QA 在能力包读取额外延迟 1.5 秒的情况下真机确认“刷新中…”和冲突操作禁用，未执行安装、网络探测或权限操作；QA bundle、QA 数据、`dist` 和扩展暂存目录已移入废纸篓。PR #154 提交 `77b31f0d` 的 GitHub checks 全部通过；P0-1 及 Local Network 权限拒绝、测速超时与 Windows 场景仍未完成。
- 2026-10-23：修复测速冷却结束后 interval 仍每 500ms 触发渲染的问题；新增 interval 到期清理回归测试。`lint:fe`、`test:critical`（55 文件 / 298 项）、Prettier、`build:fe` 通过。隔离 macOS QA bundle 将测速目标固定为 `127.0.0.1:9`，真机确认源不可用提示、30s 倒计时与到期恢复，且诊断计数到期后连续 2.2s 保持不变；没有访问外网。同步更新产品规格。P0-1 仍未完成；慢速/超时、取消后立即重跑、Local Network 权限拒绝及 Windows 场景仍待验收。
- 2026-10-23：完成 P5-1。端口样本、Traceroute 跳点、ARP 邻居与局域网服务在 50 项起虚拟化；开放端口摘要最多列 16 项并给出剩余数量，端口状态与 ARP 缺失 MAC 文案本地化。`test:critical` 307 项、`lint:fe`、`build:fe` 与 Prettier 通过；隔离 `com.bench.qa.longlists20261023` 真机以合成数据检查 256 端口、80 跳、120 邻居和 96 条服务的滚动、可见行数量、表格语义及中英文案；未运行任何网络探测。PR #154 提交 `6134b3dd` 的远程检查全部通过。P0-1 权限拒绝与 Windows 真机回归仍待验收。
- 2026-10-23：完成 P5-2。官方站点与选定内置站点包支持立即启动、串行间隔轮询、可配置阈值与当前告警；用户确认监测仅在当前页面运行，停止会话、离开页面或窗口失焦后会停止后续排程并取消进行中的探测；失败样本在按目标隔离的内存 sparkline 中形成断点，最多保留 20 点 / 100 个目标。`test:critical` 314 项、`lint:fe` 与 `build:fe` 通过；macOS 隔离 QA 真机完成官方 24 站点、CN-friendly 4 站点两轮 30 秒间隔、阈值告警、活动中取消、离开页面停止、无效阈值及中英文界面复验。PR #154 提交 `a901ffd4` 的功能与平台检查通过；Cargo Audit 发现新公告 RUSTSEC-2026-0385 后，已将 `ctutils` 从 0.4.2 升级到 0.4.4，并将 `clipboard-win` 从 yanked 的 5.4.1 升级到 5.4.3。macOS 本机 `cargo audit` / `cargo deny check` 通过、后端 643 项通过且 release app bundle 构建成功；PR #154 提交 `81d1787c` 的安全扫描、macOS/Windows Rust、前端、E2E、静态检查与 Node 24 检查全部通过，发布构建按条件跳过。P0-1 权限拒绝与 Windows 真机回归仍待验收。
- 2026-10-23：修复下载请求/响应体等待期间取消无效的问题；测速 HTTP 阶段和阶段间等待现与 Tokio watch 取消信号竞争，会话结束后 RAII 清理。`test:critical` 299 项、`test:be` 642 项（1 项跳过）、`clippy:be`、`lint:fe`、Rust 格式与 cfg 检查通过；隔离 `com.bench.qa.speedcancelfix20261023` 真机以 loopback 分块响应验证连续两次“取消→立即重跑→再次取消”，按钮即时恢复且服务端观察到连接关闭，没有访问外网。PR #154 提交 `92562ea7` 的 GitHub checks 全部通过（macOS/Windows Rust、Tauri 构建冒烟、前端、E2E、静态检查、Node 兼容性及安全扫描）。P0-1 仍未完成；测速超时冷却、Local Network 权限拒绝及 Windows 真机回归仍待验收。
- 2026-10-23：修复仅 ping 成功却把测速判为成功、导致下载与上传均失败时不冷却的问题；至少一个带宽方向有样本才算测速成功，无带宽样本进入 30s 冷却，单方向结果显示本地化部分结果，内置测速源名称按语言显示。`test:critical` 303 项、`test:be` 643 项（1 项跳过）、`clippy:be`、`lint:fe`、cfg 检查与前端构建通过；隔离 `com.bench.qa.speedtimeout20261023` macOS 真机用 loopback 验证 ping 成功、下载实际等待并超时于 45s、上传 HTTP 503、30s 倒计时、到期后实际重试和取消不冷却；隔离 `com.bench.qa.speedlocales20261023` 真机确认中文测速源下拉项和选中项显示，无网络访问。同步产品规格与审计记录；PR #154 提交 `81d1787c` 的全部远程检查通过。P0-1 仍未完成；Local Network 权限拒绝及 Windows 真机回归仍待验收。
- 2026-10-23：修复 Globalping DNS 轮询终态判断、静默错误及无整体期限的问题，并在失败时保留本机/部分远程结果；结果成功/失败和本机名称改为本地化。`test:critical`、4 个 Globalping 本地 HTTP 回归、`cargo clippy -- -D warnings`、后端 cfg 检查、前端构建与 macOS QA 真机均通过；QA 对 `example.com` 收到本机和 3 个 Globalping 区域结果（4 条答案，4.298 秒），英文切换显示 “This device / OK”。PR #154 提交 `6de78f87` 的 GitHub 必需检查全部通过，发布构建按条件跳过；Windows 真机回归仍待用户安排。
- 2026-10-24：修复 P5-2 面板卸载与 scan-session 事件之间的取消竞态。监测进行中离开面板时，即使会话 ID 尚未发布也会排队取消；收到本轮会话 ID 后仅取消对应站点探测，会话结束时清掉未兑现的取消意图。单测覆盖晚到会话和早期失败后不串到下一轮；`lint:fe`、`test:critical`（58 文件 / 319 项）与隔离 QA Tauri app 构建通过。macOS 隔离 bundle 真机启动官方站点监测，约 3.7 秒后离开面板，命令日志记录 `cancelScan()`；返回后显示 `sitesProbe cancelled`、监测按钮恢复可启动且已完成卡片结果保留。Tokio 更新至 1.53.3 后本机 `cargo deny`、`cargo audit`、`clippy:be`、后端 647 项与隔离 QA app smoke 通过；PR #154 提交 `46d9b046` 的远程检查全部通过；Windows 真机回归仍按用户安排延期。
- 2026-10-24：修正站点监测中英文提示与实际取消行为不一致的问题。文案现说明离开面板会停止监测并请求取消进行中的探测，设计与产品规格同步；`lint:fe`、`test:critical`（58 文件 / 319 项）通过。隔离 macOS QA 真机分别显示中英文提示；开始后立即停止，命令日志记录 `cancelScan()`，后端返回 `sitesProbe cancelled`，开始按钮恢复。PR #154 提交 `26441e5d` 的 Cargo Audit + Deny、前端、E2E、静态、Node 24、macOS/Windows Rust 检查全部通过，发布构建按条件跳过。P0-1 权限拒绝与 Windows 真机回归仍待用户安排。
- 2026-10-24：真机复查发现 macOS 隐藏应用窗口时，Tauri 焦点事件没有及时停止站点监测，监控可能继续在后台发起请求。现同时监听 WebView `blur` / `visibilitychange`、Tauri 焦点事件，并在监测期间每 500ms 读取一次原生 `isFocused()`；失焦后停止后续排程并取消当前会话。新增 hook 回归；`test:critical` 322 项、`lint:fe`、Prettier 与 `git diff --check` 通过。macOS 隔离 QA 真机运行中隐藏窗口约 1.2 秒后复开：13/24 站点完成，日志有 `cancelScan()` 与 `sitesProbe cancelled`，按钮恢复“开始监测”。PR #154 提交 `575b13af` 的远程检查全部通过；P0-1 权限拒绝与 Windows 真机回归仍待用户安排。
- 2026-10-24：P0-1 继续扫尾：发现 scan-session listener 已卸载后，已排队的回调仍可能写入已结束会话 ID；新增测试在修复前稳定复现，现 tracker 仅接受活动生命周期内的事件。`test:critical`（58 文件 / 323 项）、`lint:fe` 与 macOS 隔离 QA Tauri app 构建通过。macOS 27.0.1 arm64 真机以 `com.bench.qa.sessionrace20261024` 连续两轮运行体检、取消并立即重跑：每轮均显示“已取消”，取消日志对应本轮 session ID，按钮正常复位；未运行网络修复、安装或权限操作。QA app、138 MB bundle、dist、扩展暂存资源及临时配置已移入系统废纸篓，共享 Rust 构建缓存保留。P0-1 仍未完成：Local Network/TCC 拒绝场景需全新 macOS 用户或 VM，Windows 真机回归等用户安排；PR #154 远程检查链接保持更新。
- 2026-10-24：P0-1 修复 Ping 权限引导和旧结果残留：ICMP socket 错误保留结构化错误码；新一轮先清除旧 Ping 结果；socket 不可用或全丢包时显示双语原因提示，并可打开「隐私与安全性」设置。ARP 权限空态复用同一入口，静网空态不显示权限 CTA；macOS 26+ 使用当前 Privacy & Security pane 标识。macOS 27.0.1 arm64 隔离 QA 真机以 203.0.113.1（保留文档网段）确认全丢包提示和 CTA；点击后进入「隐私与安全」，再点「本地网络」可见权限列表；未触发 TCC 弹窗或修改权限。先成功再输入无效目标重跑，旧成功结果已清除。`test:critical`（60 文件 / 330 项）、`lint:fe`、`clippy:be`、Rust 格式、Prettier、`git diff --check` 和系统设置映射单测 2 项通过。PR #154 commit `550db5a8` 的 Cargo Audit + Deny、E2E、前端、静态、Node 24、macOS/Windows Rust 与聚合检查全部通过，Release 构建按条件跳过。Local Network/TCC 拒绝与 Windows 真机回归仍待专用环境。
- 2026-10-24：修复生产能力包对话框误露开发用“测试哈希失败”操作；仅 `import.meta.env.DEV` 时渲染。回归覆盖生产隐藏与开发可用，目标组件 3 项、`test:critical`（60 文件 / 332 项）和 `lint:fe` 通过；macOS 隔离生产前端 QA bundle 真机确认「网络探测 → 管理组件」不显示该操作，未执行安装或哈希校验。远程检查待推送后确认。
- 2026-10-24：完成 S-X-05 哈希失败通道复验：真实安装返回 `ok=false` 时显示本地化错误并保留未安装状态；`PACK_HASH_MISMATCH` 使用稳定 `hash-mismatch` mode；开发验证通道不安装/执行包，release 实现 fail-closed 返回 unsupported。`test:critical`（60 文件 / 334 项）、`lint:fe`、`check:be-cfg`、`clippy:be`、后端 650 项（1 项跳过）、release `cargo check`、Rust 格式和 `git diff --check` 通过。macOS arm64 隔离 QA 真机中英双语验证失败提示、命令日志及包列表仍为 available；QA app、WebKit/support 数据、前端产物、扩展暂存目录与临时配置已移入废纸篓，共享 Rust target 保留。S-X-05 标记完成；P0-1 权限拒绝与 Windows 真机回归仍待专用环境。
