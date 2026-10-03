# Bench 审计记录

本文件只保留审计豁免和仍有效的风险；已修复历史由 Git 保留，可复用规则已进入 [coding-standards.md](../how-to/coding-standards.md) 与 [ARCHITECTURE.md](../reference/architecture.md)。

## 不计违规决策

除非前提变化，后续审计不重复报告：

1. `src/data/phone.ts` 保留中文原始数据，展示层通过 `PHONE_*_KEYS` 和 `t()` 翻译；新增数据必须同步映射。
2. `src/features/hardware/` 无真实编排时无需空 `hooks/`、`services/`。
3. 各模块 `columns.tsx` 差异大，不为形式统一抽取。
4. `lib/tauri/commands/*` 已是纯 IPC 适配时，不新增只 re-export 的 feature repository。
5. 页面本地状态无需强制进入 Zustand；跨组件/页面共享后再上提。
6. `src-tauri/src/lib.rs` 启动链末端 `.expect()` 可保留；IPC 和可降级初始化路径仍禁止 panic。
7. 子组件用 selector 读取稳定 store action 可保留；禁止无 selector 整 store 订阅进入 hook 依赖。
8. `dev-toolbox` 是聚合 Tab，`updater` 是全局对话框，不强制拥有导航 feature 的完整结构。

## 当前风险

