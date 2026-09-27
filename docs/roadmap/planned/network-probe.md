# Network Probe（网络探测 / 网络急救箱）规划功能

> 本文件记录 network-probe 模块**未实现 / 待验证**的功能规划，与 `../product-specs/network-probe.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 来源：`../modules/network-probe/roadmap.md` 的 Wave 表格（⬜ 待实现 / ◐ 部分完成）、ROADMAP 与 design 文档。

## 当前状态

- 模块 1.0 / MVP A+B 已闭环（D-016）。
- Post-MVP：测速 + Globalping DNS + agent 注册骨架 + 安全/发现主路径已交付；**指纹增强与特权 helper 仍待**。

## 待实现（未完成项）

### Wave 3 · 安全 Tab（续）

- [ ] **S3-6** 服务 / OS 指纹 + 风险标注（依赖 S3-5）。
- [ ] **S3-8** 特权分层：`priv-helper` / 触发提权 / 自动降级文案（依赖 Wave 1）。

### Wave 5 · Polish 增强（产品化）

- [ ] **P5-2** 持续监控 / 阈值告警。
- [ ] **P5-3** 健康报告历史快照 + 跨时间对比（部分完成，◐——报告历史已有，对比 UI 待做）。
- [ ] **P5-4** 一体化 BasicView 视觉合并。

### Wave 2 · Post-MVP-C（续）

- [ ] **C2-2** Globalping 代理补全：remote ping / http + token（DNS multi 已交付，◐）。
- [ ] **C2-3** 自有 agent 远程执行：TLS / 鉴权 / 限速贯通，`nodeId` 全链路（HTTPS 注册/健康检查/白名单已交付，远程执行待，◐）。

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
- 2026-09-27：登记 STUN RFC 5780 分类、兼容服务器配置与逐源耗时为 C2-4；当前实现仅提供多源 Binding 映射观察。
- 2026-09-27：C2-4 已实现：可配置 RFC 5780 服务域名/端点、逐源映射与过滤行为/耗时、备用地址可达性校验和故障隔离；SRV 优先级在 IPv4 偏好与去重后仍保持；验收说明见产品说明与 `docs/modules/network-probe/design-discover.md`。
- 2026-09-27：P0-1 已实现：统一长任务取消中的反馈与禁用态；取消 IPC 失败后恢复重试；网络服务读取、节点注册/移除和系统设置打开均增加防重入/loading/空列表恢复；详情见产品说明 §3、§13 与审计记录。
- 2026-09-27：P0-2 完成：全量 Network Probe IPC DTO 对齐、取消会话注册表与 RAII 清理、Advisor 规则矩阵、无特权能力降级和 UI 可运行性测试；本地门禁、macOS 真机取消后重试、GitHub Actions #689 的必需检查均通过，关闭该待办。
- 2026-09-27：P0-3 修复端口扫描中 nmap 子进程无法及时取消、可能继续 TCP 回退的问题：共用扫描会话，复用 `subprocess.rs` 的超时、输出限制和进程组回收；本地单测、macOS 真机界面取消两次及 GitHub Actions #691 全部必需检查通过。
- 2026-09-27：P0-4 修复中文界面直接显示英文端口扫描结果消息：取消态与 TCP/nmap 结果改由前端 i18n 映射，产品说明与审计记录同步；组件中英回归、本地门禁与 macOS 真机取消/完成态验证通过，GitHub Actions #692 全部必需检查通过。
- 2026-09-27：P0-5 修复网络能力读取中 `nmap -V` 无超时并阻塞 async worker：移入阻塞池，复用 `subprocess.rs` 的 2 秒超时和进程组回收；补充超时回归测试。本地门禁、完整 Rust 测试通过；macOS 真机确认 2 秒内能力矩阵恢复、端口扫描降级按钮可用且子进程回收；debug `.app` 已签名（完整 `build:debug` 仅因缺少可选 `TAURI_SIGNING_PRIVATE_KEY` 未生成 updater manifest）；GitHub Actions #693 全部检查通过。
- 2026-09-27：P5-1 长结果虚拟化已实现：端口样本、Traceroute 跳点、ARP 邻居和 LAN 服务超过 50 条时使用既有 TanStack Virtual；长列表支持键盘滚动与屏幕阅读器位置/总数，流式结果只在滚动贴底时跟随。组件回归、前端门禁与 macOS 真机 100 端口列表/键盘首行验证通过；`build:debug` 的 `.app` 已签名可运行，完整命令仅因本机缺少 `TAURI_SIGNING_PRIVATE_KEY` 未生成 updater artifact。
- 2026-09-27：发现 Tab 的 NTP 阈值与多源结果完成：替换手写报文为 `sntpc` + Tokio adapter，逐源校验并发探测，offset / RTT 取中位数并展示 stratum；阈值修正为 `>500ms warn` / `>2s high`，中文 severity 与逐源错误本地化，单源故障不影响其他结果；不调整系统时钟。组件回归、前端门禁、Rust 全量测试和 macOS 真机验证通过；debug `.app` 已签名并完成 NTP 真机探测，命令日志时间戳与命令分行显示，保留命令标识完整性；完整 `build:debug` 仅因本机缺少可选 Tauri updater 私钥未生成 updater artifact；推送后的 GitHub 构建仍待确认。
