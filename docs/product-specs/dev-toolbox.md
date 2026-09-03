# 开发工具箱（Dev Toolbox）产品说明

> 本文件是 dev-toolbox 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- 路由 `/dev-toolbox`；`desktopOnly: false`（浏览器也可进入页面，但六类功能底层均为 Tauri IPC，浏览器下操作会失败并 toast 报错）。
- 侧边栏「开发工具箱」**主菜单入口**；同时**收容**三个被侧边栏隐藏的子 feature——端口管理（port-manager）、环境检测（env-detector）、Token 计算（token-calc，见 `features/registry.tsx` 的 `TOOLBOX_FEATURE_IDS`）作为 Tab。
- 用途：开发者常用小工具聚合——端口 / 环境 / Token 三个完整页面，加内置的 JSON/Base64/Hash/UUID/时间戳转换、网络诊断（ping/本机 IP/WiFi）、系统信息。
- 历史说明：原「开发清理」已迁出为独立主菜单模块 Clean Space，「网络诊断」已独立为 Network Probe；本模块保留轻量版诊断（见 `docs/modules/dev-toolbox/README.md`）。

## 2. 界面布局

```
┌──────────────────────────────────────────────────────────┐
│ Tab 栏（border-b 下划线，激活项主色高亮，可横向滚动）          │
│ 端口管理｜环境检测｜Token 计算｜开发工具｜网络诊断｜系统信息     │
├──────────────────────────────────────────────────────────┤
│ 内容区（视 Tab 而定）                                      │
│  • 端口管理 / 环境检测 / Token 计算：直接挂载对应 feature 页面 │
│    （flex-1 min-h-0 容器，各页面自管内部滚动）                │
│  • 开发工具 / 网络诊断：ScrollableArea 内多组 SettingGroup    │
│  • 系统信息：懒加载信息网格                                   │
└──────────────────────────────────────────────────────────┘
```

- 默认 Tab：`port-manager`。
- 布局细节：三个「整页工具」Tab（`FULL_PAGE_TOOL_TABS`：port-manager / env-detector / token-calc）渲染在普通 `flex-1 min-h-0` 盒内（自带滚动），其余 Tab 走 `ScrollableArea`——避免双层 h-full 滚动链塌陷。
- **Tab 交互**：Tab 为普通 ghost 按钮（下划线样式），激活主色 + `border-primary`，hover 变 foreground；`whitespace-nowrap` + `overflow-x-auto` **横向滚动**（窄窗不换行）；**无 `role=tab` / `aria-selected` / 方向键导航**（对比 hardware 的 CompareTabs 有 `role="tab"`）。
- **挂载/状态保留语义**：整页工具 Tab 仅在激活时挂载（切换即卸载/重挂载）；devtools / diagnostics / info 的输入输出存于**页面级 controller**（顶层 `useState`，组件不因切 Tab 卸载）→ **切 Tab 不丢失**各工具输入与结果；env-detector 的 zustand store 为模块级单例，切走再切回**不会**重新触发扫描（`scanned` 持久），需手动点「刷新」。

## 3. 端口管理 / 环境检测 / Token 计算（整页子 feature）

- 复用各自独立 feature 的完整实现（页面/控制器/store/服务），此处仅作 Tab 容器挂载（`React.lazy` + Suspense spinner）。
- 端口管理：见 port-manager 模块；环境检测：见 env-detector 模块；Token 计算：见 token-calculator 模块。本文档不展开其内部功能。

## 4. 开发工具 Tab（devtools）

共 5 组工具，每组 = `SettingGroup` 卡片，操作用「正在执行」态禁用按钮，结果以 `<pre>` 展示：

- **JSON 格式化**：多行文本输入 → 「格式化（pretty）」/「压缩（minify）」；非法 JSON 报错（toast）。
- **Base64**：文本输入 → 「编码」/「解码」；解码非法 base64 或非 UTF-8 报错。
- **Hash 计算**：文本输入 + 算法下拉（MD5 / SHA1 / SHA256 / SHA384 / SHA512）→ 「计算」，输出小写十六进制。
- **UUID 生成器**：点击「生成 UUID v4」输出一个 v4 UUID。
- **时间戳转换**：Unix 秒数输入 + 格式下拉（完整日期时间 / 仅日期 / 仅时间 / ISO 8601）→ 「转换」，按 UTC 输出。

**通用交互细节**：

