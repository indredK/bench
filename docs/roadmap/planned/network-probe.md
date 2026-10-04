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

- 2026-10-04：多节点 DNS 首次查询前与等待期间曾留白；增加双语结果区提示，并保留重新查询期间的旧结果。macOS 隔离桌面包真机确认空态、加载态和按钮禁用状态；本轮 Globalping 请求失败，仅记为网络观测、不归因于产品逻辑。新增前端用例并同步产品规格与发现设计。

- 2026-10-03：复查多节点 DNS 结果时发现成功/失败标签硬编码英文；现接入中英文文案，并以颜色辅助区分结果，新增结果状态回归覆盖。后续桌面验收及修复记录见下一条。
- 2026-10-03：多节点真机查询进一步发现 Globalping `finished` 被误判为 DNS 成功：对保留 `.invalid` 域名，本机结果失败而远端无答案仍显示成功；此外 API `rawOutput` camelCase 未反序列化且原始英文详情默认可见。现按官方 `statusCode` 区分 NOERROR/NXDOMAIN，增加双语「域名不存在/无记录」状态，原始详情折叠，并补 Rust 3 项/API DTO/组件回归。重建后实测 `example.com` 四个节点成功、保留 `.invalid` 域名在本机失败并在远端显示「域名不存在」，技术详情默认折叠；`test:critical` 293 项、`lint:fe`、Clippy、Rust fmt、format:check 通过。
- 2026-10-03：按 Globalping 官方异步测量约定，修复多节点 DNS 把固定 20 次轮询（约 14 秒）当成测量终态、并可能因当前返回的 probe 都结束而提前退出的问题；现以顶层状态轮询至终态或 45 秒总截止，限制单次请求 8 秒、按间隔退避，并将部分结果与明确超时状态返回 UI。Rust 轮询用例 5/5、前端关键用例 293/293、lint:fe、clippy、Rust fmt 与 cfg 检查通过；macOS 桌面以仅监听 127.0.0.1 的模拟服务确认 5 秒截止后保留已完成节点答案、把未完成节点和汇总标为「等待超时」，展开详情显示原始状态；恢复正式 API/45 秒配置后，真实 Globalping 对 example.com 返回本机与 3 个远端成功结果，约 5.5 秒。可运行 debug .app 已生成；bundle 命令仅因缺少 updater 私钥未能签署更新包。该项验证闭环。
- 2026-10-03：UX/隐私复审补足多节点 DNS 的第三方披露：在运行按钮旁双语提示远端查询会向 Globalping 发送域名；结果摘要增加 polite live region，告知屏幕阅读器异步完成状态。新增组件断言，并同步产品规格与发现设计。

- 2026-09-03：首版生成——依据 `docs/modules/network-probe/roadmap.md`（Wave 0–6）与 `docs/roadmap/ROADMAP.md` D-016，提炼 ⬜/◐ 未完成项为「待实现」「待验证」「远期」三档；产品说明见 `../product-specs/network-probe.md`。