- [§7/§8/§4] `src/features/photo-triage/`、`src-tauri/src/photo_triage/` - 2026-09-03 复查发现并已修复：11 处 IPC 路径 `lock().unwrap()`（Mutex 中毒回归）、阻塞 I/O 未 `spawn_blocking`（7 命令）、sips/ffmpeg/qlmanage 无超时未复用 `subprocess.rs`、`prune` 源目录不可达时静默清除引用、`move_items` 部分失败不回滚、`ConfirmSheet` 硬编码中文插值、`window.confirm` 原生弹窗、文档注册三缺口（modules/README 索引、check-docs 豁免、D-020 决策）与持久化治理（config.json schema v1 + manifest 256MB 上限 + persistence-schema 登记） - 均已修复；`trash/restore/move/prune` 补 5 个 Rust 行为测试待验证链执行 - **强制** - 状态：代码已修复/待验证
- [§3/§5/§6/§9] `src/features/account-manager/` - 区域 error/retry、分层拆分与错误统一由 R01 关闭；2026-09-30 复查又修复旧对象错误串用、错误 message/完整 Auth Proxy URL/OAuth state 进入 renderer、后台重载错误遮挡旧数据、dialog 失败提示被遮挡及重试重复触发。自动化验证通过；区域错误/partial 的中英文截图待隔离 macOS 测试用户后归档；Keyring/WebView/Deep Link 双平台行为继续执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待真机验收
- [§3.3/§7/§8] `src-tauri/src/account_manager/` - 同源 Web Storage/IndexedDB、canonical Cookie expiry、single-flight、Deep Link inbox 和 capability 已实现；partition key 不可用且目标平台行为未验收 - 保持 partitioned Cookie fail-closed，执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待验收
- [§7.4/§9] `src-tauri/src/app_manager/` - 缺双平台 inventory fixture、启动/更新/卸载 smoke 和 CI runner；快照缓存契约（损坏/上限/schema/取消）已由 R02 代码项关闭 - fixture 与 smoke 执行 [App Manager roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/app-manager/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§6/§9] `src/features/quick-launch/` - 缺 macOS/Windows 启动 smoke 和 500/2000 应用性能证据；2000 项虚拟化单元测试已入 `test:critical` - 性能数据执行 [Quick Launch roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/quick-launch/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§5/§7/§9] `src/features/system-settings/`、`src-tauri/src/clean_space/` - 核心保护已实现，macOS 权限拒绝、read-after-write、受保护目录、timeout 和真实释放量未真机验收 - 执行 [R03](../roadmap/ROADMAP.md#r03-macos-system-settings-与-clean-space) - **强制** - 状态：代码已修复/待验收
- [§7/§9] `.github/workflows/ci-build.yml` - RC dry-run 入口与 Release 副作用 guard 已由 R05 落地；仍缺真实 updater 私钥三目标 run - 执行 [R05](../roadmap/ROADMAP.md#r05-updater供应链与-rc-流水线) dry-run - **强制** - 状态：部分修复/待验收
- [§9] 全局 UX - Playwright/axe 基建、viewport 矩阵与键盘用例已落地（`pnpm run test:e2e`）；截图 baseline 人工审查与屏幕阅读器 smoke 未执行 - 执行 [R07](../roadmap/ROADMAP.md#r07-ux可访问性与视觉回归) - **强制** - 状态：部分修复/待验收
- [§7/§9] 持久化与 updater - 持久化 schema 清单已建立（[persistence-schema.md](../reference/persistence-schema.md)），1.23.0 脱敏 fixture 与迁移幂等测试已入 `cargo test`；真机升级/回滚演练未执行 - 执行 [R06](../roadmap/ROADMAP.md#r06-1230-升级迁移与回滚) - **强制** - 状态：代码已修复/待验收
- [§7/§9] `src-tauri/src/net_probe/{dnssec,nat,nat_behavior}.rs` - DoT 先前仅验证 TCP 853 可达却标成功，STUN 先前未校验 transaction/source 且 transaction ID 非 CSPRNG；现改为 Hickory TLS DNS 查询、严格 STUN 响应关联和 RFC 5780 映射/过滤观测，单测通过。DoT、普通 NAT 与 RFC 5780 仍需 macOS 应用内网络真机验收，见 [network-probe 待验证项](../roadmap/planned/network-probe.md) - **强制** - 状态：代码已修复/待真机验收
- [§7/§9] `src-tauri/src/net_probe/ports.rs`、`nmap_xml.rs` - S3-6 已有单目标校验、Nmap 限时执行、严格 XML 解析与 connect 降级的本地自动化覆盖，但当前 Mac 未安装 Nmap，尚未在 Bench 界面实测真实 CLI、权限降级、取消及服务/OS 识别结果；待 Nmap 可用且隔离测试账号就绪后按 [验收项](../roadmap/planned/network-probe.md#待验证真机行为) 执行 - **强制** - 状态：代码已修复/待 macOS 真机验收
- [§UX/§5] `src/features/network-probe/components/PortScanPanel.tsx:28` - IPv4 外形输入只看首个八位就被判为私网；例如 `10.999.1.1` 会跳过端口扫描范围确认 - 现要求四个八位均在 `0..=255` 内才使用私网豁免，无效 IPv4 外形输入保守要求确认；增加 UI 回归测试，lint、critical 与格式检查通过 - **强制** - 状态：代码已修复/待安全授权后进行 macOS 桌面界面复验，复验前不远程提交
- [§5/§UX/§4] `src-tauri/src/net_probe/globalping.rs`、`src/features/network-probe/components/MultiNodePanel.tsx` - 将 Globalping 探测 `status=finished` 误当 DNS 查询成功，忽略 `statusCode`；真实查询保留域名在本机报错、远端无答案仍显示成功，且 `rawOutput` 反序列化字段名不匹配并默认展示英文机器详情 - 仅当探测 finished 且 DNS `statusCode=0` 才标成功；解析 `statusCodeName`/`rawOutput` camelCase，以「域名不存在 / 无记录 / 失败」双语显示响应，并折叠原始技术详情；增加 Rust 状态码/反序列化和前端状态回归 - **强制** - 状态：代码已修复；macOS 桌面 `example.com` 成功、保留 `.invalid` 显示本机失败/远端域名不存在，技术详情默认折叠；自动化检查通过
- [§5/§7/§UX] `src-tauri/src/net_probe/globalping.rs`、`src/features/network-probe/components/MultiNodePanel.tsx` - 固定 20 次轮询可能在 Globalping 的 30 秒 probe 时限前误报失败；按当前已返回 probe 状态提前停止也可能丢掉仍在运行的测量 - 按官方顶层测量状态轮询，设置单请求/总截止时间，保留部分结果并以双语状态标记超时；覆盖混合完成状态、DTO 与结果 UI - **强制** - 状态：自动化门禁及 macOS 桌面模拟超时复验、正式 API 正常结果复验均通过；部分答案保留、未完成节点与汇总超时文案及折叠详情均实机确认
- [§UX/隐私/a11y] `src/features/network-probe/components/MultiNodePanel.tsx` - 面板提到 Globalping 远端探测，但没有明确说输入域名会发送给第三方；异步结果摘要也没有 live region - 增加执行前双语接收方提示，并用 polite live region 报告完成摘要；组件断言与 macOS 桌面结果复验通过
- [§UX/§4] `src/features/network-probe/components/MultiNodePanel.tsx` - 节点 DNS 结果状态直接写死 `OK`/`FAIL`，中文界面混用英文且失败状态不够明确 - 改为中英文状态文案，成功/失败再用颜色区分；增加结果状态回归测试 - **Medium** - 状态：代码已修复并通过 macOS 桌面真实成功/失败结果复验
- [§5/§7] `src/features/network-probe/store.ts` 原 reportHistory localStorage 只做 JSON 解析与数组断言，损坏但形状为数组的数据可令报告页访问 `items.length` 时崩溃，且无数据量上限 - 新增结构验证、10 次/512 项/1 MB 上限和旧格式兼容迁移，并提供时间戳快照；报告页比较状态变化且清空需确认。5 个定向测试、critical 293 项、lint:fe、format:check 与 88 篇文档链接检查通过；macOS 桌面两次真实健康检查后确认两条快照、基线对比和隐私提示可见，打开清空确认后取消仍保留两条记录 - **Medium** - 状态：代码已修复并通过 macOS 桌面真机复验
- [§7/§9] `src-tauri/build.rs` - 共享 Cargo target 下 build script 未声明依赖生成前端 `dist`，前端变更后可能复用旧的 Tauri 嵌入资源清单，导致桌面包仍显示旧界面 - 增加 `cargo:rerun-if-changed=../dist`，前端产物变化时重建资源清单；重建隔离版 macOS 应用并在桌面确认新报告对比界面已嵌入 - **强制** - 状态：已修复并通过 macOS 桌面真机复验
- [§7/§9] `src-tauri/src/net_probe/nat_behavior.rs` - RFC 5780 初版要求合法响应必须同时带 RFC 3489 兼容的 MAPPED-ADDRESS，并把服务器忽略 CHANGE-REQUEST 的有效原地址响应当成超时 - 现按 RFC 8489 只强制 XOR-MAPPED-ADDRESS、对可选 MAPPED-ADDRESS 做一致性校验；拒绝/忽略 CHANGE-REQUEST 明确映射为 `unsupported`，定向 Rust 回归覆盖 - **强制** - 状态：代码已修复/待 macOS 网络真机验收
- [§4/§6] `src/features/network-probe/components/NatPanel.tsx` - NAT 面板直接呈现后端英文机器码，且将英文诊断详情常驻显示 - 已用中英文状态与解释替代机器码，并把原始诊断折叠；组件回归测试覆盖两种语言与映射变化状态 - **强制** - 状态：代码已修复/待 macOS 真机验收
- [§4/§6] `src/features/network-probe/components/DnsSecPanel.tsx` - DNSSEC 状态直接显示后端英文机器值（secure/insecure/bogus/unknown），resolver 诊断与命令提示在中文界面常驻显示 - 为有限状态提供中英文映射并对未知状态回退为「未知」；将 resolver 诊断和命令提示折叠到技术详情；3 项组件回归测试、critical 262 项和前端全量 362 项通过 - **强制** - 状态：代码已修复/待 macOS 真机验收
- [§7/§9] `src-tauri/src/net_probe/nat.rs` - 单一 STUN 服务器成功时被误标为 NAT 分类结果 - 现将单服务器结果标为 `insufficient-evidence`，并以响应数/地址一致性区分状态；6 个定向 NAT 测试及 Rust 全量测试通过 - **强制** - 状态：代码已修复/待 macOS 真机验收
- [§5/§7] `src-tauri/src/net_probe/nat.rs` - 多源映射不同时将字典序首地址写入单一 `mappedAddress`，结果具有任意性 - `mapping-varies` 不再返回单一地址，真实观测值仅留在折叠诊断中 - **强制** - 状态：代码已修复/待 macOS 真机验收
- [§3.3/§5] `src-tauri/src/net_probe/nat.rs` - DNS 解析不受原 3 秒 UDP 接收超时约束，可能令探测持续 loading - 整个 DNS 与探测 Future 增加 5 秒服务器总截止时间，定向超时测试通过 - **强制** - 状态：代码已修复/待 macOS 真机验收
- [§3.3/§5] `src/features/account-manager/hooks/useAuthProxy.ts` - Deep Link inbox 正在 drain 时到达的通知直接返回；若当前 drain 已观察到队列为空，请求仍会留在后端而没有活动对话框触发下一次 drain - drain 完成时消费并发通知；若并发通知遇到 IPC 失败则有界重试一次，避免丢失唤醒且不形成无限重试。空队列竞态、失败重试均有回归测试；critical 259 项、前端全量 359 项通过 - **强制** - 状态：代码已修复/待 macOS 隔离账号真机验收
- [§3.3/§5] `src/features/account-manager/hooks/useAuthProxy.ts` - renderer drain 已从 Rust inbox 取出 ticket 后，切换路由会卸载 Account Manager 并销毁 hook-local active request；返回页面时 inbox 已空，ticket 孤儿化且对话框不再出现 - 将 inbox 协调器提升到 App 生命周期，路由只卸载视图，不丢 active ticket；新 ticket 自动导航到 Account Manager；补 route-unmount/remount 与 browser-mode 回归，定向测试 7 项通过 - **强制** - 状态：代码已修复/待 macOS 隔离账号真机验收
- [§3.2/§3.3] `src/features/account-manager/hooks/useAccountManagerController.ts` - `loadRequestVersionRef` 随 Account Manager 路由卸载而重置；较早的 IPC 加载可能在新页面加载后返回并覆盖新状态 - 将加载序号改为跨路由共享，并以当前序号拦截过期结果；补卸载/重挂并乱序返回的回归 - **强制** - 状态：代码已修复/待 macOS 隔离账号真机验收
- [§3.3/§5/§7] `src-tauri/src/account_manager/commands/proxy.rs` - 新账号登录按 host 先读 snapshot、之后再单独写入新站点；并发深链可同时通过检查并持久化两个同域 Station - 在同一个 `storage::with_state_mut` 原子闭包中查找或创建 Station，并与新账号写入合并；补并发幂等与回滚归属回归 - **强制** - 状态：代码已修复/待 macOS 隔离账号真机验收
- [§3.3/§5] `src-tauri/src/account_manager/commands/proxy.rs` - 代理登录在账号校验、站点创建、账号写入和 WebView 启动前消费一次性 ticket；失败后 UI 保留已失效 ticket 可继续重试，新账号路径还可能留下无窗口的孤儿账号/站点或未关闭的 WebView - 校验失败不消费 ticket；在串行状态变更中写入站点和新账号；失败时按 owner 回滚元数据、关闭新建 WebView 并在可恢复错误时归还未过期 ticket - **强制** - 状态：代码已修复/待 macOS 隔离账号真机验收
- [§UX/a11y] `src/features/account-manager/components/AccountColumn.tsx` - 账号卡片用 `role="button"` 包含复制、登录、刷新、编辑、删除等真实按钮；ARIA 会将按钮角色下的后代压平，屏幕阅读器无法分别识别卡片操作 - 卡片改为带名称的 article，账号名提供独立 toggle button 和焦点样式；保留卡片空白区域的鼠标选择，并补可访问名称/ pressed 状态回归 - **强制** - 状态：代码已修复/待 macOS 隔离账号真机验收
- [§5/§7] `src-tauri/src/net_probe/dnssec.rs` - Cloudflare DoH 返回 `SERVFAIL` 时直接标为 DNSSEC bogus，且缺少 `Status`/`AD` 字段时默认值可能把响应误判为 insecure - 将错误码、缺字段和无可判断结果映射为 unknown；仅 `NOERROR`/`NXDOMAIN` + `AD=true` 显示 secure；`AD=false` 仅解释为响应未认证 - **强制** - 状态：代码已修复（3 个状态矩阵测试通过）/待 macOS 网络真机验收
- [§5/§7] `src-tauri/src/net_probe/dnssec.rs` - DNSSEC 依赖 Cloudflare 专有 JSON 的上游 `AD` 标记，且 Hickory TLS resolver 未启用 CA 根证书包，DoT 证书校验没有可信根 - 升级 Hickory 到 0.26.3，切换 RFC 8484 wire-format DoH 并启用内置 root trust anchor 本地验证；启用 `webpki-roots` 让 DoH/DoT 都验证服务端证书，完整 RRset 和否定证明按 secure/insecure/bogus/unknown 分类 - **强制** - 状态：代码已修复（Rust 定向状态矩阵测试通过）/待 macOS 应用内网络真机验收
- [§3.3/§5/§UX] `src/features/network-probe/store.ts`、`services/network-probe.use-cases.ts` - 全局单一错误槽会让并行工具清除彼此的失败；迟到取消失败可能清掉新会话标记并显示过期提示 - 改为按错误 key/scope 隔离并可分别关闭；取消失败按预期会话 ID 条件清理，只有仍活动的会话才显示错误。补并发隔离、取消重试与迟到失败回归 - **强制** - 状态：代码已修复/待 P0-1 完整扫尾及 macOS 应用真机验收
- [§3.3/§5/§UX] `src/features/network-probe/components/MultiNodePanel.tsx`、`services/network-probe.use-cases.ts` - Agent 写入和节点刷新没有共享防重入；并行完成时旧列表可能覆盖新列表，且写入已成功但列表刷新失败会被误报为写失败，诱发重复提交 - 刷新/添加/移除共享 `loadingNodes` 锁，页面禁用冲突按钮；分开报告 agent 写入错误和节点列表回读错误。新增并发与 partial-success 回归 - **强制** - 状态：代码已修复/待 P0-1 完整扫尾及 macOS 应用真机验收
- [§3/§5/§UX] `src/features/network-probe/components/FixPanel.tsx`、`services/network-probe.use-cases.ts` - 网络服务首次加载/为空时下拉框呈现无解释空白，服务刷新后旧选项可能仍指向已消失服务；用例还可并发重复加载 - 新增 `loadingServices` single-flight、加载/空状态；当选择的服务已不存在时回退到仍有效的 Wi-Fi/以太网/首项 - **强制** - 状态：代码已修复/待 P0-1 完整扫尾及 macOS 应用真机验收
- [§3/§5/§UX] `src/features/network-probe/components/MultiNodePanel.tsx` - 首次 bootstrap 的节点列表为空期间没有加载说明，刷新失败时也看不出节点数据是否过期 - 增加加载中、刷新中、空列表和失败重试提示；失败时保留上次节点并明确刷新状态，刷新按钮提供进行中反馈 - **强制** - 状态：代码已修复/待 P0-1 完整扫尾及 macOS 应用真机验收
- [§3.3/§UX] `src-tauri/src/net_probe/advisor.rs` - Captive 检测为 `warn` 时 Advisor 进入判断但不产出提示，用户看不到异常重定向/HTTP 状态的原因 - `fail` 保持 critical，`warn` 输出黄色可能门户提醒，`skip` 不猜测；Advisor 状态分支回归通过 - **Medium** - 状态：代码已修复/待 macOS 应用内真机验收
- [§7/§9] `src-tauri/tauri.conf.json` - `com.bench.app` 后缀警告已接受；D-011 要求 2.0 保留，不得直接改字符串 - **建议** - 状态：接受风险

未完成 R00-R08 前不得切换 2.0.0 版本；未完成目标平台行为测试前不得把对应能力标记为发布对等。

## 记录格式

```markdown
- [§X] `文件路径:行号` - 问题 - 修改建议 - **强制/建议** - 状态：已报告/已修复/不修复
```

审计前先读本文件；修复后更新或删除对应风险，不追加无追踪价值的流水账。
