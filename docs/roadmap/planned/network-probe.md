# Network Probe（网络探测 / 网络急救箱）规划功能

> 本文件记录 network-probe 模块**未实现 / 待验证**的功能规划，与 `../product-specs/network-probe.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 来源：`../modules/network-probe/roadmap.md` 的 Wave 表格（⬜ 待实现 / ◐ 部分完成）、ROADMAP 与 design 文档。

## 当前状态

- 模块 1.0 / MVP A+B 已闭环（D-016）。
- Post-MVP：测速、Globalping DNS/Ping/HTTP 与可选 token、agent 注册骨架、安全/发现主路径已交付；Nmap 轻量服务 / OS 指纹已在工作区实现，待隔离 macOS 真机验收与远程构建；**特权 helper 仍待**。

## 待实现（未完成项）

### Wave 0 · Polish 基线（可并行）

- [ ] **P0-1** MVP 面板空态 / 失败态 / 重入与取消一致性扫尾（S-X-\* · coding §3/§5）。

### Wave 3 · 安全 Tab（续）

- [ ] **S3-6** 服务 / OS 指纹 + 风险标注（依赖 S3-5；实现已落入工作区，待隔离 macOS 真机验证与远程构建）。
- [ ] **S3-8** 特权分层：`priv-helper` / 触发提权 / 自动降级文案（依赖 Wave 1）。

### Wave 5 · Polish 增强（产品化）

### Wave 2 · Post-MVP-C（续）

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

- 2026-10-04：多节点 DNS 首次查询前与等待期间曾留白；增加双语结果区提示，并保留重新查询期间的旧结果。macOS 隔离桌面包真机确认空态、加载态和按钮禁用状态；本轮 Globalping 请求失败，仅记为网络观测、不归因于产品逻辑。新增前端用例并同步产品规格与发现设计。

- 2026-10-03：复查多节点 DNS 结果时发现成功/失败标签硬编码英文；现接入中英文文案，并以颜色辅助区分结果，新增结果状态回归覆盖。后续桌面验收及修复记录见下一条。
- 2026-10-03：多节点真机查询进一步发现 Globalping `finished` 被误判为 DNS 成功：对保留 `.invalid` 域名，本机结果失败而远端无答案仍显示成功；此外 API `rawOutput` camelCase 未反序列化且原始英文详情默认可见。现按官方 `statusCode` 区分 NOERROR/NXDOMAIN，增加双语「域名不存在/无记录」状态，原始详情折叠，并补 Rust 3 项/API DTO/组件回归。重建后实测 `example.com` 四个节点成功、保留 `.invalid` 域名在本机失败并在远端显示「域名不存在」，技术详情默认折叠；`test:critical` 293 项、`lint:fe`、Clippy、Rust fmt、format:check 通过。
- 2026-10-03：按 Globalping 官方异步测量约定，修复多节点 DNS 把固定 20 次轮询（约 14 秒）当成测量终态、并可能因当前返回的 probe 都结束而提前退出的问题；现以顶层状态轮询至终态或 45 秒总截止，限制单次请求 8 秒、按间隔退避，并将部分结果与明确超时状态返回 UI。Rust 轮询用例 5/5、前端关键用例 293/293、lint:fe、clippy、Rust fmt 与 cfg 检查通过；macOS 桌面以仅监听 127.0.0.1 的模拟服务确认 5 秒截止后保留已完成节点答案、把未完成节点和汇总标为「等待超时」，展开详情显示原始状态；恢复正式 API/45 秒配置后，真实 Globalping 对 example.com 返回本机与 3 个远端成功结果，约 5.5 秒。可运行 debug .app 已生成；bundle 命令仅因缺少 updater 私钥未能签署更新包。该项验证闭环。
- 2026-10-03：UX/隐私复审补足多节点 DNS 的第三方披露：在运行按钮旁双语提示远端查询会向 Globalping 发送域名；结果摘要增加 polite live region，告知屏幕阅读器异步完成状态。新增组件断言，并同步产品规格与发现设计。

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
- 2026-10-24：修复生产能力包对话框误露开发用“测试哈希失败”操作；仅 `import.meta.env.DEV` 时渲染。回归覆盖生产隐藏与开发可用，目标组件 3 项、`test:critical`（60 文件 / 332 项）和 `lint:fe` 通过；macOS 隔离生产前端 QA bundle 真机确认「网络探测 → 管理组件」不显示该操作，未执行安装或哈希校验。PR #154 的 [commit `61a0a67c`](https://github.com/indredK/bench/commit/61a0a67c) 已通过全部必需 GitHub Actions 检查；非发布 PR 的 release build/publish jobs 按配置跳过。
- 2026-10-24：完成 S-X-05 哈希失败通道复验：真实安装返回 `ok=false` 时显示本地化错误并保留未安装状态；`PACK_HASH_MISMATCH` 使用稳定 `hash-mismatch` mode；开发验证通道不安装/执行包，release 实现 fail-closed 返回 unsupported。`test:critical`（60 文件 / 334 项）、`lint:fe`、`check:be-cfg`、`clippy:be`、后端 650 项（1 项跳过）、release `cargo check`、Rust 格式和 `git diff --check` 通过。macOS arm64 隔离 QA 真机中英双语验证失败提示、命令日志及包列表仍为 available；QA app、WebKit/support 数据、前端产物、扩展暂存目录与临时配置已移入废纸篓，共享 Rust target 保留。S-X-05 标记完成；P0-1 权限拒绝与 Windows 真机回归仍待专用环境。
- 2026-10-24：P0-1 修复端口扫描取消失效与能力状态误报：nmap 改用 Tokio 可取消子进程，内置 TCP 扫描取消时 abort 并回收当前任务；取消返回 `cancelled`，不触发第二轮 TCP 重扫；尚未接入扫描路径的 `adv-scanner` 不再将端口扫描标为 supported，界面提示按中英文和实际结果模式显示；nmap `-V` 能力探测限时 2 秒，超时降级并终止探测子进程。`test:critical`（60 文件 / 336 项）、`lint:fe`、`check:be-cfg`、`clippy:be`、Rust 格式、Prettier、Tauri QA app 构建及后端 652 项（1 项跳过）通过。macOS 27.0.1 arm64 隔离 QA `com.bench.qa.portcancelfix20261024` 确认 nmap 能力提示正确；连续两轮点击取消均立即恢复按钮并显示“端口扫描已取消”，mock 子进程 PID 均退出，调用日志恰好两次 `-sS` 且无 TCP 重扫；卡住 15 秒的 `nmap -V` 在 2 秒内降级且探测进程退出。QA app（138 MB）、WebKit/support 数据、dist、扩展暂存资源、mock/config 已移入系统废纸篓，共享 Rust 构建缓存保留。P0-1 仍未完成：Local Network/TCC 拒绝需要临时 macOS 用户或 VM，Windows 真机回归按用户安排延期；PR #154 的 [commit `61a0a67c`](https://github.com/indredK/bench/commit/61a0a67c) 已通过全部必需 GitHub Actions 检查；非发布 PR 的 release build/publish jobs 按配置跳过。
- 2026-10-24：完成 C2-2：Globalping 多节点 DNS/Ping/HTTP 与可选系统钥匙串 token 已接入；HTTP URL 按 API 契约拆分主机、协议、路径、查询与端口，限制私网目标，反馈真实配额并区分请求拒绝与服务故障。复核发现仅返回部分 quota 字段时分隔点会出现在开头，改为只连接实际存在的字段并新增回归用例。最终 `lint:fe`、关键测试（61 文件 / 346 项）、前端生产构建、Prettier、Rust 格式、Clippy、后端 662 项（1 项跳过）、cfg 检查和 `git diff --check` 通过。隔离 macOS QA `com.bench.qa.globalping20261024` 真机验证：`example.com` 的 HTTP HEAD 三个探点均 HTTP 200、TCP/TLS 时延及单位正确、quota 以 `241/250` 和本次 3 次显示；Ping 三地均收 3/3 包；输入 `127.0.0.1` 被本地拒绝且旧结果清空。未写入临时/真实 token；只读取隔离 bundle 的未配置状态。QA 应用、support/WebKit/cache 数据、`dist` 与临时配置已移入废纸篓，共享 Rust 构建缓存保留；最终只启动一个正式 Bench 实例。Local Network/TCC 拒绝与 Windows 真机回归仍需专用环境；PR #154 commit `20108bf8` 的 Cargo Audit + Deny、E2E、前端、静态、Node 24、macOS/Windows Rust 与聚合 CI 全部通过，Release build/publish 按非发布 PR 规则跳过。
- 2026-10-24：P0-1 修复单次探测刷新失败后仍展示上次成功结果、且结果未标明实际目标的问题。TCP/DNS/自定义目标与其他单次探测失败时清除对应旧值，概览失败项逐项清除；目标输入在请求期间锁定，结果卡片标明实际主机/端口、域名或 URL，刷新中仍保留旧结果。新增 use-case 与面板回归；`lint:fe`、`test:critical`（62 文件 / 350 项）、全量 `test:fe`（77 文件 / 445 项）、`build:fe`、`format:check`、`check:docs` 通过。macOS arm64 隔离 QA bundle `com.bench.qa.p0staleresult20261024` 使用仅绑定 loopback 的 TCP listener 真机验证：`127.0.0.1:48765` 首次连接成功并显示目标，随后无效主机重试立即清除成功卡片并显示失败提示；测试未访问外网或修改系统权限。隔离 QA app、support/cache 数据和 `dist` 已移入系统废纸篓，共享 Rust 构建缓存保留；本地 listener 已退出。P0-1 仍未完成：Local Network/TCC 拒绝需临时 macOS 用户或 VM，Windows 真机回归按用户安排延期。
- 2026-10-25：S3-6 服务 / OS 指纹与暴露类别标注已实现于工作区：用户显式启用后调用本机 Nmap `-sV --version-light`，stdout/stderr 分别限 2 MiB / 64 KiB，任一超限均排空后明确失败并支持取消；无原始包权限时重试不带 `-O` 的 TCP connect 服务识别。复核修正了空结果说明、stderr 超限标记，以及高风险扫描确认框缺少实际范围/速率/时长的问题；Nmap 端口阶段使用 `--scan-delay 50ms` 和 30s host timeout，指纹服务 / OS 阶段使用 Nmap 自身时序，且界面说明 50ms 不限制整次指纹扫描总速率；内置 TCP 按每目标 50ms 间隔调度并在等待期间响应取消。移除了与 `--scan-delay` 冲突的 `--max-parallelism`，指纹模式使用 `-T2` 降低服务探测并行度。产品规格、设计、安全测试和中英文案同步。`lint:fe`、`test:critical`（62 文件 / 357 项）、`build:fe`、Prettier、`check:docs`、`check:be-cfg`、Rust 格式与 Clippy 通过；`cargo test` 为 671 项通过、1 项忽略。隔离 macOS loopback 真机验收待用户授权 Nmap QA 扫描；本地改动未提交或推送，PR #154 现有远端绿灯对应旧 head，不代表本次改动已通过远程构建。
- 2026-10-25：静态审计修复端口扫描高风险确认仅在前端实施的缺口：Rust IPC 现在按目标类型及实际去重端口数校验 `highRiskConfirmed`，缺少确认时在创建扫描会话前返回稳定错误码；前端严格拒绝越界 / 前导零 IPv4 的内网分类，`localhost` 与后端规则对齐。加入 Rust 风险分类与 64/65 边界测试、UI 确认传参 / 异常 IPv4 / localhost / 本地化错误用例。`lint:fe`、`test:critical`（62 文件 / 361 项）、Prettier、`build:fe`、`check:be-cfg`、Rust 格式、Clippy 和后端 673 项（1 项跳过）通过；隔离 macOS QA 真机显示 `example.com`、`22-100` / 79 端口及实际适用的 Nmap 速率与时长说明后取消，未启动扫描或访问网络；QA bundle 与 dist / staged extensions 已移入废纸篓，共享 Rust target 保留。隔离 macOS loopback Nmap 指纹扫描与远程构建尚未执行，改动未提交或推送。
- 2026-10-25：修复高风险确认框按原始条目重复计数导致错误范围提示和多余确认的问题。前端解析语法与后端对齐，按去重端口数判断 64 端口门槛；非法范围显示无法估算并省略预计时长；新增实际计数、65 个重复项不触发确认及非法范围不展示估算的 UI 回归，产品规格与测试设计同步。`lint:fe`、关键测试（62 文件 / 364 项）、Prettier 与 `build:fe` 通过；物理真机已验证既有高风险弹窗可显示并取消，新重复端口路径的隔离真机复验待完成。

- 2026-10-25：按用户选择将 S3-6 端口扫描目标契约收敛为单主机；Rust IPC 在建立会话前显式拒绝 CIDR、目标列表、通配符和 IPv4 octet range（稳定错误 `PORT_SCAN_SINGLE_HOST_REQUIRED`）。真机隔离 QA 输入 `192.168.0.0/24` 显示本地化拒绝；输入 `example.com` 和 65 个重复 `80` 后确认框显示实际 1 个端口并取消，未执行扫描。验证发现 `url::Host::parse` 会宽松接受带 CIDR 后缀的输入，已在 hostname 解析前增加拒绝并由 Rust 回归覆盖。`lint:fe`、`test:critical`（62 文件 / 366 项）、`build:fe`、Prettier、cfg、Rust fmt、Clippy 和 `cargo test`（675 通过 / 1 忽略）通过。重复端口 QA 点击曾意外发起一次仅针对 `127.0.0.1:80` 的普通 Nmap SYN/connect 探测，结果 closed；该误触发未访问外部目标、不是指纹验收，随后不再发起任何扫描。隔离 QA 已退出；本地代码未提交或推送，S3-6 指纹扫描真机验收与远程构建仍待完成。
- 2026-10-25：S3-6 loopback 指纹验收完成。隔离 macOS QA 在 `127.0.0.1:48765` 上对本机临时 HTTP 服务执行 1 端口扫描，日志记录 `mode=nmap-fingerprint-syn-or-connect`，结果为开放 HTTP，服务信息识别到 Python `BaseHTTPServer`；没有可靠 OS 匹配时 UI 明确解释权限 / 指纹限制，且说明未运行 NSE。服务只绑定 loopback，测试结束已停止；确认无 Nmap、QA 或测试服务残留。另修复前端 IPv6 ULA / 链路本地误触发公网确认的问题，使用 `ipaddr.js@2.5.0` 与 Rust 分类规则对齐；组件测试 25 项、`tsc --noEmit`、Prettier 和隔离 macOS QA bundle 构建通过。真机以 `fd00::1` 和无效端口确认本地输入不弹风险框并在解析前失败；公网 IPv6 确认框显示后取消。该分类验收未发送探测包。代码与文档尚未提交 / 推送，远程构建待执行；Local Network/TCC 拒绝与 Windows 真机回归仍待专用环境。
- 2026-10-25：将 DNS 多节点成功判定收敛为 `status=finished` 且 `statusCode=0`，明确 NXDOMAIN、NOERROR 空记录与未知响应码失败关闭；加入技术详情折叠、空/加载态和 Globalping 数据披露。`lint:fe`、`test:critical`（382/382）、`test:fe`（477/477）、`check:be-cfg`（385 files）、Rust 格式、Clippy、`test:be`（683 通过 / 1 跳过）通过；回环 Rust 用例设置 `NO_PROXY=127.0.0.1,localhost` 后通过。macOS arm64 隔离 QA 真机 `example.com` 查询返回本机和 3 个远端成功；保留 `.invalid` 查询有 2 个远端明确返回 NXDOMAIN /「域名不存在」，本机和另一个远端如实显示失败；中英文状态、数据保留提示、技术详情折叠与原始 NXDOMAIN 详情通过。PR 远程构建待验。
