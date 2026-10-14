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
- [ ] **P0-2** 关键测试补强：契约 · cancel 幂等 · Advisor 纯函数 · 无特权降级（部分完成，◐）。

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
