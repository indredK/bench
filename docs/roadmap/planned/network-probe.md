# Network Probe（网络探测 / 网络急救箱）规划功能

> 本文件记录 network-probe 模块**未实现 / 待验证**的功能规划，与 `../product-specs/network-probe.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 来源：`../modules/network-probe/roadmap.md` 的 Wave 表格（⬜ 待实现 / ◐ 部分完成）、ROADMAP 与 design 文档。

## 当前状态

- 模块 1.0 / MVP A+B 已闭环（D-016）。
- Post-MVP：测速 + Globalping DNS + agent 注册骨架 + 安全/发现主路径已交付。S3-6 代码已进入本地验证，**Nmap 真机验收仍待**；特权 helper 仍待。

## 待实现（未完成项）

### Wave 0 · Polish 基线（可并行）

- [ ] **P0-1** MVP 面板空态 / 失败态 / 重入与取消一致性扫尾（S-X-\* · coding §3/§5）。
- [x] **P0-2** 关键测试补强：前端 IPC / Rust DTO 对齐、cancel 幂等、Advisor 分支和无特权能力降级均有回归覆盖。

### Wave 3 · 安全 Tab（续）

- [ ] **S3-8** 特权分层：`priv-helper` / 触发提权 / 自动降级文案（依赖 Wave 1）。

### Wave 4 · 发现 Tab（续）

- [ ] **D4-1** RFC 5780 映射/过滤探测已接入实现；待真实 macOS 应用验证行为服务器属性与端到端分类后关闭。分类使用 Endpoint-Independent / Address-Dependent / Address-and-Port-Dependent，另显式报告 no NAT、unsupported 和 inconclusive；不使用容易误导的 cone/symmetric 旧标签。

### Wave 5 · Polish 增强（产品化）

- [x] **P5-1** 长列表虚拟化：端口结果（最多 256）、ARP 设备（最多 /24）、LAN 服务（每协议最多 256）和多节点 DNS 答案列表在达到 80 项时按可视区域渲染；Traceroute 后端硬上限为 32 跳，保留完整紧凑表格，不产生长列表负担。LAN 服务枚数有硬上限和双语截断提示。
- [ ] **P5-2** 持续监控 / 阈值告警。
- [x] **P5-3** 健康报告保留最近 10 次本地快照及记录时间；报告页可选历史基线与最新快照对比检查项状态变化，旧版本地历史可兼容读取，支持清空并提示本地隐私边界。
- [ ] **P5-4** 一体化 BasicView 视觉合并。

### Wave 2 · Post-MVP-C（续）

- [ ] **C2-2** Globalping 代理补全：remote ping / http + token（DNS multi 已交付，◐）。
- [ ] **C2-3** 自有 agent 远程执行：TLS / 鉴权 / 限速贯通，`nodeId` 全链路（HTTPS 注册/健康检查/白名单已交付，远程执行待，◐）。

## 待验证（真机 / 行为）

- [ ] **S3-6 macOS 真机**：当前开发机未安装 Nmap，不能验证真实 CLI 语义。待隔离测试账号可用后，分别验证 Nmap SYN、无 RAW 权限时 TCP connect 降级、勾选指纹后的服务/OS 探测、取消/超时/无效输出降级，以及开放端口风险标签；不得把本地解析器测试当作真机验收。
- [ ] macOS 真机：Local Network / TCC 权限不足时各探测（ping/ARP/抓包）的稳定错误码与「打开系统设置」引导生效。
- [ ] 测速源不可用 / 超时 → 30s 冷却倒计时在真机可用；取消测速可立即重跑。
- [ ] `priv-helper` 提权路径（Wave 1 pack）在真实系统上可安装、触发提权、自动降级文案正确。
- [ ] 能力包 hash 校验失败通道（`installCapabilityPackVerifyFail`）行为符合预期。
- [ ] macOS 真机：DoT 成功/证书或查询失败时状态准确；NAT 多源响应、局部超时和全失败结果符合用户可见文案。
- [ ] macOS 真机：RFC 5780 服务器返回 OTHER-ADDRESS/CHANGE-REQUEST 时分类正确；服务端不支持、非公网备用地址或网络不通时分别显示 unsupported/inconclusive。
- [ ] Windows 降级路径：各工具 `unsupported`/`degraded` 状态与按钮禁用一致，不误报。
  - [ ] Traceroute：发现能力状态与实际权限路径不一致；按用户要求暂缓 Windows 代码修复与验证，待项目阶段完成后安排 Windows 真机回归。

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

- 2026-10-03：静态审查发现端口扫描前端将 `10.999.1.1` 这类越界 IPv4 输入当作私网，从而不弹范围确认；现要求全部 IPv4 八位合法才可免确认，并增加组件回归。lint:fe、critical 287 项与 format:check 通过；隔离 macOS 桌面 UI 复验正在进行，未经验证不推送。
- 2026-10-03：复查多节点 DNS 结果时发现成功/失败标签硬编码英文；现接入中英文文案，并以颜色辅助区分结果，新增结果状态回归覆盖。后续桌面验收及修复记录见下一条。
- 2026-10-03：多节点真机查询进一步发现 Globalping `finished` 被误判为 DNS 成功：对保留 `.invalid` 域名，本机结果失败而远端无答案仍显示成功；此外 API `rawOutput` camelCase 未反序列化且原始英文详情默认可见。现按官方 `statusCode` 区分 NOERROR/NXDOMAIN，增加双语「域名不存在/无记录」状态，原始详情折叠，并补 Rust 3 项/API DTO/组件回归。重建后实测 `example.com` 四个节点成功、保留 `.invalid` 域名在本机失败并在远端显示「域名不存在」，技术详情默认折叠；`test:critical` 293 项、`lint:fe`、Clippy、Rust fmt、format:check 通过。
- 2026-10-03：按 Globalping 官方异步测量约定，修复多节点 DNS 把固定 20 次轮询（约 14 秒）当成测量终态、并可能因当前返回的 probe 都结束而提前退出的问题；现以顶层状态轮询至终态或 45 秒总截止，限制单次请求 8 秒、按间隔退避，并将部分结果与明确超时状态返回 UI。Rust 轮询用例 5/5、前端关键用例 293/293、lint:fe、clippy、Rust fmt 与 cfg 检查通过；macOS 桌面以仅监听 127.0.0.1 的模拟服务确认 5 秒截止后保留已完成节点答案、把未完成节点和汇总标为「等待超时」，展开详情显示原始状态；恢复正式 API/45 秒配置后，真实 Globalping 对 example.com 返回本机与 3 个远端成功结果，约 5.5 秒。可运行 debug .app 已生成；bundle 命令仅因缺少 updater 私钥未能签署更新包。该项验证闭环。
- 2026-10-03：UX/隐私复审补足多节点 DNS 的第三方披露：在运行按钮旁双语提示远端查询会向 Globalping 发送域名；结果摘要增加 polite live region，告知屏幕阅读器异步完成状态。新增组件断言，并同步产品规格与发现设计。
- 2026-10-03：完成 P5-3 报告快照对比：健康扫描历史新增本地采集时间，兼容读取旧格式快照；报告页可在最近 10 次记录中选择基线，对比检查项状态的新增、移除和变化，并明确只比较状态、保留本地隐私提示。损坏或超限的本地历史按无数据处理；`test:critical` 293 项（53 个文件）、`lint:fe`、`format:check` 与 88 篇 Markdown 链接检查通过。
- 2026-10-03：macOS 隔离应用真机复验 P5-3：两次真实本机体检生成两条带时间快照，基线比较和本地隐私提示正确显示；打开「清空历史」后选择取消，两条记录继续保留。复验同时发现共享 Cargo target 会复用旧的 Tauri 前端资源清单；`src-tauri/build.rs` 现监听生成的 `dist`，重新构建后桌面应用显示最新对比界面。端口扫描确认框仍待安全授权后桌面复验。
- 2026-10-03：完成 P5-1 长列表收尾：端口、ARP 设备、LAN 服务及多节点 DNS 答案列表达到 80 项时复用 TanStack Virtual，仅挂载可视行；mDNS/SSDP 各自限制 256 条，超过上限由结果 DTO 标记并以双语提示，避免嘈杂局域网造成无界内存和 DOM 增长。Traceroute 后端最大 32 跳，保留完整表格。验证通过：critical 286 项、Rust 661 项（1 项跳过）、lint:fe、Prettier、Rust fmt、Clippy、cfg hygiene（386 文件）、生产构建与 88 篇 Markdown 链接检查。Nmap 与其它 macOS 网络真机验收继续保持未完成。
- 2026-09-03：首版生成——依据 `docs/modules/network-probe/roadmap.md`（Wave 0–6）与 `docs/roadmap/ROADMAP.md` D-016，提炼 ⬜/◐ 未完成项为「待实现」「待验证」「远期」三档；产品说明见 `../product-specs/network-probe.md`。
- 2026-10-03：NAT 探测改用 webrtc-rs `rtc-stun` 协议库并保留 Tokio 传输控制；增加整段 DNS/探测总超时、严格报文与映射属性校验、证据不足/映射变化分类，以及中英文用户文案和折叠诊断。`lint:fe`、`test:critical`（255 项）、`test:fe`（355 项）、Rust 全量测试（630 项，1 项跳过）、cfg 检查与 clippy 均通过；仍需 macOS 应用内网络真机验收，RFC 5780 分类仍未完成。
- 2026-10-03：DNSSEC 面板将 secure/insecure/bogus/unknown 映射到中英文状态，未知后端状态安全回退；DoH/DoT 诊断与命令提示改为默认折叠的技术详情。3 项组件回归测试通过；lint:fe、critical 262 项、前端全量 362 项、生产构建和格式检查通过。DoT 与 NAT 仍需 macOS 应用内网络真机验收。
- 2026-10-03：DNSSEC 结果改为保守分类：只有有效 `Status` 与 `AD=true` 才能显示 secure；`SERVFAIL` 不再直接断言 bogus，缺失 `Status`/`AD` 或无可判断答案显示 unknown；`AD=false` 的 UI 文案说明响应未认证，不推断数据一定未签名。增加 3 项 Rust 状态矩阵测试并更新双语提示/安全设计；lint:fe、critical 264 项、前端全量 364 项、Rust 全量 638 项（1 项 ignored）、clippy 与 fmt 通过。DoH/DoT/NAT 仍待 macOS 网络真机验收。
- 2026-10-03：以 Hickory 0.26.3 的 RFC 8484 DoH wire format 和内置 root trust anchor 替代 Cloudflare JSON `AD` 信号；DNSSEC 由本机验证完整 RRset/CNAME 链与否定证明，结果保守映射 secure/insecure/bogus/unknown。为 DoH/DoT TLS 启用 `webpki-roots`。3 项 Rust DNSSEC 状态矩阵、前端 critical 264 项、Rust 全量 639 项（638 通过、1 ignored）、clippy、fmt、cfg hygiene、lint:fe 与 Markdown 链接检查通过；DoH/DoT/NAT 仍待 macOS 应用内网络真机验收。
- 2026-10-03：RFC 5780 客户端逻辑接入现有 `rtc-stun` 协议库，分别报告映射/过滤行为；过滤测试使用新 UDP 源端口，校验备用响应来源，并拒绝私网、保留及测试网 OTHER-ADDRESS。新增中英文状态文案。Pion 官方客户端示例所用 `stun.voipgate.com:3478` 在当前开发网络被解析为 RFC 2544 测试网地址 `198.18.0.90`，因此本机无法确认服务端能力；实现需等 macOS 应用网络真机验收后关闭 D4-1。自动化检查结果待本轮补齐。
- 2026-10-03：RFC 5780 复核修正两项报文兼容/分类逻辑：按 RFC 8489 接受只包含 XOR-MAPPED-ADDRESS 的合法响应（旧式 MAPPED-ADDRESS 仅在出现时参与一致性核对）；服务器拒绝或忽略 CHANGE-REQUEST 时显示 `unsupported`，不再把原地址回包当成过滤超时。新增对应 Rust 回归，并在双语结果提示中明确服务器、本地端口和网络路径范围；仍需 macOS 应用真机验收。
- 2026-10-03：检查 STUN 协议依赖后，将 `rtc-stun` 从 0.20.5 升级到 webrtc-rs 当前稳定版 0.21.0；保留其 Sans-I/O 协议层和应用侧 Tokio 超时/来源校验。Cargo 锁文件移除旧版不再需要的传递依赖；Rust 644 项通过、1 项仅本机 Chrome fixture 测试跳过，clippy 通过。
- 2026-10-03：P0-1 扫尾发现全局单一错误状态会让并行面板互相清除失败提示，迟到取消失败可能误清新会话标记；节点刷新/Agent 写入缺少互斥，写成功但回读失败会被误报为写失败；修复面板缺服务加载/空态与失效选择回退；节点列表缺少初次加载与刷新失败反馈。现按错误 key/scope 隔离、取消标记按 session ID 条件清理；节点与服务列表操作均有用例级防重入和可见状态；节点列表有加载/刷新/空态/失败提示且保留旧数据。自动化验证通过：critical 279 项、前端全量 379 项，`lint:fe`、格式检查和生产前端构建通过，88 篇 Markdown 链接检查通过。P0-1 的 macOS 应用内真机验收仍待隔离 macOS 测试用户后完成。
- 2026-10-03：完成 P0-2 自动化补强：IPC 契约新增 Network Probe capabilities / node / pack / DNSSEC / traceroute / NAT / multi-node DTO 对齐；cancel 幂等与 Advisor 状态分支补覆盖；无 App 上下文时验证 ARP/抓包降级和端口扫描能力；修复 Advisor 忽略 Captive `warn` 状态。前端全量 379 项、Rust 650 项（1 项本机 Chrome fixture 跳过）、`lint:fe`、格式检查、clippy、Rust fmt 及 88 篇 Markdown 链接检查通过。P0-1 的 macOS 应用内真机验收仍待隔离 macOS 测试用户后完成。
- 2026-10-03：S3-6 本地实现：复用系统已安装 Nmap（默认不做服务/OS 指纹；显式确认后启用轻量 `-sV`/有限 `-O`，禁用 NSE），单目标校验、限时/限量输出/取消降级、来源标注与仅开放端口风险标签已接入；同步修正 Nmap 能力状态误报。自动化与 macOS 真机门禁未完成前 S3-6 仍保持待验证；当前开发机未安装 Nmap，且应用真机仍需隔离测试账号。
- 2026-10-03：S3-6 静态复查修复 Nmap 数字 IPv4 范围被 URL 域名解析器误接收、未闭合 XML 文档被当作成功解析，以及已结束会话的迟到取消长期占用 registry 的问题；增加单目标范围、完整 `nmaprun` 根元素和活动 session 生命周期回归。验证通过：Rust 658 项（1 项跳过）、`clippy:be`、Rust fmt、`check:be-cfg`（386 文件）、`lint:fe`、critical 282 项与生产前端构建。当前机器无 Nmap，隔离 macOS 测试账号未就绪，因此真实 CLI 与应用内行为仍不算验收，S3-6 保持待验证。
- 2026-10-03：端口范围复核发现确认框把重复项重复计数，且后端先展开列表再做上限检查；现以前后端同一规则去重计数，限制表达式 4096 字节与最多 256 个唯一端口，非法输入在前端实时说明并禁用扫描。新增前后端回归覆盖重叠范围、重复项、非法输入和超限；当前验证：Rust 660 项（1 项跳过）、critical 284 项、`lint:fe`、`format:check`、cfg hygiene、clippy、Rust fmt 与生产前端构建通过。Nmap 真机验收仍待安装 Nmap 和隔离 macOS 测试账号。
