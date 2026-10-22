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

### Wave 2 · Post-MVP-C（续）

- [ ] **C2-2** Globalping 代理补全：remote ping / http + token（DNS multi 已交付，◐）。
- [ ] **C2-3** 自有 agent 远程执行：TLS / 鉴权 / 限速贯通，`nodeId` 全链路（HTTPS 与 WSS 注册/健康检查、白名单已交付；凭据存储与远程执行待，◐）。

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
- 2026-10-23：补齐概览、修复、IPv6、MTU、公网出口、ARP 设置、Agent 刷新/移除、能力包刷新/校验入口的 IPC hover 命令提示；组合概览 tooltip 列出全部三个子命令，产品规格同步更新。`test:critical` 286 项、`lint:fe` 通过；隔离 `com.bench.qa.commandhints20261023` 真机通过键盘焦点验证概览与修复命令提示；未执行网络探测或修复；本项远程 CI 待运行，P0-1 仍未完成。
