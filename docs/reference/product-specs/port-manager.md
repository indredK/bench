# Port Manager（端口管理）产品说明

> 本文件是 port-manager 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- **桌面端（macOS/Windows 跨平台）独立模块**，入口：路由 `/port-manager`，侧边栏注册（Zap 图标），`desktopOnly: true`（未限定平台，双端可用）。
- 用途：批量检查一组端口（本地进程 / 远程连通性），查看占用进程树与指纹，并安全释放端口（Local 模式可 Kill）。
- 核心保证：Kill 仅限 Local 模式且为「本次扫描得到的 PID」，后端二次校验防 PID 复用误杀；Remote 只做连通性、禁止一切破坏性操作；危险操作强制二次确认。

## 2. 主界面布局

```
┌──────────────────────────────────────────────────────────────┐
│ 控制卡：模式[本地|远程](Remote 时: host 输入)                    │
│         端口输入[3000,8000-8010] [扫描] [清空所选]              │
│         常用端口 chips │ 历史端口 chips                        │
│         端口 chip 区（waiting/scanning/success/empty/error）   │
├──────────────────────────────────────────────────────────────┤
│ 结果卡：标题(扫描结果 N · 占用 M)                               │
│         [告警开关][隐藏/显示空端口][全量重扫][全部杀掉]           │
│         端口详情列表（虚拟滚动）：                               │
│           端口 | 指纹徽章 | kill 消息 | [杀掉]                  │
│           进程树（可展开，高亮占用者 PID / 根进程标记）            │
└──────────────────────────────────────────────────────────────┘
```

## 3. 模式：Local / Remote（v1.18）

| 能力           | Local | Remote             |
| -------------- | ----- | ------------------ |
| 端口连通性检查 | 是    | 是                 |
| PID/进程树     | 是    | 否                 |
| Kill（杀掉）   | 是    | 禁止（不显示按钮） |
| 历史记录       | 是    | 是                 |

- 切换模式会**清空全部结果**（`scanSession` 递增使在途扫描作废），避免混合 local/remote 数据展示。
- Remote 需先填 host（未填则报 `remoteHostRequired`）；结果显示「远程端口探测结果」提示，无进程树。

## 4. 端口输入与解析

- 支持逗号分隔、范围（如 `3000,8000-8010`）、混合；端口范围 1–65535；单次输入上限 100 个端口。
- 非法字符（非数字/逗号/连字符）输入即弹黄色 tooltip，3 秒后自动清空；格式错误（如 `8000-`、起始>结束、越界、超上限）给出对应错误文案。
- 已存在端口重复添加 → 提示「端口已添加」；最多同时跟踪 20 个端口（超出静默忽略）。
- `Enter` 提交扫描；空输入 `Backspace` 删除最后一个端口 chip；输入框右侧 X 一键清空输入。
- **交互细节**：
  - 输入非法字符即弹黄色 tooltip，**3 秒后自动清空输入与错误**（`setTimeout`，期间继续输入会重置计时）；格式错误给出对应文案：`invalidRangeFormat`（如 `8000-`）、`invalidPortNumber`、`invalidPortFormat`、`rangeStartGtEnd`（起始>结束）、`portOutOfRange`（越界 1–65535）、`tooManyPorts`（超 100）。
  - 提交/扫描仅触发「新增端口」的扫描；已跟踪端口不重复扫描；`Enter` 提交后清空输入框。
  - X 清空后自动 `focus()` 回输入框。

  - **键盘与无障碍**：输入框 `id="port-input"` 但**无关联 `<label>`/`aria-label`**（placeholder 仅作提示）；Remote host 输入框同理无 label。模式按钮 Local/Remote 无 `aria-pressed`，`disabled = killing`；`Enter` 提交、空输入 `Backspace` 删最后一个 chip（见上方）。

## 5. 端口 chip 区

- 每个待查端口一个 chip，状态语义（颜色 + 图标）：
  - `waiting`（灰）/ `scanning`（靛蓝脉动 spinner）/ `success`（绿点，占用）/ `empty`（蓝点，空闲）/ `error`（红点，查询失败）/ `ended`（灰虚线，会话作废）。
