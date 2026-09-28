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
- [ ] **P0-2** 关键测试补强：契约 · cancel 幂等 · Advisor 纯函数 · 无特权降级（部分完成，◐；已补 cancel 幂等与 Advisor 各诊断分支覆盖，仍待 IPC 契约和无特权降级覆盖）。

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
- 2026-09-28：加固 D-017 能力包下载与状态一致性：复用市场的公网 HTTPS/逐跳重定向校验，加入 64 MiB 流式上限、精确大小与 SHA-256 校验、临时文件清理、覆盖共享 app-data 多进程的 packId 并发互斥及版本化制品卸载清理。正式下载路径仍待制品发布后端到端验证；当前 canonical manifest 未配置制品 URL/hash。
- 2026-09-29：完成 P5-1：Network Probe 端口、ARP 邻居、LAN 服务列表超过 50 项时使用共享 `VirtualList` 虚拟渲染；traceroute 表格超过 50 跳时保留原生表格语义并按行虚拟化。同步修复 ARP incomplete 状态缺少中文翻译，以及端口扫描直接暴露英文后端消息的问题。产品说明见 `../reference/product-specs/network-probe.md`。
- 2026-09-29：替换 LAN mDNS 手写 UDP/DNS 字节扫描为 `mdns-sd`，使用 `ssdp-client` 发送并解析 SSDP；对服务类型校验和 64 种上限，mDNS/SSDP 并行探测并各限制最多 512 条，按服务类型/主机保留不同设备服务，并合并多接口地址。结束时停止 browse、关闭 daemon 与转发任务；不访问 SSDP `LOCATION`，提示区分发现内容与只读边界，协议错误按双语呈现并隐藏原始系统诊断，超上限提示截断，不抹掉另一协议成功结果。产品说明见 `../reference/product-specs/network-probe.md`。
- 2026-09-29：修复取消未知/已结束扫描会话时后端永久累积取消 ID 的问题。会话登记时初始化取消状态，取消只更新活动会话，完成后清除；补充 Rust 幂等与过期 ID 回归测试。P0-2 仍待契约、Advisor 与无特权降级测试。
- 2026-09-29：修复 macOS traceroute 无特权 UDP fallback 因 trippy-core 缺少必需端口方向而构建失败；限制该 fallback 到 trippy 支持的平台，为并行扫描分配不同动态源端口。取消登记使用作用域 guard 并跟随阻塞线程退出；UI 本地化降级/无跳点状态、隐藏后端诊断，并在取消时隐藏空结果提示。补充 Rust 与 UI 回归测试。
- 2026-09-29：Advisor 对 DNS/公网出口/局域网异常的分类改用 health key/status，不再匹配英文 detail 文本；补齐三类分支及证据不足时不猜测的回归覆盖。P0-2 尚欠 IPC 契约与无特权降级覆盖。
