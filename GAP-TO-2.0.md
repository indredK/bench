# Bench 2.0 发布差距清单

> **性质**：本文件是 [docs/ROADMAP.md](docs/ROADMAP.md) R00–R10 的差距明细展开，供 2.0 收尾执行使用；**不构成第二份路线图**（D-013）。全部差距关闭后本文件应删除，执行状态仍以 ROADMAP.md 为准。
>
> **审计基线**：commit `44edf42`（1.28.0），静态代码审计于 2026-09-03 完成，覆盖 Account Manager / App Manager / Quick Launch / Updater / CI 流水线 / UX·a11y / 持久化迁移七大领域。
>
> **使用方式**：按第六节执行顺序逐项关闭；每项均给出「位置 / 问题 / 修复方案 / 验收标准」。代码项（A 类）修完即勾选；真机项（D 类）必须在目标平台留存证据后才可勾选。

---

## 一、当前已达标基线（不要重复劳动）

以下经审计确认已达标，**不列入差距**：

| 领域            | 现状                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 版本一致性      | `package.json` / `Cargo.toml` / `tauri.conf.json` / `.release-please-manifest.json` 四处一致为 `1.28.0`                              |
| IPC 契约        | account-manager 35 个命令前后端一一对应；`contracts.test.ts` 自动校验命令名/参数/DTO/事件                                            |
| i18n            | zh/en 各 2890 个叶子 key 完全对齐；`check:i18n` 门禁含硬编码文案 AST 扫描                                                            |
| minisign 签名链 | 构建期私钥缺失即 exit 1 → collect 期 `.sig` 非空校验 → publish 期真实 minisign 逐平台验证，全链 fail-closed                          |
| CI 三目标       | macOS arm64/x64 + Windows x64 matrix 齐全，无 Linux runner，`check:ci-platforms` 门禁生效                                            |
| 发布产物        | DMG×2 + MSI + NSIS + `.app.tar.gz`×2 + `.sig`×3 + `latest.json` + `SHA256SUMS` + `OS-SIGNING-NOTICE.txt` 生成与校验齐全              |
| 核心页面状态    | quick-launch / account-manager 的 loading skeleton、empty、error+retry 均达标                                                        |
| 对话框焦点      | 全部基于 radix 原语，focus trap / Escape / 焦点恢复隐式生效，无覆写破坏                                                              |
| 数据可靠性      | 2026-08-04 可靠性审计 4 项已全部修复（Mutex 中毒、子进程输出上限、unreachable、定时器泄漏）                                          |
| 功能闭环        | 无可见不可用断点、无死路由；quick-launch 按需扫描 + 快照恢复（D-019）前端链路已落地并有 4 个行为测试                                 |
| 持久化基建      | `persistence.rs` 原子写 + 备份 + 大小上限；account-manager schema v5 迁移、clean-space/terminology/command-center 均有版本迁移与测试 |
| 进程树回收      | 包操作 30min 超时 + `terminate_process_tree`（Windows taskkill /T /F、Unix pgrep 递归）；批量/下载/安装取消信号贯通                  |

---

## 二、差距总览

| 类别                               | 差距数 | 对应 R 任务     | 执行者          |
| ---------------------------------- | ------ | --------------- | --------------- |
| A1 Account Manager 代码收口        | 9      | R01             | AI              |
| A2 App Manager / Quick Launch 代码 | 10     | R02             | AI              |
| A3 Updater 与 RC 流水线            | 6      | R05             | AI + CI         |
| A4 UX / a11y / e2e 基建            | 8      | R07             | AI              |
| A5 持久化与迁移治理                | 4      | R06             | AI              |
| D 真机验收                         | 6 组   | R02/R03/R04/R06 | 人工 + 目标平台 |
| E 文档治理                         | 3      | R00/R08         | AI              |

---

## 三、A 类：代码差距（AI 可直接修复）

### A1. Account Manager 代码收口（R01）

#### A1-1. 四区域内联 error + retry 缺失 ⛔ P0

**位置**：

- `src/features/account-manager/components/StationColumn.tsx`（全文件，无 error props）
- `src/features/account-manager/components/AccountColumn.tsx`（同上）
- `src/features/account-manager/components/DetailColumn.tsx`（同上）
- `src/features/account-manager/components/auth-proxy-dialog.tsx:259-261`（`handleParseUrl` 失败仅 `console.warn`，用户点「下一步」无任何可见反馈）、`:227-233`（无效 URL 前缀静默 return）

**问题**：所有区域错误只进 sonner toast（瞬态、自动消失、无重试入口），区域无持久化 error UI。刷新保留旧数据（stale-while-revalidate）已达标，但用户在批量刷新 partial 失败后无法对失败区域单独重试。Auth Proxy 的解析失败连 toast 都没有。

**修复方案**：