- chip 点击 → 滚动到对应详情并高亮 2 秒；chip 内「重扫」（单端口）/「移除」按钮。
- 上方提供**常用端口** chips（3000 5173 1420 8080 5000 4200 8000 4321 6006 1234 9000）与 **历史端口**（localStorage 保存最近 10 个，去重、最新在前），点击即加入跟踪并扫描。

- **键盘与无障碍**：chip 本体为 `<span onClick>`，**无 `role=button`/`tabIndex`**，点击滚动到详情仅鼠标可用；chip 内「重扫」「移除」为 Button（可 Tab/Enter），带 tooltip。

- **禁用条件**：常用/历史端口 chips 在 `killing` **或该端口已在跟踪**时禁用；「清空所选」在扫描中**仍可用**（仅禁 `killing`），通过 `scanSession` 作废在途扫描，已删行不会复活。

- chip「移除」同时从结果列表删除对应行（`removePort` 同步过滤 `portDetails`）；单端口「重扫」（chip 内）无 `killing/isScanning` 禁用，扫描中/杀进程时仍可触发。

## 6. 结果列表（虚拟滚动）

- `@tanstack/react-virtual` 虚拟化（overscan 5，动态行高重新测量）；仅渲染视口附近行，端口再多也流畅。
- 每行：
  - 端口号 + **指纹徽章**（图标+名称，如 Vite/Flask/Spring Boot/Redis，后端按端口+命令行识别）+ 杀进程结果消息（黄色提示，如 `PID 123 killed`）。
  - 非 Remote：进程树（可展开/收起，逐层缩进；占用者 PID 主色高亮 +「占用者」角标；pid==ppid 标「根进程」）+「杀掉」按钮（琥珀色）。
  - Remote：仅连通性提示，无按钮。
- 查询失败行（`detail.error`）：蓝色提示「port N: 错误信息」。
- **空态**：无结果 → 搜索图标 +「暂无结果」；隐藏空端口后全为空 → 「没有占用端口」。
- 工具按钮（结果非空时）：
  - 告警开关（铃铛，需至少 1 个端口）；「隐藏/显示空端口」；「全量重扫」；「全部杀掉」（仅 Local，占用数>0 才可点）。
- **交互细节**：
  - 结果卡标题：`扫描结果 N · 占用 M`（occupied 只统计无 error 且有 PID 的端口）。
  - 「全部杀掉」「全量重扫」在 `isScanning || killing` 时禁用；「告警开关」在端口数=0 或 killing 时禁用（tooltip 提示原因）；「隐藏/显示空端口」仅在结果非空时出现。
  - 每行「杀掉」按钮（琥珀色）在 killing 时禁用；tooltip 展示释放端口命令提示（`freePortCommandTemplate` 替换端口号）。
  - 进程树逐层缩进、每个有子节点的行可展开/收起（▼/▶），占用者 PID 主色高亮 +「占用者」角标，`pid==ppid` 标「根进程」；行点击不选中（纯展示）。
  - 单端口「杀掉」/「全部杀掉」均先弹 `DestructiveConfirmDialog`（端口、PID 数、后果），确认后执行，完成后**自动重扫该端口**刷新状态。
  - 空态：无任何结果 → 「暂无结果」；隐藏空端口后全为空 → 「没有占用端口」；查询失败行以蓝色提示「port N: 错误信息」。
  - 顶部错误 Alert 可一键关闭（X，`onClearError`）。

  - **查询失败行降级**：`detail.error` 时整行替换为蓝色提示（`port N: 错误信息`），**无进程树、无杀掉按钮、无指纹徽章**。

  - **键盘与无障碍**：端口详情行整体为 `<div>`，无键盘导航/无 aria；进程树用 Radix `Collapsible`，有子节点的行可键盘聚焦并以 Enter/Space 展开/收起（占用者 PID 高亮、根进程角标见上方）。