- 任一操作执行中（`applying`）该 Tab **全部**工具按钮禁用，防重复触发；按钮无单独 loading spinner（由禁用态承载）。
- 输出 `<pre>` 仅在有值时渲染：JSON `max-h-32`、Base64 `max-h-24`（超出滚动），Hash/时间戳无高度上限；Hash 输出为小写十六进制，无换行上限。
- **输入控件**：JSON 用 `Textarea`（`h-24`，无字数上限、无防抖）；Base64/Hash/时间戳用 `Input`；算法/格式下拉为 `Select`（固定 5 种算法 / 4 种格式）；均无 `aria-label`（仅 placeholder）。UUID 输出用 `<code>` 内联（非 `<pre>`）。
- **Base64 解码容忍空白**：后端先 `.trim()` 再解码（首尾空白不影响结果）。
- 操作失败时 toast 报错（「操作失败: {{error}}」），**输出区保持上一次结果不变**（`run` 返回 `undefined`，不覆盖）。
- **非法 JSON** → toast「操作失败: Invalid JSON: ...」；**Base64 解码**非 base64 或非 UTF-8 文本 → toast「操作失败: ...」，均不产出输出。
- **时间戳**：输入为空/非法时前端 `parseInt(tsInput) || 0` **静默按 0 处理**（输出 `1970-01-01 00:00:00` UTC），**不报错**；仅当超出 chrono 可表示范围时后端才回 `INVALID_INPUT`。
- Hash 输入为空时计算空串哈希（不报错）；算法下拉固定 MD5/SHA1/SHA256/SHA384/SHA512 五种，正常不会触发「不支持算法」。

## 5. 网络诊断 Tab（diagnostics）

- 说明文案 + 目标主机输入框（placeholder 示例 `google.com 或 8.8.8.8:53`）。
- 三个按钮：
  - **Ping**：对目标执行 ping（count=5，1s 超时），输出 `PingResult`（host / 发包 / 收包 / min·avg·max RTT / 丢包率）JSON。
  - **本机 IP**：返回本机 IP（macOS `ipconfig getifaddr en0`）；非 macOS 报 unsupported。
  - **WiFi**：返回 WiFi 信息（SSID / 信号强度 / 信道，macOS airport 命令解析）；非 macOS 报 unsupported。
- 结果 JSON 格式化后显示在 `pre`（max-h-48 滚动）。

**交互细节**：

- **目标校验**：目标为空或含非法字符（`;` `|` `&` `$` 反引号、空格等）时点 Ping → toast「操作失败」（后端 `validate_host` 回 `INVALID_INPUT`）。
- **不可达/丢包不报错**：Ping 始终返回 `PingResult`（含 `loss_percent`），即使全丢包也原样 JSON 展示；**DNS 解析失败** → toast「操作失败: DNS resolve failed ...」；macOS 无「本地网络」权限时 ICMP socket 打开失败 → toast「操作失败: ... ICMP_UNAVAILABLE ...」。
- **平台限制**：「本机 IP」「WiFi」在非 macOS → toast「操作失败: Not supported on this platform」（`UNSUPPORTED`）。
- **失败时旧结果保留**：错误经 `run` 转为 toast，`diagnosticResult` 不被覆盖（上一次成功结果仍在 `pre` 中可见）。
- 结果与操作共用 `pre` 展示区（JSON 格式化）；「本机 IP」「WiFi」仅展示结果，无复制按钮（未见实现）。
- **本机 IP 边界**：macOS 下 `ipconfig getifaddr en0` 输出为空（无 en0 接口 / 未联网）时**返回空字符串 `local_ip`，无报错无提示**（`unwrap_or_default` 静默）。
- **WiFi 未连接**：airport `-I` 命令退出码非 0 → toast 报错；已连接但字段缺失时 SSID 等可为空串（无校验提示）。
- **Ping 无地址解析**：`resolve_target_ip` 解析到 0 个地址 → toast「操作失败: No addresses resolved for target」（`INVALID_INPUT`）。

## 6. 系统信息 Tab（info）

- **懒加载**：首次切到该 Tab 才调用 `get_system_info`（`systemInfoUseCases.loadSystemInfo`），成功结果缓存于组件状态，之后切换不重复加载（有单测覆盖）；失败显示错误文案，可重进重试。
- **加载态**：加载中显示居中旋转 spinner（无文字）；`systemInfoLoading` 守卫避免重复触发。
- **失败态**：显示错误文案（destructive 红色，`t(systemInfoError)`）；切换 Tab 再切回时自动重试（`systemInfo` 仍为 null → effect 重新触发）。
- **空值过滤**：`Unknown` / 0 / 空字符串项自动隐藏，仅展示有值项；浏览器运行时走 `getBrowserSystemInfo`（UA 探测，仅浏览器名/版本、平台、语言、分辨率等附加项有值）。
- 信息卡片网格无 hover 特效、无复制/刷新按钮（刷新未见实现，刷新需切换 Tab 重新触发）。
- 信息卡片网格（`grid auto-fill minmax(280px,1fr)`），每项 = 标签 + 值；`Unknown` / 0 / 空值项自动隐藏。
- 展示项：操作系统、系统版本、内核版本、主机名、设备型号（macOS `sysctl hw.model`）、CPU 型号、CPU 架构、CPU 核心数、总内存/可用/已用（GB）、内存使用率（%）、运行时长（人性化）、Linux 发行版、浏览器名/版本、平台、语言、屏幕分辨率（后 4 项为浏览器运行时附加）。