1. store 增加 `regionErrors: { station?: CommandError; account?: CommandError; detail?: CommandError }`，刷新/操作失败时写入对应区域而非仅 toast。
2. 三个 Column 组件顶部渲染 `InlineErrorBar`（复用或参照 `src/components/` 下既有错误横幅样式）：错误文案 + Retry 按钮；Retry 调用该区域已有刷新函数；成功后清除该区域 error。
3. `auth-proxy-dialog.tsx`：`handleParseUrl` 的 catch 改为 `parseCommandError` → 对话框内联错误提示（步骤区域下方红字 + 重试），删除 `console.warn`；`:227-233` 的静默 return 改为同样的内联提示。

**验收标准**：断网/后端报错时每个区域显示持久错误条与 Retry；partial 批量刷新后失败区域可单独重试且旧数据不丢；Auth Proxy 输入非法 URL 有明确可见反馈。补区域 retry 行为测试（见 A1-8）。

#### A1-2. Rust `commands.rs` 超大未拆分 ⛔ P0

**位置**：`src-tauri/src/account_manager/commands.rs`（2448 行、35 个 `#[tauri::command]`）

**问题**：import/export（829-955）、`open_login_window` 含 exclusivity/代理编排（1269-1313）、`proxy_login`（2069-2253）、`proxy_login_new_account` 含自动建站（2254-2300）等重逻辑堆在单文件。

**修复方案**：按领域 owner 拆分为 `commands/station.rs`、`commands/account.rs`、`commands/session.rs`、`commands/proxy.rs`、`commands/import_export.rs`、`commands/capabilities.rs` 等；`mod.rs` 重导出保持 `invoke_handler` 注册列表不变。**不改任何 IPC 名称**（R01 禁止项），不创建纯转发空壳——每个命令的实现体原样搬移到对应 owner 文件。

**验收标准**：`cargo check` / `cargo test account_manager` / `clippy -D warnings` 通过；`contracts.test.ts` 全绿（命令集合不变）；单文件不超过 ~800 行。

#### A1-3. 前端大文件未拆分 ⛔ P0

**位置**：

- `src/features/account-manager/components/dialogs.tsx`（827 行，5 个对话框同文件）
- `src/features/account-manager/hooks/useAccountManagerController.ts`（761 行）

**修复方案**：

1. `dialogs.tsx` → 每对话框独立文件（`station-form-dialog.tsx`、`account-form-dialog.tsx`、`edit-dialog.tsx` 等，按实际 5 个拆）。
2. controller 按 owner 拆：站点 CRUD、账号 CRUD、刷新编排（单账号/站点/全部）、Deep Link/Auth Proxy 编排、删除编排，各自一个 hook，`useAccountManagerController` 组合导出。组件接口不变。

**验收标准**：`pnpm exec vitest run src/features/account-manager` 全绿；页面行为无变化；单文件 ≤ ~400 行。

#### A1-4. 错误处理双轨与裸 catch ⚠️ P1

**位置**：

- `src/features/account-manager/error-classifier.ts:16-29`（自带 `readCode/readMessage`，与 `src/lib/tauri/errors.ts` 的 `parseCommandError` 语义重叠；`translateError` 模块内零使用）
- `src/features/account-manager/hooks/useAccountManagerController.ts` 约 12 处裸 `catch { toast.error(固定文案) }`：`handleAddStation`(:226)、`handleQuickLogin`(:267)、`handleRedetectProfile`(:282)、`handleAddAccount`(:304)、`handleToggleProxy`(:413)、`handleProbeStrategyChange`(:430)、`handleEditStation`(:501)、`handleEditAccount`(:547)、`handleDeleteStation`(:583)、`handleDeleteAccount`(:613)、`handleReorderStations`(:633)、`handleReorderAccounts`(:668)

**修复方案**：删除 `error-classifier.ts` 的重复解析，统一走 `parseCommandError`（取 code 判可恢复性）+ `translateError`（本地化文案）；12 处裸 catch 改为结构化分类：`INVALID_INPUT` 类显示输入级提示，其余显示系统错误并写入区域 error（联动 A1-1）。

**验收标准**：模块内 grep `readCode`/`readMessage` 为零；每个 catch 路径的错误文案来自 i18n key 而非硬编码；错误 code 可区分用户可恢复 vs 系统错误。

#### A1-5. Rust 端硬编码中文 canonical 值 ⚠️ P1

**位置**：`src-tauri/src/account_manager/commands.rs:2268` — `format!("{host} 账号")` 作为默认账号名，英文界面会显示中文。

**修复方案**：默认账号名改为语言无关 canonical 值（如 `{host} account`），前端展示层按 locale 决定是否需要本地化包装；或后端接收前端传入的 locale 感知默认名（优先前者，符合 §4「语言无关 canonical value」）。

**验收标准**：英文界面下新增代理账号默认名不含中文；zh 界面正常。

