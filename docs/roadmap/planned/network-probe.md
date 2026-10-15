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

- [ ] **P5-1** 长列表虚拟化（端口 / 跳点 / 设备列表，UX-STANDARDS）。
- [ ] **P5-2** 持续监控 / 阈值告警。
- [ ] **P5-3** 健康报告历史快照 + 跨时间对比（部分完成，◐——报告历史已有，对比 UI 待做）。
- [ ] **P5-4** 一体化 BasicView 视觉合并。

### Wave 2 · Post-MVP-C（续）

- [ ] **C2-2** Globalping 代理补全：remote ping / http + token（DNS multi 已交付，◐）。
- [ ] **C2-3** 自有 agent 远程执行：TLS / 鉴权 / 限速贯通，`nodeId` 全链路（HTTPS/WSS 注册与健康检查、白名单已交付，凭证鉴权和远程执行待，◐）。

## 待验证（真机 / 行为）

- [ ] macOS 真机：Local Network / TCC 权限不足时各探测（ping/ARP/抓包）的稳定错误码与「打开系统设置」引导生效。
- [ ] 测速源不可用 / 超时 → 30s 冷却倒计时在真机可用；取消测速可立即重跑。
- [ ] `priv-helper` 提权路径（Wave 1 pack）在真实系统上可安装、触发提权、自动降级文案正确。
- [ ] 能力包 hash 校验失败通道（`installCapabilityPackVerifyFail`）行为符合预期。
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
- 2026-10-06：修复 agent 增删重复提交：UI 共用节点 busy 状态，后端串行化 registry 读改写并原子保存；同标签 + 同规范化 HTTPS URL 幂等。该版本当时明确拒绝 WSS，原因是健康检查尚未接通。
- 2026-10-11：按用户确认支持 WSS，复用 `tokio-tungstenite` 与系统证书根；注册和刷新均检查 `/v1/health` 的 TLS WebSocket Ping/Pong，单端点 5 秒超时、最多 8 个并发检查；HTTPS 禁止重定向，registry 读取错误向调用方传播。macOS 27.0.1 arm64 隔离 QA 包真机验证：`wss://echo.websocket.org` 注册后显示「可达」，手动刷新仍可达；HTTP 明文地址提示不支持并禁用提交，带用户名/密码的 WSS 地址显示 URL 错误并禁用提交；预置旧版 `http://127.0.0.1:9` 注册记录在刷新后显示「暂不可达」。测试节点已移除，QA 包和专属数据已清理。
- 2026-10-11：真机复验端口扫描输入 `abc` 两次均可提交，触发后端并只显示通用错误横幅。已补中英文联动的字段即时校验、错误关联与无效提交禁用；renderer 与 Rust 校验 2048 UTF-8 字节 / 256 个不同端口上限，重复端口先去重。macOS 27.0.1 arm64 隔离 QA 包复验：输入 `abc` 后字段显示格式错误且扫描按钮禁用；改为 `80,443` 后错误消失，扫描 `127.0.0.1` 两端口成功结束。前后端自动化用例、Clippy 与平台 cfg 检查通过；P0-1 的其余空态/失败态/取消一致性检查仍待完成。
- 2026-10-11：Ping 次数输入 `1.5` 在 macOS 隔离 QA 包中可提交并落入通用失败提示，确认整数 IPC 参数缺少字段校验；现已补齐 Ping `[1,20]`、TCP 端口 `[1,65535]`、Traceroute TTL `[1,32]` 和轮次 `[1,10]` 的整数校验，中英文内联错误、`aria-describedby` 关联、无效禁用及 handler 防御。macOS 27.0.1 arm64 隔离 QA 包真机验证：Ping count、TCP port、Traceroute TTL/rounds 分别输入 `1.5` 均显示字段错误并禁用提交；改回有效值后错误清除且按钮恢复。17 项字段回归、network-probe 38 项、关键测试 244 项和 `lint:fe` 通过；隔离调试包成功构建。P0-1 的空态/失败态/取消一致性检查仍待完成。
- 2026-10-11：macOS 真机发现并修复三项取消/降级缺陷：无特权 UDP Traceroute 因未设置 `PortDirection` 而构建失败；点击取消后各面板不显示等待状态；自定义站点探测无法中断当前 HTTP 请求且可能错误报告成功。已按 `trippy-core` 要求为 UDP 配固定源端口、保留 ICMP 配置；站点请求可在途取消；取消按钮统一显示禁用的「正在取消…」，IPC 失败按 session ID 清除标记以恢复重试；零样本取消也有显式状态。macOS 27.0.1 arm64 隔离 QA 包真机确认 `127.0.0.1` Traceroute 返回跳点、10 轮途中取消后标记已取消；本机延迟 HTTP 站点取消后即时结束且显示「已取消」。Rust 配置/取消单测、network-probe 42 项、`lint:fe`、Clippy、Rust cfg 检查通过，隔离调试包成功。P0-1 其余空态/失败态/重入场景仍待完成。
- 2026-10-11：S-X-01 真机复现官网卡片结果在切换导航后丢失：顺序测试百度和腾讯并切换到 Ping，再返回官网时只剩腾讯结果。已将官网最近样本移入 network-probe store，按 target 保存并限制为 256 条；整包重测只清除本包目标，单卡重测保留其他卡片。macOS 27.0.1 arm64 隔离 QA `.app` 真机复验：测试百度和腾讯后分别切换 L1 到 Ping、切换 L2 到区域站点包并返回，成功数和两张卡片状态/时间均保留。network-probe 45 项、关键测试 244 项和 `lint:fe` 通过；应用包完成打包/签名并启动，构建命令尾段因本机缺 updater 私钥未能签名 updater 压缩包。P0-1 其余空态/失败态/重入场景仍待完成。
- 2026-10-13：P0-1 发现总览首次加载失败后，`OverviewPanel` 会因 `loading` 从 true 回到 false 再次自动刷新，可能无限重试。现改为面板实例首次自动加载一次，失败后保留错误提示、空态和手动刷新入口；增加回归用例及 S-X-08 场景。macOS 27.0.1 arm64 隔离 QA `.app` 真机故障注入复验：首次异步失败显示“加载网络概览失败”，等待 5 秒错误仍在且未自动重试；点击刷新后本机网络摘要卡片恢复显示且错误清除。总览回归 1 项、`lint:fe`、关键测试 244 项通过；调试 `.app` 构建和应用签名成功，命令尾段因本机未配置 updater 私钥而无法签名 updater 压缩包。QA 包已退出，临时注入与启动覆盖已从源代码撤除。
- 2026-10-13：macOS 真机复现体检树把 `link.iface`、`addr.ipv4` 等稳定 key 当作主标题展示；在中文与英文两种语言下均确认。现用双语资源显示可读检查名称，稳定 key 保留为次要诊断标识；同步补充 S-X-09。macOS 27.0.1 arm64 隔离 QA `.app` 真机复验：一键体检 21 项均显示本地化标题、key 和状态，命令提示保持契约名；中英文切换后标签分别正确。HealthTreePanel 回归 1 项、前端全量 391 项、`lint:fe` 与格式检查通过。QA 包已退出。
- 2026-10-13：真机检查发现“清空历史”与产品规格 13.4 不一致：点击即清空本地最近体检快照，未要求确认。现复用 `DestructiveConfirmDialog`，以双语说明删除范围、不可恢复性及当前报告/日志保留；新增取消/确认回归与 S-X-10。macOS 27.0.1 arm64 隔离 QA `.app` 真机复验：首次点击显示确认框；选择“保留历史”后快照仍在；再次确认后仅历史清空，当前报告和命令日志仍保留。`lint:fe`、关键测试 244 项、ReportPanel 2 项通过。QA `.app`、bundle ID 专属数据和构建输出已移入废纸篓。
- 2026-10-13：报告页“清空日志”会直接清除与侧栏共用的本会话命令日志，绕过产品规格要求的二次确认。已复用 `DestructiveConfirmDialog` 和侧栏既有双语文案；取消保留日志、确认后清除，空日志时禁用清理按钮；同步产品规格和 S-X-11。
- 2026-10-14：macOS 真机复现 Ping、TCP、DNS、自定义目标失败重跑时保留上轮结果；同轮新增复现 MTU `127.0.0.1` 成功测得路径 MTU 1500 后目标改为 `-bad`，错误提示下仍留有旧状态、测量值和完整步骤表。Ping / TCP / DNS / 自定义目标 / MTU 的新请求现在起跑即清除对应旧结果。macOS 27.0.1 arm64 隔离 QA `.app` 修复后复验：TCP、DNS、自定义目标、MTU 成功→`-bad` 时旧卡或测量表消失并显示错误；修正输入后均恢复成功。网络探测用例 56 项、关键回归 244 项、`lint:fe`（含 typecheck）、文档一致性/链接与格式检查通过。QA `.app` 已成功构建并启动；Tauri 尾段因未配置 `TAURI_SIGNING_PRIVATE_KEY` 未能签 updater 压缩包；QA 包、`dist` 与 bundle ID 专属数据移入废纸篓。
- 2026-10-14：S-X-13 真机复现 Ping 失败后切换到 DNS 仍显示 Ping 错误横幅；DNS 失败后切回 Ping 也会串页。新增按错误 key 与取消会话种类归属 L1/L2 面板的筛选，导航时清除旧错误；加入离线子视图过滤与回归用例。macOS 27.0.1 arm64 隔离 QA `.app` 修复后复验：Ping / DNS 错误仅在各自面板显示；切换面板后横幅消失；本机回环 DNS 请求期间切至 Ping，等待 3 秒未出现 DNS 错误横幅。错误归属 5 项、network-probe 61 项、关键回归 244 项、`lint:fe` 通过；隔离 QA `.app` 成功构建并启动，Tauri 尾段仍因缺少 `TAURI_SIGNING_PRIVATE_KEY` 无法签 updater 压缩包。QA `.app`、压缩包、`dist`、暂存扩展产物及专属用户数据已移入废纸篓，共享 Rust 构建缓存保留；P0-1 其余空态 / 失败态 / 重入场景仍待完成。
- 2026-10-14：P0-1 dogfood 真机复现 ARP 返回 0 个邻居时中文界面同时显示后端英文自由文本与 `emptyReason=quiet` 中文说明，造成重复且原因范围不一致。移除 ARP 面板对 `result.message` 的直接呈现，空态只按 `emptyReason` 显示本地化提示；补组件回归并同步场景与产品规格。macOS 27.0.1 arm64 隔离 QA `.app` 真机复验：刷新本机 `/24` 邻居缓存得到 0 个邻居，AX 树只显示“未发现邻居 — 可能是静网，或探测被过滤。”，没有英文后端原文；组件与 network-probe 62 项、`lint:fe`、关键测试、文档/格式检查通过。复现视频、修复前截图和验收报告保存在 `/tmp/bench-network-dogfood-2026-10-14/`；QA `.app` 已退出，构建输出和隔离数据待本轮提交后移入废纸篓。P0-1 其他空态 / 失败态 / 重入场景仍待完成。
- 2026-10-14：S-X-02 dogfood 真机复现官网单卡的悬停提示只显示“测试 github.com”，缺少 IPC 契约名与目标参数。将原生 `title` 换为共享 `CommandHint`，焦点与悬停均显示 `startSitesProbe(local, custom[1])` 和实际目标；新增中英文资源与 `OfficialSitesPanel` 回归，并同步 S-X-02 与产品规格。macOS 27.0.1 arm64 隔离 QA `.app` 修复后键盘聚焦 GitHub 卡片，AX 树可读到 `startSitesProbe(local, custom[1]) // target: 'https://github.com'`；单卡调用仍写入实际命令日志。组件回归、`lint:fe`、文档链接/一致性与格式检查通过。QA 应用已退出，包、扩展 staging、`dist` 和 bundle-ID 专属数据已移入废纸篓，共享 Rust 构建缓存保留；P0-1 其余空态 / 失败态 / 重入场景仍待完成。
- 2026-10-14：完成 P0-2 关键测试补强；保留既有 IPC contract、Advisor 纯函数和前端取消幂等覆盖，新增 Rust session 取消幂等 / mutex poison recovery 与无可选工具时能力降级矩阵测试。`lint:fe`、关键测试 244 项、network-probe 前端 63 项、`check:be-cfg`、Clippy、格式检查及 Rust 641 项（1 项既有 skip）通过。macOS 27.0.1 arm64 隔离 QA 包显示 `privilege=none`、能力包仅为可用标记；一键体检取消后保留已完成项，随即重跑完整 21 项成功（4.1s）。同轮验证 Ping 成功→失败→成功清除旧结果、快速连点只发一条命令；官网批量探测取消保留 9/24 已完成卡片、3 秒无迟到结果，取消后 GitHub 单卡可重跑成功。P0-1 其他面板空 / 错误状态场景仍待完成。QA 包、DMG、主可执行文件、sidecar、dist、扩展 staging 与隔离数据均已移入废纸篓；共享 Rust target 保留。
- 2026-10-14：审查 WSS agent 契约时发现健康检查节点仍宣称支持 DNS / Ping / HTTP，界面文案也暗示可从 agent 发起探测；现停止输出未协商的能力声明，并在中英文界面明确“仅检查可达性”，同步修正 DNS 对比和 S-DIS-05 当前行为说明。macOS 27.0.1 arm64 隔离 QA `.app` 真机添加 `wss://echo.websocket.org` 后显示“可达”，刷新节点后仍“可达”；页面明确 remote probe 尚未可用，测试 agent 随后移除。`lint:fe`、network-probe 63 项前端测试、Rust 637 项（1 项既有 skip）、Clippy、Rust cfg 与文档门禁通过，QA `.app` 构建、签名成功。QA 包、dmg、dist、扩展 staging、专用 sidecar / 可执行文件与 bundle-ID 专属数据移入废纸篓，共享 Rust 构建缓存保留；C2-3 远程执行和认证仍待完成。
- 2026-10-14：S-X-14 真机巡查发现 Ping / DNS / TCP / 自定义目标 / 测速初次打开时结果区为空白；MTU 和公网出口的“尚未查询”文案在请求中仍会出现。新增共用空态卡片和中英文文案，并在加载、所属错误、能力禁用或测速源不可用时隐藏初始引导；同步产品规格与场景索引。macOS 27.0.1 arm64 隔离 QA `.app` AX 验收 Ping、DNS、TCP、自定义目标、Traceroute、MTU、公网出口、测速的初始空态；英文切换后空态显示 “Run a probe to see its results here.”，随后恢复系统语言。MTU `127.0.0.1` 真机成功显示路径 MTU 1500；改为 `-bad` 后显示本轮错误，不显示初始空态。network-probe 78 项、关键测试 244 项、`lint:fe`、格式检查通过。P0-1 其余失败态、重入与取消场景仍待完成；QA 包、`dist`、扩展 staging、sidecar 和隔离数据移入废纸篓，共享 Rust target 保留。
- 2026-10-14：测速源选择“Self-hosted template (often offline)”后失败，真机复现中文结果卡同时显示“该测速源似乎不可达……”与后端英文 `Speed source unreachable...`，且重复说明同一状态。结果卡现在仅按 `cancelled` / `unavailable` 展示既有本地化反馈；补组件回归、S-X-15 与产品规格，保留既有冷却和取消逻辑。macOS 27.0.1 arm64 隔离 QA `.app` 退出旧进程后从新构建重启，以同一测速源复验：结果卡只显示本地化说明，能力错误原文未泄漏，30 秒冷却及可重试倒计时正常。network-probe 80 项、`lint:fe`、关键测试 244 项通过；提交 `66ea2dd6` 的 PR #142 全部必需远程检查通过（Cargo Audit、Frontend、Guards、Node、E2E、macOS/Windows Rust 与聚合 CI；发布任务按条件跳过）。P0-1 其他失败态、重入与取消场景仍待审查。
- 2026-10-14：TCP `127.0.0.1:1` 在 macOS 真机显示原始状态 `refused` 与 `Connection refused (os error 61)`，中文界面混入英文且状态枚举未本地化。现补 `TcpConnectPanel` 双语状态映射、未知状态兜底，并将 OS 错误字符串放入默认折叠的「系统诊断详情」；新增回归、S-X-16 与产品规格。macOS 27.0.1 arm64 隔离 QA `.app` 复验修复包：中文“连接被拒绝”与英文 “Connection refused” 均正确；系统详情默认折叠，展开可读原始 OS 错误。network-probe 88 项、`lint:fe`、关键测试 244 项、Tauri QA `.app` 构建通过。提交 `0deaebf6` 后远程聚合 CI、前端、E2E 和 Mac/Windows Rust 检查通过；Cargo Audit 因 `rustls 0.23.45` 的新公告失败，修复见下一条。
- 2026-10-14：PR #142 的 Cargo Audit 发现 `rustls 0.23.45` 在 reqwest、Tauri updater 与 tokio-tungstenite 的共享 TLS 路径中触发 4 条新安全公告；升级 `Cargo.lock` 到上游修复版 `rustls 0.23.46`（[上游发布说明](https://github.com/rustls/rustls/releases/tag/v/0.23.46)）。本机 `cargo audit` 不再报告漏洞（9 条既有允许警告）、Clippy 通过、Rust 641 项全过（1 项既有 skip）。macOS 27.0.1 arm64 隔离 QA `.app` 完成构建和签名；在界面注册 `wss://echo.websocket.org` 后显示“可达”，刷新后仍可达，随后移除临时节点并退出 QA app。提交 `125f2596` 的 PR #142 远程检查全部通过：Cargo Audit、E2E、Frontend、Guards、Node 24.15、macOS/Windows Rust 与聚合 CI；Release Build/Publish 按条件跳过。
- 2026-10-14：macOS 真机复验发现新增 agent 后前端忽略 `addAgent` 已返回的健康检查结果并再次刷新全部节点；移除 agent 也会重查其余 HTTPS/WSS endpoint，造成重复 TLS/WSS 握手和其他节点可达状态抖动。现新增时直接 upsert 返回结果、移除时仅过滤目标节点；列表尚未初始化时保留一次默认节点恢复路径。产品规格补充新增/移除/显式刷新的网络行为。macOS 27.0.1 arm64 隔离 QA `.app` 验证：本机与四个 Globalping 默认节点先行显示；添加 `wss://echo.websocket.org` 后显示“可达”；移除后本机及 Globalping 节点仍保留；QA 应用已退出。Agent 注册表回归 5 项、前端全量 437 项、关键测试 244 项和 `lint:fe` 通过。提交 `749b7161` 已推送到 PR #142，Cargo Audit + Deny、E2E、Frontend、Guards、Node 24.15、macOS/Windows Rust 与聚合 CI 全部通过；Release Build/Publish 按条件跳过。
- 2026-10-15：S-X-04 真机审查发现 Rust 返回 `ICMP_UNAVAILABLE` 时前端只显示通用 Ping 错误，未满足权限排查提示和系统设置引导。现按结构化错误码映射双语专用文案，在错误横幅提供「打开系统网络设置」按钮；文案说明 socket 不可用不等于网络中断，并同步场景。macOS 27.0.1 arm64 隔离 QA bundle `com.bench.qa.pingpermission20261015` 受控注入 `ICMP_UNAVAILABLE` 后，中文、英文提示均正确，点击入口打开 macOS「网络」设置，未更改隐私权限；另以无路由目标验证全丢包仍显示权限 / 防火墙 / 断网多因提示。注入代码已撤除；network-probe 95 项（定向用例 9 项）、`lint:fe`、Prettier 检查通过。S-X-17 在同一真机完成 Ping 20 包进度、输入锁定、3 包后取消、部分样本保留、3.5 秒无迟到样本、下一轮 1 包产生独立会话，以及英文进度和取消文案复验。隔离 `.app` 已退出；QA `.app`、DMG、updater 压缩包、`dist`、扩展 staging、sidecar、bundle ID 专属数据与临时配置移入废纸篓，共享 Rust target 和 `node_modules` 保留。调试 `.app` 构建并签名成功，Tauri 命令尾段因缺少 `TAURI_SIGNING_PRIVATE_KEY` 未能签 updater 包；修复提交 `6b6eea52` 推送至 PR #142，Cargo Audit + Deny、E2E、Frontend、Guards、Node 24.15、macOS / Windows Rust 与聚合 CI 全部通过，Release Build/Publish 按条件跳过；P0-1 其他面板状态与重入场景仍待完成。
- 2026-10-15：S-X-12 复查发现「上不了网」完整诊断以 `Promise.all` 更新五张结果卡，但重跑前未清空旧状态；任一子请求失败会显示失败横幅，同时旧 Captive、公网 IP、代理/VPN、IPv6 或 MTU 结果仍像本轮数据。另公网 IP 单项刷新失败也会保留旧 IP。现完整诊断启动时先清空五项，单项刷新启动时清空公网 IP；同步扩展 S-X-12 场景，并增加两条状态回归测试。macOS 27.0.1 arm64 隔离 QA `.app` 真机验证：首轮完整诊断五项均显示结果，第二轮注入公网 IP 子请求失败后五张旧卡片均变为「尚未运行」并显示错误横幅；独立公网 IP 查询先成功、再失败后旧 IP 卡片消失。临时注入代码已撤除，QA `.app` 已退出；network-probe 97 项（定向状态用例文件 5 项）、关键测试 244 项、`lint:fe`、`check:be-cfg`、Clippy、Rust 格式和 Prettier 检查通过。调试 QA `.app` 构建、签名成功；QA `.app`、bundle-ID 专属数据、`dist`、扩展 staging、sidecar 和临时 overlay 均移入废纸篓，共享 `tauri-app-target` 与 `node_modules` 保留。修复提交 `3c178b09` 推送至 PR #142；Cargo Audit + Deny、E2E、Frontend、Guards、Node 24.15、macOS / Windows Rust 与聚合 CI 全部通过，Release Build/Publish 按条件跳过。P0-1 其他面板失败态、重入与取消场景仍待审查。
- 2026-10-15：S-X-13 并发复查发现，较早启动的 DNS 请求若在 TCP 失败后迟到，会覆盖 store 中仍可见的 TCP 错误；随后 DNS 错误在 TCP 面板被过滤，导致 TCP 错误消失。统一错误 setter 现保留当前面板可见错误，除非新错误也属于当前面板；导航清错和全局未分类错误行为不变。新增 DNS/TCP 逆序失败回归，并同步 S-X-13 与产品规格。macOS 27.0.1 arm64 隔离 QA `.app` 真机验证：受控 DNS 错误延迟 5 秒，切换到 TCP 后以非法主机触发 TCP 失败；DNS 晚到后 AX 界面仍显示「TCP 连通探测失败。」。临时注入已从源代码撤除，QA `.app` 通过菜单正常退出；QA `.app`、专属数据、`dist`、扩展 staging 与 overlay 已移入废纸篓，共享 `tauri-app-target` 保留。network-probe 98 项、关键测试 244 项、`lint:fe`、i18n / 文档一致性与链接、`check:be-cfg`、Clippy、Rust 格式、Prettier 和 `git diff --check` 通过。修复提交 `ecc62162` 已推送至仍保持 OPEN 的 PR #142；Cargo Audit + Deny、E2E、Frontend、Guards、Node 24.15、macOS / Windows Rust 与聚合 CI 全部通过，Release Build/Publish 按条件跳过。P0-1 其他空态、失败态、重入与取消场景仍待审查。
- 2026-10-15：S-X-12 复查扩展到安全、发现等单次探测：污染检测、WHOIS、DNSSEC、NAT、NTP、ARP 发现、局域网服务、抓包诊断和多节点 DNS 在失败重跑时会把旧结果卡与错误横幅并列显示。现九项请求均在起跑时清空各自结果；新增参数化状态回归，并补全 S-X-12 与产品规格。macOS 27.0.1 arm64 隔离 QA `.app` 真机验证多节点 DNS：先显示受控成功结果 `192.0.2.123`，再受控失败；结果卡消失且显示「多节点 DNS 对比失败。」。QA 注入已从源代码撤除；QA 包已正常退出，正式版 Bench 未启动。network-probe 107 项（含 9 项次级结果状态回归）、关键测试 244 项、`lint:fe`、Prettier、`build:fe` 和 `git diff --check` 均通过；Rust 源码未改。提交 `21af1ddc` 已推送至仍保持 OPEN 的 PR #142；GitHub run `38615380098` 与 Cargo Audit run `38615380238` 全部终态成功，含 Cargo Audit + Deny、E2E、Frontend、Guards、Node 24.15、macOS / Windows Rust 与 CI 聚合；Release Build/Publish 按条件跳过。
- 2026-10-15：Globalping DNS 等待复查发现远端请求在探测仍为 `in-progress` 时可能长时间挂起，且此前循环上限会把未完成测量作为普通结果返回；界面无法主动停止等待。现按 Globalping 状态契约轮询，单请求最多 8 秒、整个远端流程最多 20 秒、本机 DNS 最多 5 秒，轮询间隔 700 ms；取消会停止本机网络等待并保留已有答案，同时说明已提交的远端测量可能继续。防御审查又发现截止点附近可能额外睡满一个轮询间隔，现把轮询唤醒点限制到总 deadline 并新增 Rust 回归。配额、超时、请求和探点失败均结构化呈现，技术细节默认折叠；补充英文单条答案复数规则。macOS 27.0.1 arm64 隔离 QA `com.bench.qa.globalping20261015` 真机故障注入：挂起 Globalping GET 时取消，保留 `localhost → 127.0.0.1` 并显示英文 `1 answer` 与停止说明；另一轮请求在 8 秒超时后仍保留本机答案、显示本地化远端超时，技术详情默认折叠；再让 API 快速连续返回 `in-progress` 至总截止，界面显示 20,004 ms，最后一次轮询发生于 19.691 秒，确认没有额外延迟。QA 窗口、模拟服务与专属数据已退出并移入废纸篓；共享 Rust 构建缓存与 `node_modules` 保留。调试 `.app` 构建和 ad-hoc 签名成功，Tauri 命令尾段因未配置本机 updater 私钥而未能签 updater 包。
- 2026-10-15：P0-1 复查发现 Quick Fix 首次服务读取没有进行中状态或当前页重试入口；React StrictMode 的 effect 重放和快速重新进入可并发派发重复 `networksetup -listallnetworkservices`。打开系统网络设置也没有 use-case 防重入或进行中提示。新增服务列表 single-flight、空态/重试与加载按钮状态，刷新失败时保留已有列表；系统设置打开期间禁用按钮并显示状态。新增 use-case 并发/失败重试测试与 FixPanel 空态、加载态测试。macOS 27.0.1 arm64 隔离 QA bundle `com.bench.qa.networkfix20261015` 真机确认 Quick Fix 显示并可刷新本机 `Wi-Fi` 服务；点击系统设置入口后实际进入「网络」面板，未改动网络配置。自动化测试覆盖无服务提示、重试入口、加载禁用态、刷新失败保留旧服务、双重调用只派发一次。`lint:fe`、关键测试 244 项、network-probe 115 项、Prettier、`build:fe` 和 `git diff --check` 通过。QA 应用已退出并核实进程消失；QA `.app`、updater 压缩包、`dist`、扩展 staging、sidecar 和临时配置已移入废纸篓，共享 Rust 构建缓存与 `node_modules` 保留。
- 2026-10-15：继续审查 P0-1 服务选择恢复时发现遗漏：刷新把原选中 `Wi-Fi` 替换为 `Ethernet` 后，旧逻辑会静默改选并重新启用网络修复，尽管“清除过期选择”测试只覆盖列表变空。现要求服务被移除后用户手动重选，加入 Ethernet 替换场景回归及中英文提示，并同步产品规格。macOS 27.0.1 arm64 隔离 QA bundle `com.bench.qa.networkfixfinal20261015` 通过临时 debug-only IPC 注入复验：实际 AX 树先显示 `Wi-Fi`；刷新返回 `Ethernet` 后显示“请选择网络服务”，切换 DNS / DHCP 续租 / 重置网络栈均禁用；手动选择 Ethernet 后按钮恢复。只在 QA 构建中注入服务列表，没有点击修复动作或更改系统网络配置。注入已从源码撤除，并无注入变量的 debug 构建覆盖共享可执行文件；确认测试标记不在源码和该可执行文件中。FixPanel 4 项、network-probe 116 项、`lint:fe`、`build:fe`、文档一致性/链接、Prettier 与 `git diff --check` 通过。QA 应用经菜单正常退出并核实进程消失；QA `.app`、专属数据、`dist`、扩展 staging、sidecar 已移入废纸篓，共享 Rust target 与 `node_modules` 保留。
- 2026-10-15：完成 P0-1 的 S-X-13 跨面板迟到错误复验。审查确认 `store.setError` 已有“当前面板可见错误不被其他面板迟到错误覆盖”的保护，但此前没有锁定该行为的回归测试。macOS 27.0.1 arm64 隔离 QA app `com.bench.qa.errorscope20261015` 真机验证：启动 resolver `203.0.113.1` 的 DNS 查询并确认显示“查询中…”，切换 TCP 后以超长主机名触发真实 IPC 校验失败，面板显示“TCP 连通探测失败。”；等待约 35 秒后该提示仍保留，返回 DNS 面板时查询已结束且无成功结果卡。新增 store 错误优先级回归测试；error-scope 文件 7 项通过、Prettier 与 `git diff --check` 通过。QA app 正常退出并核实进程消失；QA `.app`、updater 压缩包、应用数据/cache、`dist`、扩展 staging、sidecar 与临时配置已移入废纸篓，共享 Rust target 与 `node_modules` 保留。调试 `.app` 构建和 codesign 验证成功，Tauri 命令尾段因未配置本机 updater 私钥而未能签 updater 包。
- 2026-10-15：Ping / 自定义目标失败态 dogfood 发现依赖库英文错误直接进入主结果：Ping 单包超时、HTTP reqwest 传输失败和 TLS 握手失败会与中文界面混杂。Ping 现返回稳定 `timeout` / `permission_denied` / `network_error` 分类码；自定义目标按本地化状态显示 HTTP 传输失败、HTTP 状态码和 TLS 握手失败，原始未知 ICMP / HTTP / TLS 诊断集中放在默认折叠的系统详情。新增 S-X-19、S-X-20 和前端 / Rust 回归。macOS 27.0.1 arm64 隔离 QA bundle `com.bench.qa.pingerror20261015` 真机复验：中文与英文 Ping 超时状态本地化；自定义目标 `192.0.2.1` 在中文显示「请求超时 / 请求失败 / 握手未完成」，英文显示 “Request timed out / request failed / handshake incomplete”，reqwest 原文默认隐藏、展开后可读；临时 localhost 503 响应器返回的 HTTP 状态显示「失败 — HTTP 503」，随后已停止响应器。network-probe 120 项、关键测试 244 项、`lint:fe`（含 i18n / 文档 / 类型检查）、Prettier、`cargo fmt --check`、先前通过的 Rust 分类用例与 Clippy、调试 `.app` 构建和 codesign 验证通过。QA 窗口和进程已退出；本轮及 10-14 遗留 QA `.app`、DMG、`dist`、扩展 staging、sidecar、隔离用户数据和缓存已移入废纸篓，共享 `tauri-app-target` 与 `node_modules` 保留。