## 7. 交互反馈（useSettingAction）

- 所有工具操作统一经 `useSettingAction().run(key, action)`：同一 key 不可并发（防重复点击）；执行中该 key 加入 `applyingKeys`，按钮禁用（`applying` 派生）；成功 toast「操作成功」，失败 toast「操作失败: {{error}}」（`getErrorMessage` 归一化）。
- 反馈文案默认走 `systemSettings.toasts.*`。
- 同一 key 并发点击被**静默忽略**（`applyingKeys.has(key)` 直接 return，无二次提示）；不同 key 可并行，但本模块所有工具共享同一 `applying` 派生（任一操作进行中，开发工具/诊断 Tab 的全部按钮禁用）。
- **无 loading toast**（加载态由按钮禁用承载）；成功/失败均有 toast 反馈，无复制类操作。
- **键盘与无障碍**：Tab 无 tab 语义/方向键（见 §2）；输入控件仅 placeholder 无 `aria-label`；结果 `<pre>` 无 `aria-live`（输出变化不播报）；所有操作按钮为真实 `<button>`（可 Tab + Enter 触发）。

## 8. 快捷键

- 无快捷键（未见实现）。

## 9. 技术实现要点

- **架构**：`page.tsx`（Tab 编排 + 三块内联子视图渲染函数）+ `hooks/useDevToolboxController.ts`（全部状态与操作编排，useState 局部状态，**无 zustand**）+ 复用 system-settings 的用例/仓储/`useSettingAction`。
- **后端命令**（均在 `src-tauri/src/system_settings/`，经 `systemSettingsRepository` 封装）：
  - `json_format(input, indent)`、`base64_encode(input)`、`base64_decode(input)`、`generate_uuid()`、`calculate_hash(input, algorithm)`、`timestamp_convert(ts, format)`（`dev_tools.rs`）。
  - `ping_host(host, count)`（count clamp 1..20，委托 `net_probe::ping`，SSoT）、`get_local_ip()`、`get_wifi_info()`（`network.rs`）。
  - `get_system_info()`（`system_info.rs`，`sysinfo` crate；model_name=macOS sysctl；distribution=Linux）。
- **IPC 契约**：命令名见 `lib/tauri/contracts.ts`（`systemSettings.devTools.*` 等），TS 侧 `system-settings.repository.ts` 封装。
- **持久化**：无（所有状态为组件/局部状态，未持久化）。
- **i18n**：zh/en 双语；工具文案前缀 `systemSettings.devtools.*` / `systemSettings.diagnostics.*` / `systemInfo.*` / `devToolbox.*`。
- **平台边界**：`get_local_ip` / `get_wifi_info` 编译期 `#[cfg(target_os="macos")]` 门控，其余平台返回 unsupported 错误。

## 10. 数据模型

- `ToolboxTab`：`"port-manager" | "env-detector" | "token-calc" | "devtools" | "diagnostics" | "info"`。
- 局部状态：各工具输入/输出字符串、`hashAlgo`、`tsFormat`、`diagnosticTarget`、`diagnosticResult`、`systemInfo`（`SystemInfoData`）/`systemInfoLoading`/`systemInfoError`、`activeTab`。
- 返回值类型：`PingResult`（host/packets_sent/packets_received/min_rtt/avg_rtt/max_rtt/loss_percent）、`IpInfo`（local_ip/external_ip?）、`WifiInfo`（ssid/signal_strength?/channel?）、`SystemInfoData`（见 §6）。

## 11. 边界与限制