#### A1-6. 中英文切换行为测试缺失 ⚠️ P1

**问题**：现有 6 个测试文件全部 mock `t: key => key`，无任何语言切换行为用例。

**修复方案**：在 `src/features/account-manager/__tests__/` 增加语言切换测试：zh→en 切换后三栏标签、错误文案（经 `translateError`）、空态文案即时更新且不残留旧语言；长文本（长站点名/长账号名/长备注）不破版（可用超长中英文字符串断言截断/省略）。

**验收标准**：新增测试进入 `test:critical` 路径并通过。

#### A1-7. 键盘/焦点测试缺失 ⚠️ P1

**问题**：无 Tab/Escape/焦点恢复断言，focus trap 完全依赖 radix 隐式行为。

**修复方案**：为 `DetailColumn` 窄屏 Sheet 与主要对话框补键盘用例：Escape 关闭且焦点回到触发元素、Tab 在对话框内循环（首尾元素包裹）、打开后焦点落在首个可交互元素。

**验收标准**：新增测试通过并覆盖至少 1 个对话框 + 1 个 Sheet。

#### A1-8. 批量 partial 行为测试缺失 ⚠️ P1

**问题**：`api.test.ts` 只验证 refreshAll 会调用命令，无 `RefreshReport` failed 数组 → 失败账号保留旧数据 + partial 提示的行为级测试。

**修复方案**：增加 controller 级测试：mock refreshAll 返回 3 成功 + 2 失败，断言失败账号行数据为刷新前旧值、区域 error（A1-1）出现、Retry 后失败账号恢复。

**验收标准**：测试通过；与 A1-1 联动验收。

---

### A2. App Manager / Quick Launch 代码差距（R02）

#### A2-1. 快照恢复 Rust 端零测试 ⛔ P0

**位置**：`src-tauri/src/app_manager/commands.rs:956-1012`（测试模块仅覆盖 `build_update_report`/`normalize_batch_ids`）

**问题**：D-019 核心承诺无后端测试：`get_cached_app_inventory` 损坏缓存返回 `Ok(None)`（commands.rs:204-236）、写入失败时剥离图标重写（:191-197）、恢复时 `fetch_max` revision 单调（:229-231）。

**修复方案**：在 commands.rs 测试模块（或新建 `commands_tests.rs`）补：损坏 JSON/IO 失败/路径不存在 → `Ok(None)` 且不影响后续扫描；内存缓存命中优先于磁盘；revision 恢复后新扫描 revision > 恢复值。

**验收标准**：`cargo test app_manager` 通过；模块 roadmap「行为测试：get_cached_app_inventory 对损坏缓存返回 null」可勾选代码部分。

#### A2-2. inventory.json 无大小上限 ⛔ P0

**位置**：`src-tauri/src/app_manager/commands.rs:184-198`（`persist_inventory_snapshot`）

**问题**：注释声称「序列化整体超限时剥离图标」，但实际剥离只在 IO 失败时触发，无大小检查，缓存可无限膨胀。对比 account_manager（16MB）、command_center 均有 `ensure_file_size` 上限。

**修复方案**：写盘前序列化后检查字节大小，超过上限（建议 8–16MB）即剥离全部 `icon_base64` 重新序列化再写；仍超限则记录 warning 并拒绝缓存（扫描结果照常返回内存）。

**验收标准**：构造超限 fixture 的单元测试通过；roadmap「体积受控（超限剥离图标）」代码部分可勾选。

#### A2-3. inventory.json 无 schema_version ⚠️ P1

**位置**：`src-tauri/src/app_manager/types.rs:180-199`（ScanResult）

**修复方案**：增加 `schema_version` 字段（serde default 兼容旧缓存），读取时未来版本 fail-closed 返回 `Ok(None)`（对齐 account_manager `validate_schema_version` 模式）。

**验收标准**：旧格式（无该字段）缓存可正常恢复；未来版本缓存被拒绝且不影响重新扫描。

#### A2-4. provider contract test 不成体系 ⚠️ P1

**问题**：R02 步骤 2 要求的统一契约测试不存在为整体；现有断言散落（source evidence 5 用例、appId 稳定性函数级 1 用例、去重 1 用例、AUMID 1 用例）。**缺口**：图标契约（`resolve_macos_icon`/`icns_to_base64_png`/Windows `get_app_icon` 零测试）、warning 契约（`MACOS_SCAN_ROOT_UNREADABLE`、`SCAN_CANCELLED` 零断言）、partial merge 契约（partial 扫描保留旧数据、多 provider 合并零测试）、跨扫描 appId 稳定性（同一应用两次扫描同 appId）。