- 2026-10-15：P0-1 真机复查 ISSUE-001 后确认当前 L1 与离线子页高亮能正确跟随面包屑；可复现问题是 IPv6 / MTU 聚焦视图仍显示只适用于整包的诊断说明。现在仅在“全部”视图显示整包提示，并补齐中英文覆盖的五项检查说明；同步 S-FA-01 与产品规格。macOS 27.0.1 arm64 隔离 QA bundle `com.bench.qa.p0one20261015` 验证中文/英文“全部”视图说明正确、切到 IPv6 / MTU 后整包说明消失，高亮与面包屑一致。network-probe 121 项、关键测试 244 项、`lint:fe`、Prettier、`git diff --check`、Tauri QA `.app` 构建及代码签名通过；QA app 已正常退出并确认进程消失。P0-1 的 GitHub 系统代理路径、Ping 域名解析错误 UX 仍待修复；Windows 回归按用户安排延后。
- 2026-10-15：修复 P0-1 ISSUE-002：官方站点 HTTPS 请求未使用 macOS 系统代理，GitHub 卡片失败。reqwest 已内置成熟的 `system-proxy` feature，启用后复用平台代理实现，不增加自造代理解析；同步产品规格和 S-TT-01。macOS 27.0.1 arm64 隔离 QA app `com.bench.qa.networkproxy20261015` 真机点测 GitHub 卡片成功，TTFB 1562 ms、吞吐采样 8.6 Mbps。Clippy 与 Rust 649 项单测通过；QA app 正常退出，正式 Bench 未启动，未修改系统代理设置。Windows 真机回归依用户安排延后。