- 六类功能依赖 Tauri IPC：浏览器运行时操作会失败并 toast 报错（页面本身可进）。
- 网络诊断的「本机 IP」「WiFi」仅 macOS；Ping 跨平台（委托 network-probe 实现）。
- 时间戳转换按 **UTC**（naive UTC），不转本地时区；非法时间戳报错。
- Base64 解码要求 UTF-8 文本（非文本二进制解码报错）。
- Hash 输入为整串文本（不做文件哈希——未见实现）。
- 该模块为聚合容器，其内部三个子 feature 的功能边界与限制见各自模块文档。
- 窄窗口：Tab 栏 `overflow-x-auto` 横向滚动；诊断按钮 `flex-wrap`；系统信息网格 `auto-fill minmax(280px,1fr)`，卡片值 `break-words` 防溢出。
- 大文本：JSON/Base64 输入无长度上限，输出区固定 max-h 滚动（JSON `max-h-32`、Base64 `max-h-24`、诊断 `max-h-48`）；Hash/时间戳输出无高度上限。

## 12. 异常处理（异常场景对照）

> 统一入口：六类功能均为 Tauri IPC，任何失败经 `useSettingAction().run` 捕获 → toast「操作失败: {{error}}」（`getErrorMessage`/`parseCommandError` 归一化为 `{code,message}`）；成功 toast「操作成功」。失败**不覆盖**上一次成功输出。

| 场景                                                          | 行为/提示                                                                                                       | 恢复/降级                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 浏览器（非 Tauri）运行                                        | 页面可进，但六类工具 IPC 调用失败 → toast「操作失败: ...」（invoke 拒绝）                                       | 无（需桌面端）；系统信息 Tab 例外：走 `getBrowserSystemInfo`（UA 探测）可正常展示 |
| JSON 格式化输入非法                                           | toast「操作失败: Invalid JSON: ...」（`INVALID_INPUT`）                                                         | 修正输入后重试；输出区不变                                                        |
| Base64 解码非法 / 非 UTF-8                                    | toast「操作失败: ...」（`INVALID_INPUT`）                                                                       | 修正输入后重试                                                                    |
| Hash 算法不在白名单                                           | toast「操作失败: Unsupported algorithm ...」（`INVALID_INPUT`；前端下拉固定 5 种，正常不触发）                  | 无                                                                                |
| 时间戳超出 chrono 可表示范围                                  | toast「操作失败: Invalid timestamp」（`INVALID_INPUT`）                                                         | 修正输入；空/非法输入前端静默按 0 处理，不报错                                    |
| Ping 目标为空/含非法字符                                      | toast「操作失败: ...」（`validate_host` → `INVALID_INPUT`）                                                     | 修正目标后重试                                                                    |
| Ping DNS 解析失败                                             | toast「操作失败: DNS resolve failed ...」（`INVALID_INPUT`）                                                    | 换可解析目标重试                                                                  |
| Ping ICMP socket 打开失败（macOS 无「本地网络」权限）         | toast「操作失败: ... ICMP_UNAVAILABLE ...」                                                                     | 系统设置授权后重试                                                                |
| Ping 目标不可达/丢包                                          | **不报错**，返回含 `loss_percent` 的 `PingResult` JSON                                                          | 直接展示结果                                                                      |
| 「本机 IP」「WiFi」在非 macOS                                 | toast「操作失败: Not supported on this platform」（`UNSUPPORTED`，后端编译期 `#[cfg(target_os="macos")]` 门控） | 无（仅 macOS）                                                                    |
| 系统信息加载失败（桌面 IPC 不可用）                           | 信息 Tab 显示 destructive 错误文案                                                                              | 切走再切回自动重试（effect 重新触发）                                             |
| 后端内部错误（`spawn_blocking` JoinError / serde 序列化失败） | toast「操作失败: ...」（`INTERNAL`）                                                                            | 修正输入后重试                                                                    |
| Ping 目标解析到 0 个地址（域名合法但无记录）                  | toast「操作失败: No addresses resolved for target」（`INVALID_INPUT`）                                          | 换可解析目标                                                                      |
| DNS 解析的 `spawn_blocking` 任务失败                          | toast「操作失败: ...」（`TASK_FAILED`）                                                                         | 重试                                                                              |
| macOS 本机 IP 无 en0 接口 / 未联网                            | 返回**空字符串** `local_ip`，无 toast（`unwrap_or_default` 静默）                                               | 无（静默空结果）                                                                  |
| macOS WiFi 未连接（airport `-I` 退出码非 0）                  | toast「操作失败: ...」                                                                                          | 连接网络后重试                                                                    |

- **幂等/防重入**：`run` 同一 key 防并发（重复点击静默忽略）；所有操作按钮在任意操作进行中禁用（`applying`）。
- **取消/并发**：无取消机制（操作均为短时 `spawn_blocking`，无长任务）；不同 key 可并行。
- **数据损坏**：无持久化（全部为组件/局部状态），不存在数据损坏场景。