**修复方案**：新建 `src-tauri/src/app_manager/contract_tests.rs`（或 `tests/` 集成测试）统一断言：同一 fixture 两次扫描 appId 稳定、扫描根不可读产生 warning 而非 error、partial 扫描（部分 provider failed）返回 `complete=false` 且保留已成功项、图标解析对损坏 icns 返回空而非 panic。

**验收标准**：`cargo test app_manager` 含上述 4 类断言并通过。

#### A2-5. macOS 损坏 bundle / 权限失败 fixture 缺失 ⚠️ P1

**位置**：`src-tauri/src/app_manager/macos.rs`（scan_tests 模块 601-695 无损坏 bundle 用例；`MACOS_SCAN_ROOT_UNREADABLE` :334/:360/:384 无测试）

**修复方案**：补测试：截断的 Info.plist / 损坏二进制 plist → 该应用产生 warning 跳过而非扫描失败；扫描根 chmod 000 → warning 返回。Windows 侧补 MSIX fixture（Start Apps JSON 已有 AUMID，补 MSIX 特定格式样本）。

**验收标准**：测试通过；R02 步骤 1 fixture 清单中「损坏 bundle、权限失败」条目可勾选。

#### A2-6. 0/1/50/500/2000 规模 fixture 缺失 ⚠️ P1

**问题**：R02 步骤 5 的性能验证 fixture 不存在。

**修复方案**：生成规模 fixture（临时目录构造 N 个 `.app` / registry JSON），前端测试（`src/shared/app-inventory/__tests__/`）用 2000 项 mock 数据断言虚拟列表 DOM 行数有界、搜索输入不阻塞（现有 500 账号测试模式可复用）；真机性能验证归入 D 类。

**验收标准**：2000 项虚拟化测试进入 `test:critical` 并通过。

#### A2-7. 单个包操作无运行中取消 ⚠️ P2

**位置**：

- `src-tauri/src/app_manager/windows.rs:987,1040,1058`（winget upgrade/uninstall、msiexec 的 cancel 参数传 `None`）
- `src-tauri/src/app_manager/macos.rs:801,851,1141`（brew 路径经 `run_command_with_timeout`，固定传 None）

**问题**：单个升级/卸载取消后需等 30min 超时或自然完成；批量取消只在项间生效。

**修复方案**：将各模块的 per-operation cancel token（可复用 `state.rs` 的 `scan_cancel` 模式，新增 `op_cancel: Mutex<HashMap<op_id, AtomicBool>>`）接入 `run_command_with_timeout_and_cancel`；前端升级/卸载进行中提供取消按钮。

**验收标准**：单操作进行中取消 → 进程树被终止、返回 `cancelled` 状态、UI 回到操作前；R02 禁止项「timeout 后残留进程树」不发生。

#### A2-8. app-manager 错误横幅无显式 retry ⚠️ P2

**位置**：`src/features/app-manager/components/AppManagerCatalogView.tsx:151-167`（错误横幅只有「清除」X 按钮）

**修复方案**：错误横幅增加 Retry 按钮（触发重新扫描）；与「清除」并存（清除=忽略本次错误保留旧数据）。

**验收标准**：错误态可直接重试；R07「failed/retry」状态矩阵该项可勾选。

#### A2-9. SoftwareUpdateView 懒加载 fallback 是纯文本 ⚠️ P2

**位置**：`src/features/app-manager/page.tsx:186-191`（Suspense fallback 仅渲染 `common.loading` 文本）

**问题**：正撞 R07 禁止项「只有 spinner 的首载」——低配机上懒加载 chunk 加载期呈现纯文本闪烁。

**修复方案**：fallback 改为与 `SoftwareUpdateView.tsx:274-280` 同构的 skeleton（复用其骨架组件或抽公共 skeleton）。

**验收标准**：切换到软件更新 Tab 首载呈现骨架而非文本。

#### A2-10. `terminate_unix_descendants` 竞态与无 SIGKILL 升级 ⚠️ P2

**位置**：`src-tauri/src/app_manager/utils.rs:70-82`

**问题**：`pgrep -P` 递归遍历期间进程退出/重父会漏杀；TERM 后无宽限期升级 SIGKILL。

**修复方案**：TERM 后等待短宽限（如 2s），仍存活则 SIGKILL；遍历改为先收集 PID 集合再逐个发信号，并对已退出 PID 的 errno(ESRCH) 容忍。

**验收标准**：单元/集成测试（或真机验证）取消后无残留子进程。

---

### A3. Updater 与 RC 流水线（R05）

#### A3-1. RC dry-run 入口缺失 ⛔ P0（R05 步骤 2 核心差距）

**位置**：`.github/workflows/ci-build.yml:3-11`（触发器仅 push/pull_request，无 `workflow_dispatch`、无 dry-run input）；`:431-453`（tag 构建时「Create or update GitHub Release」无条件执行）；`:8-9`（tag glob `v[0-9]+.[0-9]+.[0-9]+*` 会匹配 `v2.0.0-rc.1` → **推 RC tag 会直接产生正式 Release 副作用**）