## 7. 告警（端口占用通知）

- 开关打开后 **30 秒轮询**所有已跟踪端口（Local 用进程查询、Remote 用 portCheck），**首次轮询只建立 baseline 不发通知**，此后端口从空闲 → 被占用时发一条系统通知（`portManager.occupationAlertBody`）。
- 关闭时清理定时器；离开页面（effect 卸载）同样清理。

## 8. 杀进程（Kill）安全

- **二次确认**：单端口/全部杀死都先弹 `DestructiveConfirmDialog`（显示端口、PID 数、后果说明）。
- 前端只传 `KillTarget{pid, expected_name}`（expected_name 为扫描时观察到的进程名）。
- 后端重新校验：
  - PID 已不存在 → `PID_GONE`；PID 现在属于不同进程名 → `PID_REUSED`（拒绝，防误杀）；
  - 不允许杀 Port Manager 自身（`SELF_KILL`）或其后代（`CHILD_KILL`）。
- 执行：macOS/Unix 先杀后代再杀目标（SIGKILL），Windows `taskkill /PID /T /F`；权限不足映射 `PERMISSION_DENIED`，其余 `KILL_FAILED`。
- 杀完自动重扫该端口刷新状态。

## 9. 技术实现要点

- **架构**：前端 `src/features/port-manager/`（page / components / hooks / services / store / ports.ts），后端 `src-tauri/src/port_manager/`（commands / processes / fingerprints / types），远程探测复用 `system_settings::port_check`。
- **IPC 命令（2 个）**：`queryPortProcesses(ports)`、`killProcesses(targets)`；Remote 用 `systemSettings.portCheck(host, port)`（`nc -z -w 3`，host 校验、不拼接 shell）。
- **进程查询**：macOS `lsof -ti :port`（去重 PID），Windows `netstat -ano`（locale 无关解析：TCP/UDP 关键字 + LISTEN 哨兵 `0.0.0.0:0`/`[::]:0`/`*:*`）。
- **进程树**：`sysinfo` 快照 → `build_children_index`（O(N) 建父子索引）+ `build_focused_tree`（沿父链上溯最多 64 层找根，再向下建子树），避免大 PID 集合 O(N²)。
- **指纹识别**：`fingerprints.rs` 按端口 + 命令行子串匹配常见 dev server/数据库/工具（Next/Vite/React/Nuxt/Flask/Django/Spring/Tomcat/PostgreSQL/MySQL/Redis/MongoDB/Prometheus/Jupyter 等）。
- **会话作废**：`scanSession` 递增（清空/切模式）使在途扫描结果失效（状态转 `ended`），并丢弃迟到结果避免已删行复活。
- **持久化**：端口历史 `localStorage["port-manager.ports.history.v1"]`（损坏回退空数组）。
- **防重入**：`killing` 锁操作按钮；扫描逐端口串行；告警/定时器在卸载时清理。

## 10. 数据模型

- `PortProcessDetail`：`port` / `pids[]` / `process_trees[]` / `fingerprint{category,name,icon}|null` / `error|null`。
- `ProcessNode`：`pid` / `ppid` / `name` / `command` / `children[]`。
- `KillTarget`：`pid` / `expected_name|null`；`KillPidResult`：`pid` / `success` / `message` / `error_code?`。
- 前端 store：`inputValue` / `portStates[]{port,status}` / `portDetails[]` / `killing` / `portKillMessages{port:string[]}` / `error` / `showEmptyPorts` / `highlightPort` / `scanSession` / `scanMode` / `remoteHost` / `alertsEnabled`。

## 11. 边界与限制

- **Local/Remote 能力边界不可绕过**：Remote 无 PID/进程树、无 Kill。
- **Kill 仅限本次扫描得到的 PID**；二次确认 + 后端 PID 复用校验 + 结构化错误码。
- 平台差异：macOS `lsof`/`kill`，Windows `netstat`/`taskkill`，Remote 均走 `nc`（macOS/Linux 系命令，Windows 上 `nc` 缺失时的行为未见专门处理）。
- 输入限制：单次 ≤ 100 端口、跟踪 ≤ 20、历史 ≤ 10；端口 1–65535。
- 告警轮询 30s 粒度，存在时间窗口延迟；通知权限被拒时静默忽略。

