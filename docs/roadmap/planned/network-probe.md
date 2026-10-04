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
- [ ] **C2-3** 自有 agent 远程执行：TLS / 鉴权 / 限速贯通，`nodeId` 全链路（HTTPS 注册/健康检查/白名单已交付，远程执行待，◐）。

## 待验证（真机 / 行为）

- [ ] macOS 真机：Local Network / TCC 权限不足时各探测（ping/ARP/抓包）的稳定错误码与「打开系统设置」引导生效。
- [x] 测速源不可用 / 超时 → 30s 冷却倒计时在真机可用；取消测速可立即重跑。2026-10-05 在独立 macOS Bench 1.37.0 实例验证：不可达源显示错误与冷却，取消后可立即重新开始并再次取消。
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
- 2026-10-05：macOS 隔离真机确认测速失败冷却与取消后立即重跑；PR #138 相关 macOS/Windows Rust、前端、E2E、静态守卫和安全 CI 全绿。Local Network/TCC、特权 helper、降级提示等其他真机项继续待验收。
- 2026-10-05：P0-1 扫尾修复 ARP 发现与抓包诊断重跑时旧结果残留；新增重跑/失败回归用例。macOS 隔离实例确认两面板重跑产生新会话；抓包在本机按预期显示 `PCAP_PRIVILEGE` 降级。P0-1 其余面板一致性仍待审查。
- 2026-10-05：P0-1 扫尾修复取消 IPC 失败后无法重试的问题；失败时仅清除仍属于该会话的前端取消标记，保留运行中会话重试入口，并忽略已结束/新会话的迟到错误。macOS 隔离真机先触发真实 Tauri IPC 拒绝，再在同一会话重试取消成功；新增两项竞态与重试回归用例。P0-1 其余面板一致性仍待审查。
- 2026-10-05：P0-1 扩大重跑状态复位至概览、单次探测、离线组合诊断与 LAN/NAT/NTP 等发现面板；失败时旧快照不再留在结果卡。新增 14 项失败重试用例；macOS 隔离真机先成功 Ping，再触发真实 Tauri IPC 拒绝，确认错误横幅出现且旧 Ping 结果消失。构建期的一次性故障注入已移除；P0-1 其余一致性仍待审查。