**修复方案**：

1. 增加 `workflow_dispatch` 触发器与 `dry_run` boolean input（默认 true）；RC tag（含 `-rc.` 等预发布后缀）或 dry_run=true 时：完整执行三目标构建 + 产物收集 + manifest 生成 + minisign 验证 + SHA256SUMS，但**跳过** `gh release create/upload`，产物以 CI artifact 形式上传。
2. 正式 tag（无预发布后缀）+ dry_run=false 才允许 Release 副作用。
3. publish job 的发布步骤前增加显式 guard（判断 tag 格式与 input），并在 job summary 中输出「DRY-RUN：未创建 Release」标记。

**验收标准**：推 `v2.0.0-rc.1` tag 或手动 dispatch dry-run → 三目标产物齐全、minisign 验证通过、**GitHub Releases 无任何新条目/资产变更**；R08 步骤 2「运行 R05 的 RC dry-run……不发布」可执行。

#### A3-2. `restartNow` 无失败处理 ⛔ P0

**位置**：`src/features/updater/hooks/useUpdaterController.ts:230-232`

**问题**：`restartNow` 直接 `await restartAfterUpdate()`，无 try/catch、无失败状态反馈；R05 明确将「重启失败」列为错误矩阵发布阻断项。

**修复方案**：try/catch 包裹，失败经 `parseCommandError` 分类 → store 置 `error` + `errorInfo`（重启失败需保留已下载产物状态提示用户可手动重启/重试），toast + 对话框内联错误。

**验收标准**：mock `restartAfterUpdate` reject → UI 显示重启失败错误且可重试；错误矩阵测试新增该用例并通过。

#### A3-3. Updater partial 状态未建模 ⚠️ P1

**位置**：`src/features/updater/store.ts:8-17`（`UpdaterStatus` 无 partial）

**问题**：R05 要求状态区分 failed/cancelled/partial；「下载完成但安装失败」「已下载待安装」等中间态无建模，安装失败后进度字段被丢弃。

**修复方案**：增加 `installFailed`（或 `partial`）状态：下载字节数/进度保留，UI 呈现「已下载，安装失败」+ 重试安装/手动安装入口；安装成功路径不变。

**验收标准**：状态机测试覆盖 downloading → installFailed → retryInstall → readyToRestart；roadmap「状态区分 failed/cancelled/partial」可勾选。

#### A3-4. 代理场景错误矩阵缺失 ⚠️ P1

**问题**：`src/features/updater/` 与 `src-tauri/src/app_updater/` grep "proxy" 零匹配；代理错误落入通用 `networkUnavailable/downloadFailed`，无针对性测试用例。

**修复方案**：error-classifier 增加 proxy 类错误识别（如 reqwest 的 proxy connect 错误文本 / 结构化码）；补测试：代理拒绝连接/代理 407 → 明确「代理不可用」提示而非笼统网络错误。

**验收标准**：新增分类与测试通过；错误矩阵「代理」条目可勾选。

#### A3-5. `generate-updater-json.mjs` / `write-updater-manifest.mjs` 无测试 ⚠️ P1

**位置**：`scripts/release/`（仅 `verify-release-assets` 有测试）

**问题**：`latest.json` 聚合的关键逻辑（重复平台检测、缺失平台检测、URL 编码、release metadata 解析）无单测；R05 命令 `vitest run scripts/release` 实际只跑一个文件。

**修复方案**：为两脚本补 vitest 单测：三平台齐全通过、缺一平台抛错、重复平台抛错、重复文件引用抛错、notes/pub_date 正确注入。

**验收标准**：`vitest run scripts/release` 覆盖三个脚本；上述 5 类断言通过。

#### A3-6. verify-release-assets 不校验 OS-SIGNING-NOTICE.txt ⚠️ P2

**位置**：`scripts/release/verify-release-assets.mjs`（必需清单 9 类产物不含 notice；notice 在 verify 之前写入但不被校验）

**修复方案**：notice 在产物目录就位后纳入必需清单校验（或调整 CI 顺序使 notice 先于 verify 写入并加入清单）。附带项：updater 私钥当前无密码（`updater/keys/README.md:31`），RC 前评估轮换为带密码密钥（供应链风险，不阻断）。

**验收标准**：缺 notice 时 verify 失败；密钥轮换决策记录到 R05 证据。

---

### A4. UX / a11y / e2e 基建（R07）

#### A4-1. e2e 测试基础设施为零 ⛔ P0（R07 步骤 1-3 全未启动）

**问题**：无 Playwright/Cypress、无 `playwright.config.*`、无 viewport 矩阵、无截图 diff；ROADMAP 明文「未加入 package.json 前不得勾选 R07」。

**修复方案**：