## 12. 快捷键

- 仅输入框内：`Enter` 提交扫描；`Backspace`（输入为空时）删除最后一个端口 chip。

## 13. 异常处理

> Kill 结果为结构化 `KillPidResult{pid, success, message, error_code?}`；查询失败在 `PortProcessDetail.error`（非错误码）中携带；整体性错误（如 `remoteHostRequired`/`killOneFailed`）走顶部错误 Alert。

### 错误码 → 前端提示映射（Kill）

| 错误码                         | 触发场景                                                                                                     | 前端行为/提示                                        | 恢复/降级                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------- |
| `PID_GONE`                     | PID 已不存在（扫描后进程退出）                                                                               | 黄色 kill 消息「PID N no longer exists」，不发送信号 | 自动重扫后行状态刷新      |
| `PID_REUSED`                   | PID 现属不同进程名（`expected_name` 校验）                                                                   | 「PID N 现在属于 X（原为 Y），拒绝终止」——防误杀     | 拒绝执行，重扫确认        |
| `SELF_KILL`                    | 目标为 Port Manager 自身 PID                                                                                 | 拒绝终止                                             | 忽略                      |
| `CHILD_KILL`                   | 目标为 Port Manager 的子进程                                                                                 | 拒绝终止                                             | 忽略                      |
| `PERMISSION_DENIED`            | kill/taskkill stderr 含 permission denied / operation not permitted / access is denied / 拒绝访问 / 拒絕存取 | 红色错误消息                                         | 需管理员/换用其他方式释放 |
| `KILL_FAILED` / `SPAWN_FAILED` | 其余 kill/taskkill 失败、无法启动命令                                                                        | 红色错误消息（带原始 stderr）                        | 重试 / 手动释放           |

### 常见失败场景与行为

- **查询失败**：`lsof` 运行失败 → `detail.error`（行内蓝色提示「port N: 错误信息」）、chip 状态 `error`；无进程 → 蓝色提示「No process found on this port」、chip 状态 `empty`（空闲）。
- **整体错误**：Remote 未填 host → `remoteHostRequired` 顶部 Alert；非桌面端 → `desktopOnly`；单端口/全部杀掉命令失败 → `killOneFailed` / `killAllFailed`（带 fallback 消息），均可一键关闭。
- **会话作废**：清空/切换 Local↔Remote 时 `scanSession` 递增，在途扫描结果作废（chip 转 `ended` 灰虚线），**迟到的扫描结果被丢弃**（不会让已删行复活）。
- **并发/防重入**：`killing` 锁所有 Kill 与扫描入口按钮；扫描逐端口串行（非并行）；告警轮询定时器与高亮定时器在卸载时清理（`clearInterval`/`clearTimeout`）。
- **告警降级**：系统通知权限被拒/环境不支持 → 静默忽略（catch 空），不打断轮询；首次轮询仅建 baseline 不发通知。
- **Remote 边界**：Remote 模式无 PID/进程树、无 Kill 按钮（UI 不渲染）；`nc` 仅 macOS/Linux 系命令，**Windows 上 `nc` 缺失时的行为未见专门处理**。
- **数据损坏**：端口历史 `localStorage["port-manager.ports.history.v1"]` 损坏 → 回退空数组（`readPortHistory` 容错）。

- **远程扫描失败**：`portCheck`（`nc -z -w 3`）抛错 → 该端口 chip 转 `error`，无详情行（与本地一致）；远程 host 为空 → `remoteHostRequired` 顶部 Alert（见上方整体错误）。

- **Kill 确认弹窗边界**：Kill 二次确认用 Radix `AlertDialog`（自带焦点陷阱/Esc）；`killing` 期间弹窗不可关闭（`busy` 守卫），Kill 完成后自动关闭并重扫。