1. 引入 `@playwright/test`，新建 `playwright.config.ts`：viewport 矩阵 1024×768 / 1280×800 / 1440×900 / Windows 缩放等效（deviceScaleFactor 1.25/1.5）；用 mock repository（拦截 `window.__TAURI_INTERNALS__.invoke`）渲染纯前端状态，不依赖桌面后端。
2. 覆盖 R07 步骤 2 四条路径：quick-launch 搜索/刷新/启动、app-manager 更新/partial、account-manager 三栏/窄屏 Sheet、updater 下载/取消/失败。
3. 每条路径覆盖状态矩阵：loading skeleton、refresh 保留旧数据、empty、failed/retry、partial、unsupported、cancelled、长中英文、语言切换（R07 步骤 3）。
4. 截图 diff（`expect(page).toHaveScreenshot()`）+ 首次 baseline 人工审查记录；package.json 增加 `test:e2e` 命令并接入 CI。
5. 禁止项自检：无伪百分比、无只有 spinner 的首载、失败不折叠为空态、无 viewport 缩放字号、baseline 更新必须人工确认。

**验收标准**：`pnpm run test:e2e` 可执行且四路径 × 状态矩阵通过；viewport × 状态矩阵与截图审查记录留档；CI 有对应 job。

#### A4-2. axe 自动 a11y 检查缺失 ⛔ P0

**问题**：无 axe-core / @axe-core/react / eslint-plugin-jsx-a11y；R07 步骤 4 明确要求。

**修复方案**：e2e 中集成 `@axe-core/playwright`，对四条核心路径每页跑 WCAG A/AA 扫描，violation 数量断言为 0（或明确豁免清单）；CI 输出报告。

**验收标准**：axe 扫描通过或豁免项有记录；报告进入 R07 证据。

#### A4-3. icon-only 按钮缺 accessible name ⛔ P0

**位置**：`src/components/ui/toolbar-button.tsx:42-54`（Button 只有 tooltip，radix Tooltip 仅提供 `aria-describedby` 不提供 accessible name，未透传 `aria-label`）；消费方 `src/features/app-manager/page.tsx:301-353,506-557`（filter/batch/cancel/download 等十余个 icon-only 按钮）

**修复方案**：toolbar-button 透传 `aria-label`（或基于已有 tooltip 内容自动设置 `aria-label`）；为全部 icon-only 用法补 aria-label i18n key（新增 key 需 zh/en 同步，走 `check:i18n` 门禁）。

**验收标准**：全仓 icon-only 按钮均有 accessible name（axe 扫描不报 `button-name`）；R07「icon-only accessible name」条目可勾选。

#### A4-4. 四个模块零测试 ⚠️ P1

**问题**：`network-probe`（37 个源文件，规模最大）、`env-detector`（7）、`terminology`（8）、`dev-toolbox`（3）无任何测试。

**修复方案**：优先 `network-probe`（IPC 契约 + 前端 controller 关键行为：cancel 幂等、面板 loading/error/empty）；terminology（CRUD + 虚拟化）、env-detector（核心解析纯函数）、dev-toolbox（子工具纯逻辑）依次补齐。测试聚焦契约与编排，不求覆盖率数字。

**验收标准**：四模块各有至少 1 个测试文件进入 `pnpm run test:fe`；network-probe 的 cancel 幂等有断言。

#### A4-5. 语言切换行为自动化测试缺失 ⚠️ P1

**问题**：R07 要求语言切换覆盖，现有测试（全部 mock `t`）无一覆盖。

**修复方案**：在 e2e（A4-1）中覆盖 zh↔en 切换：侧边栏、页面标题、空态、错误态即时更新；单元级为 i18n Provider 包裹的渲染测试（至少 1 个核心页面）。

**验收标准**：切换后无残留旧语言文案（含 toast/dialog）；测试通过。

#### A4-6. 键盘/焦点自动化验证缺失 ⚠️ P1

**问题**：focus trap / Escape / 焦点恢复完全依赖 radix 隐式行为，从未被测试证明；R07 要求 Tab 顺序、焦点恢复、focus trap 验证。

**修复方案**：e2e 覆盖：Tab 遍历侧边栏→主内容区顺序合理；对话框打开焦点落入首个交互元素、Tab 循环、Escape 关闭且焦点回触发元素（SettingsDialog、UpdateDialog、DestructiveConfirmDialog 各一用例）；cmdk（命令中心/CommandHint）打开/关闭焦点行为。

**验收标准**：键盘用例通过；屏幕阅读器 smoke 人工记录（归入 D 类证据）。

#### A4-7. `aria-labelledby` / `sr-only` 覆盖薄 ⚠️ P2

**问题**：`aria-labelledby` 全仓 0 处；`sr-only` 仅 5 处。

**修复方案**：为核心页面主区域（如 app-manager 列表区、account-manager 三栏）补 `aria-labelledby` 关联区域标题；icon+文本按钮场景之外的信息性图形补 `sr-only` 说明。以 axe 扫描结果驱动，不做形式化堆量。

**验收标准**：axe 扫描无 heading/region 关联类 violation；核心页面有区域 landmark。

#### A4-8. Updater 对话框状态矩阵补全 ⚠️ P2

**问题**：R07 步骤 2 要求 updater 下载/取消/失败 e2e，当前仅单元测试。

**修复方案**：在 A4-1 e2e 中用 mock IPC 驱动 UpdateDialog：下载进度（含 NaN 防护）、取消回 available、失败 error + 重试、readyToRestart。

**验收标准**：e2e updater 路径通过。

---

### A5. 持久化与迁移治理（R06）

#### A5-1. app-preferences 无 schema_version ⚠️ P1

**位置**：`src-tauri/src/app_preferences/storage.rs`（仅 `closeButtonBehavior` 单 key，无版本保护）

**修复方案**：对齐 command_center 模式：`SCHEMA_VERSION=1` + 未来版本拒绝 + 损坏降级默认值；补单元测试。

**验收标准**：旧数据可读、未来版本 fail-closed、损坏文件恢复默认。

#### A5-2. schema owner 清单文档缺失 ⚠️ P1

**问题**：R06 步骤 1 要求「列出 schema owner、版本、大小上限和失败策略」，该清单不存在。

**修复方案**：在 `docs/` 下建立持久化清单（或并入 ARCHITECTURE 附录），覆盖已确认的 8 个持久化文件：`account-manager-store.json`(v5/16MB/迁移+备份)、`bench/app-manager/inventory.json`(见 A2-3)、`bench/command-center/cards.json`(v1)、`bench/clean-space/records.json`(v1)、`terminology-store.json`、`token-pricing-store.json`、`app-preferences.json`(见 A5-1)、`bench/network-probe/{agents,defaults-override}.json`——每项列 owner 模块、schema 版本、大小上限、失败策略。

**验收标准**：清单与代码一致（可作为 R06 fixture 构建依据）。

#### A5-3. 1.23.0 脱敏迁移 fixture 缺失 ⚠️ P1

**问题**：R06 步骤 1 的脱敏 1.23.0 fixture（设置、账号 metadata、加密 Session、分类/覆盖、本地历史）不存在于仓库。

**修复方案**：按 A5-2 清单构造脱敏 fixture（各 schema 的 1.23.0 历史格式样本 + 已知合法变体），配套迁移测试：`read old → validate → transform → atomic write new → publish memory`，重复启动幂等；覆盖缺字段、损坏 JSON/密文、只读目录、磁盘满、未来 schema、迁移中断（旧数据仍可读）。

**验收标准**：迁移测试全部通过；R06 步骤 2/3 自动化部分可勾选。

#### A5-4. Dev/Prod 共存验证 ⚠️ P2

**位置**：`docs/dev-prod-coexistence.md`

**问题**：R06 禁止 Dev/Prod 互相覆盖，无自动化断言。

**修复方案**：为 persistence 路径构建增加测试：dev/prod 使用不同 identifier 数据目录（读取 `dev-prod-coexistence.md` 确认既定约定），dev 写入不影响 prod 文件。

**验收标准**：测试通过或既有机制已有测试覆盖（如已覆盖则在 A5-2 清单中注明）。

---

## 四、D 类：真机验收差距（需目标平台执行，AI 不得代验）

以下各项在 ROADMAP 与模块 roadmap 中已有详细步骤，此处只列**必须执行**的清单与证据要求，完成后同步勾选对应 roadmap：

| ID  | 任务                                                                                                                                                                                                              | 对应                    | 平台                       | 关键证据要求                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------- | ----------------------------------------- |
| D-1 | System Settings：Finder/截图/网络/Dock/系统开关/默认浏览器 read→write→read-after-write→rollback；权限拒绝/unsupported/写入失败/重启后状态                                                                         | R03                     | macOS 14+ 全新测试用户     | 每项原值/目标值/回读值/回滚值、权限错误码 |
| D-2 | Clean Space：权限拒绝、受保护目录、自定义目录、symlink escape、Docker/find timeout、取消、目录占用、只读文件；清理前后真实磁盘占用；partial 只累计成功项                                                          | R03                     | macOS                      | 逐项结果、前后字节数                      |
| D-3 | Account Manager 真机矩阵：Keyring 持久化/并发首写、Cookie/Web Storage/IndexedDB 捕获与隔离、probe 策略/single-flight/批量 partial、Deep Link 冷/热启动/第二实例/重放拒绝、删除 partial、Windows proxy fail-closed | R04                     | macOS + Windows Sandbox/VM | capability DTO、每场景预期/实际、脱敏日志 |
| D-4 | App Manager / Quick Launch 真机 smoke：Windows EXE/AUMID 启动、图标、winget/MSI、timeout 进程树回收；macOS `.app` 启动、Finder reveal、临时签名身份拒绝、ZIP/DMG 取消、journal 恢复；500/2000 应用 DOM 与交互耗时 | R02                     | 双平台                     | fixture 清单、启动目标类型、性能数据      |
| D-5 | D-019 自启动与快照真机验证：`--hidden` 静默启动驻留 Dock、LaunchAgent 可见可停用、旧 System Events 登录项迁移无双实例；快照恢复/重扫回写 revision 单调                                                            | R02/R03（模块 roadmap） | macOS                      | 系统设置截图（脱敏）、revision 序列       |
| D-6 | 1.23.0 升级/回滚演练：已安装 1.23.0 经签名 updater 升级到 RC（数据、启动、取消、重启、卸载）；备份/重装 1.23.0 回滚，2.0 数据不被旧版静默覆盖                                                                     | R06                     | macOS + Windows            | 迁移前后 schema/数据核对、回滚步骤记录    |
| D-7 | 屏幕阅读器 smoke 与 Tab 顺序人工复核（配合 A4-6 自动化）                                                                                                                                                          | R07                     | 双平台                     | 键盘与屏幕阅读器记录                      |

**硬性规则**：使用生产账号/真实用户数据即触发全局停止条件；「待验收」只能在目标平台证据齐全后改为「通过」，编译成功与文档声明不能代替。

---

## 五、E 类：文档治理差距

#### E-1. ROADMAP.md 版本基线过期 ⚠️ P1

**位置**：`docs/ROADMAP.md:7`（声明「当前代码版本为 1.26.0」，实际 1.28.0）

**修复方案**：R00 执行时修正为实际版本；后续以 R00 冻结时的四文件一致值为准。

#### E-2. 模块 roadmap 完成项清理 ⚠️ P2

**修复方案**：R00 步骤 4——把各模块 roadmap 中已完成项删除（已完成历史由 Git 保留）；远期项保留但本轮不得执行。重点核对 quick-launch/app-manager/system-settings roadmap 中 D-019 已落地的代码项。

#### E-3. 审计报告状态回写 ⚠️ P2

**修复方案**：每关闭一个 A 类差距，同步更新 `docs/audit-report.md` 对应风险条目状态（部分修复 → 已修复/待验收）；R08 前完成全量回写。

---

## 六、执行顺序（依赖关系）

```
第 1 批（文档基线）      E-1 → 建立收尾 PR/issue 入口（R00）
第 2 批（A1 全部）      A1-1 ~ A1-8          ← R01 代码收口
第 3 批（A2 全部）      A2-1 ~ A2-10         ← R02 代码部分
第 4 批（A3 全部）      A3-1 ~ A3-6          ← R05 代码部分（A3-1 优先，R08 依赖它）
第 5 批（A4 全部）      A4-1 → A4-2 → A4-3 → A4-4 ~ A4-8   ← R07（基建先行）
第 6 批（A5 全部）      A5-2 → A5-1/A5-3 → A5-4            ← R06（清单先行）
第 7 批（D 类真机）     D-1/D-2 ‖ D-3 ‖ D-4/D-5（并行）；D-6 依赖 A5-3
第 8 批（R08）          全量回归 + RC dry-run（依赖 A3-1）+ 审计报告核对
第 9 批（R09/R10）      切换 2.0.0 Release PR → 人工批准发布
```

**每批完成后的验证命令**（任一失败立即停止）：

```bash
pnpm run lint:fe
pnpm run test:critical
pnpm run test:fe
pnpm run test:be
pnpm run clippy:be
```

---

## 七、发布完成定义（Definition of Done）

以下全部满足才可执行 R09 切版本：

- [ ] A1–A5 全部代码差距关闭，验证链全绿
- [ ] A4-1 e2e + A4-2 axe 进入 package.json 与 CI（ROADMAP R07 硬性条件）
- [ ] D-1 ~ D-7 真机证据齐全并归档到收尾 PR/issue 与 CI artifact
- [ ] A3-1 RC dry-run 实际跑通一次：三目标产物 + minisign 验证 + 无 Release 副作用
- [ ] E-1/E-2/E-3 文档同步完成；`pnpm run check:docs` 通过
- [ ] `docs/audit-report.md` 无未闭环的「强制」级风险
- [ ] 全局停止条件零触发：无数据损坏、无凭据泄露、无跨账号污染、无错误删除、无 fail-open、签名链完整、产物齐全、版本一致
- [ ] 本文件（GAP-TO-2.0.md）删除，状态回归 ROADMAP.md 单一真理源

> 之后按 ROADMAP R09（release-please 生成 Release PR，五处版本同步 2.0.0）→ R10（发布负责人人工批准）执行。AI 在 R10 必须停止并请求批准。
