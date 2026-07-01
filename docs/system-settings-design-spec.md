# 系统设置模块设计规范

> 版本: 1.6.0  
> 日期: 2026-06-28  
> 适用范围: `src-tauri/src/system_settings/*` 与 `src/features/system-settings/*`  
> 状态: 评审基线

---

## 1. 引言

### 1.1 目的
本规范定义系统设置模块在**隐私保护、授权机制、用户便利性、系统兼容性**四个维度上的设计标准与约束条件，作为功能开发、代码评审与回归审计的统一依据。

### 1.2 模块职责
系统设置模块负责通过 Tauri 命令桥接 macOS 系统偏好设置（`defaults`、`osascript`、`pmset`、`tccutil` 等），向用户提供 Finder / Dock / 键盘 / 显示 / 网络 / 截图 / 隐私 / 登录项 / 开发工具 / 系统开关等只读与读写操作。

### 1.3 术语
| 术语 | 含义 |
|------|------|
| TCC | Transparency, Consent, and Control，macOS 隐私权限框架 |
| defaults | macOS 用户偏好持久化键值库 |
| sudo_cmd | 通过 `osascript` 弹出 GUI 授权提示执行需管理员权限的命令 |
| applying | 模块级互斥状态，表示正在执行某项系统变更 |

---

## 2. 核心规范细则

### 2.1 隐私保护规范

| 编号 | 规则 | 级别 |
|------|------|------|
| P-1 | **禁止主动外发用户数据**。所有网络诊断命令（ping/dig/traceroute/端口扫描）的目标地址由用户显式输入；不得在未告知的情况下调用第三方接口获取用户信息。 | 必须 |
| P-2 | **外部 IP 查询须显式同意**。如需获取公网 IP，必须 (a) 使用本地可推导方式优先，(b) 或在调用第三方接口前由前端弹窗确认。 | 必须 |
| P-3 | **敏感信息读取需说明用途**。读取 SSID、TCC 权限表、登录项等敏感数据时，后端命令不得额外记录或回传无关字段。 | 必须 |
| P-4 | **TCC.db 访问失败须可识别**。当应用缺少「完全磁盘访问」权限导致 `sqlite3 TCC.db` 失败时，必须返回明确的错误信息而非空列表，避免用户误判当前权限状态。 | 必须 |
| P-5 | **不持久化用户敏感数据**。模块仅读写系统 defaults 与系统 API，不得自建数据库存储用户隐私。 | 必须 |

### 2.2 授权机制设计

| 编号 | 规则 | 级别 |
|------|------|------|
| A-1 | **输入白名单校验**。所有接受字符串参数的命令须对入参做白名单或格式校验，防止 flag 注入与越权操作。 | 必须 |
| A-2 | **写操作与读操作校验对齐**。若读命令对某参数有白名单（如 `get_tcc_permissions` 校验 `service`），对应的写/重置命令必须同样校验。 | 必须 |
| A-3 | **sudo 操作须经 GUI 授权**。所有需管理员权限的操作必须通过 `sudo_cmd`（osascript GUI 弹窗）执行，不得静默调用 `sudo`。 | 必须 |
| A-4 | **路径校验**。接受文件系统路径的命令须过滤 shell 元字符（`; \| & $ \` ( ) < >` 换行等），并对路径做 `shell_escape`。 | 必须 |
| A-5 | **AppleScript 注入防护**。所有拼接 AppleScript 的字符串须经 `escape_applescript` 转义。 | 必须 |
| A-6 | **权限分级**。命令分三级：无权限（defaults 读）、用户权限（defaults 写 + osascript）、管理员权限（sudo_cmd）。每条命令须明确所属级别。 | 建议 |

### 2.3 便利性设计原则

| 编号 | 规则 | 级别 |
|------|------|------|
| C-1 | **统一 applying 管理**。所有设置变更须经 `useSettingAction` 包装，执行期间设置 `applying=true` 阻塞并发操作，并通过 toast 提供 loading/success/error 反馈。 | 必须 |
| C-2 | **设置后即时回读**。对存在「系统实际状态可能与请求值不一致」的设置（如 Ventura+ 电池百分比），写入后须调用 `refresh()` 重新读取真实状态。 | 必须 |
| C-3 | **窗口聚焦自动刷新**。各 Section 须监听 `onFocusChanged`，在窗口重新聚焦时重新读取系统状态，与外部应用（如 OnlySwitch）保持同步。 | 必须 |
| C-4 | **加载态可视化**。Switch 组件在 `loading` 时须显示旋转图标（`Loader2Icon animate-spin`），并设置 `aria-busy` 与 `cursor-progress`。 | 必须 |
| C-5 | **危险操作二次确认**。重启、关机、清空废纸篓、移除登录项、释放端口、删除术语等不可逆操作须经 `DestructiveConfirmDialog` 二次确认，并展示后果说明（callout）；禁止裸 `window.confirm()` 或直接执行。 | 必须 |
| C-6 | **defaults 写入须用正确类型**。布尔值须用 `-bool`、整数须用 `-int`、字符串用 `-string`；错误类型会导致系统忽略写入（即「功能失效」）。 | 必须 |

### 2.4 系统兼容性要求

| 编号 | 规则 | 级别 |
|------|------|------|
| S-1 | **版本感知**。对行为随 macOS 版本变化的设置（如电池百分比在 Ventura 13+ 迁移到控制中心），须检测 `macos_major_version()` 并走对应分支。 | 必须 |
| S-2 | **菜单栏刷新双覆盖**。写入菜单栏相关 defaults 后须同时 `killall SystemUIServer`（旧版）与 `killall ControlCenter`（新版），覆盖各版本刷新机制。**macOS Tahoe+ 须额外 `killall WindowManager`**，Tahoe 上菜单栏由 WindowManager 进程控制。 | 必须 |
| S-3 | **非 macOS 平台优雅降级**。所有平台相关命令在非 macOS 平台须返回明确错误信息，不得 panic。 | 必须 |
| S-4 | **命令拼接使用参数数组**。调用外部命令须使用 `Command::new(cmd).args([...])` 参数数组形式，禁止 `bash -c` 拼接（除非确实需要 shell 管道且已做转义）。 | 必须 |
| S-5 | **defaults 键读取容错**。读取 defaults 键时须处理键不存在的情况，返回合理默认值而非报错。 | 必须 |
| S-6 | **前端能力探测**。前端须通过 `canUseDesktopFeatures()` / `canUseTauriWindow()` 探测运行环境，在不可用时禁用相关 UI。 | 必须 |
| S-7 | **ByHost 域须用 -currentHost**。读/写 `~/Library/Preferences/ByHost/<domain>.<UUID>.plist` 时必须用 `defaults -currentHost`，普通 `defaults read/write` 读不到这些键。Tahoe+ 电池百分比即存储在 ByHost 域。 | 必须 |
| S-8 | **真实控制键须实证验证**。新增/变更 defaults 控制键时，必须通过 §7 排查方法论确认是「控制键」而非「状态记录键」或「应用写入的垃圾数据」，避免误用导致「开关已开但实际未生效」。 | 必须 |
| S-9 | **cfprefsd 时序：先杀后写**。`defaults write` 通过 cfprefsd 缓存写入。若先写入再 kill cfprefsd，cfprefsd 重启时可能丢弃未同步的写入。**必须先 kill cfprefsd 清除缓存（sleep 500ms），再执行 `defaults write`**。已实测验证：先杀后写 = 生效；先写后杀 = 不生效。 | 必须 |
| S-10 | **状态记录键 vs 控制键**。macOS Tahoe 上，某些 defaults 键（如菜单栏自动隐藏的 `AppleMenuBarVisibleInFullscreen`、`_HIHideMenuBar`）仅为**状态记录键**，`defaults write` 不触发系统行为变更。必须通过 **System Events AppleScript** 操控（与 System Settings 相同路径）。新增设置项时须区分「状态记录键」和「控制键」，违反此规则的功能会表现为「值已写入但行为不变」。 | 必须 |

---

## 3. 设计示例

### 3.1 合规：布尔 defaults 写入
```rust
// ✅ 正确：传 "true"/"false" 走 -bool 分支
let val = if show { "true" } else { "false" };
defaults_write("com.apple.menuextra.battery", "ShowPercent", val)?;
```

### 3.2 违规：字符串类型误用
```rust
// ❌ 错误："YES" 走 -string 分支，系统忽略
defaults_write("com.apple.menuextra.battery", "ShowPercent", "YES")?;
```

### 3.3 合规：输入白名单 + 读写对齐
```rust
const ALLOWED_SERVICES: &[&str] = &["kTCCServiceCamera", ...];
if !ALLOWED_SERVICES.contains(&service.as_str()) {
    return Err(format!("Invalid service: {}", service));
}
```

### 3.4 合规：版本感知 + 双刷新
```rust
restart_system_ui_server();   // 旧版
restart_controlcenter();      // 新版
if macos_major_version() >= 13 {
    // Ventura+ 兜底
}
```

### 3.5 合规：统一 applying 包装
```tsx
const { run } = useSettingAction();
onCheckedChange={async (v) => {
  await run(async () => {
    await systemSettingsUseCases.setXxx(v);
    store.setXxx(v);
  });
}}
```

---

## 4. 异常处理指南

| 场景 | 处理方式 |
|------|----------|
| defaults 键不存在 | 返回合理默认值（`defaults_read_bool` 返回 false，字符串返回空） |
| sudo 被用户取消 | 捕获 `-128` / `User canceled`，返回友好错误而非 panic |
| TCC.db 无读取权限 | 返回 `"Requires Full Disk Access"` 明确提示，不返回空列表 |
| 外部命令不存在 | 返回 `"<cmd>: <error>"` 格式错误 |
| 非 macOS 平台 | 返回 `"only supported on macOS"` |
| applying 期间重复触发 | `useSettingAction.run` 直接返回 undefined，静默忽略 |
| 网络诊断超时 | `curl --max-time 5`、`nc -w 3` 等设置超时，避免永久阻塞 |

---

## 5. 版本控制信息

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-06-28 | 初始基线：建立隐私/授权/便利/兼容四维规范 |
| 1.1.0 | 2026-06-28 | 新增 S-7/S-8 规则；沉淀 §7 排查方法论与 §8 已知 defaults 键位映射（Tahoe 电池百分比真实控制键等） |
| 1.2.0 | 2026-06-28 | §8.2 菜单栏自动隐藏：修正键值映射（实测验证），新增 `AutoHideMenuBarOption` UI 控制键，明确三键联动要求 |
| 1.3.0 | 2026-06-28 | §S-2 新增 Tahoe+ WindowManager 刷新要求；§8.2 补充 cfprefsd 时序要求 |
| 1.4.0 | 2026-06-28 | §8.2 重大修正：菜单栏自动隐藏必须用 System Events AppleScript 控制，`defaults write` 仅写状态记录键不触发行为变更；新增 S-10 规则 |
| 1.5.0 | 2026-06-28 | 新增 §8.3 低电量模式四态映射（pmset Battery/AC 分别控制）；前后端从 bool 改为四态枚举 |
| 1.6.0 | 2026-06-28 | 新增 §8.4 Gatekeeper 只读说明（SecurityPreferences 私有 API，无公开写入方式） |

---

## 6. 功能审计报告

> 对照本规范对当前代码库的审计结果。

### 6.1 不符合项清单

| 编号 | 规范条目 | 文件 | 问题描述 | 优先级 | 影响 |
|------|----------|------|----------|--------|------|
| NC-1 | C-6 | `system_toggles.rs:128` | `CreateDesktop` 写 "0"/"1" 走 `-string`，应为 `-bool` | 高 | 桌面图标隐藏可能失效 |
| NC-2 | C-6 | `system_toggles.rs:273` | `springboard-rows` 写 "6"/"5" 走 `-string`，应为 `-int` | 高 | Launchpad 小图标设置可能失效 |
| NC-3 | C-6 | `quick_actions.rs:21` | `askForPassword` 写 "1"/"0" 走 `-string`，应为 `-bool` | 高 | 锁屏密码开关可能失效 |
| NC-4 | C-6 | `quick_actions.rs:23,44` | `askForPasswordDelay` 写数字走 `-string`，应为 `-int` | 高 | 锁屏延迟设置可能失效 |
| NC-5 | C-6 | `helpers.rs:76` | `defaults_write` 缺少 `-int` 分支，所有数字入参被当作字符串 | 高 | 根因：影响上述 NC-1~4 |
| NC-6 | A-2 | `privacy.rs:40` | `reset_tcc_permission` 未校验 `service` 白名单，与 `get_tcc_permissions` 不一致 | 高 | 可重置任意 TCC 服务 |
| NC-7 | A-1 | `screenshot.rs:13` | `set_screenshot_format` 未校验 format 白名单 | 中 | 可写入非法格式值 |
| NC-8 | A-4 | `screenshot.rs:76` | `set_screenshot_save_location` 未校验路径 | 中 | 可写入任意路径 |
| NC-9 | A-1 | `network.rs:122,159,172,190` | ping/dig/nc/traceroute 的 host 未校验，可被解释为 flag | 中 | flag 注入风险 |
| NC-10 | P-1/P-2 | `network.rs:214` | `get_local_ip` 调用 `curl ifconfig.me` 泄露公网 IP 给第三方 | 高 | 隐私违规 |
| NC-11 | P-4 | `privacy.rs:18` | TCC.db 读取失败时返回空列表而非明确错误 | 中 | 用户误判权限状态 |

### 6.2 重构方案

**方案 A：修复 `defaults_write` 类型分发（根因修复，影响 NC-1~5）**
- 在 `helpers.rs` 的 `defaults_write` 增加 `-int` 分支：数字字符串走 `-int`
- 将 `system_toggles.rs` / `quick_actions.rs` 中布尔字段改为传 "true"/"false"
- 整数字段（`springboard-rows`、`askForPasswordDelay`）由 helper 自动走 `-int`

**方案 B：补齐输入校验（影响 NC-6~9）**
- `privacy.rs`：提取 `ALLOWED_SERVICES` 为共享常量，`reset_tcc_permission` 复用校验
- `screenshot.rs`：增加 format 白名单 `["png","jpg","bmp","pdf","tiff"]`、路径元字符过滤
- `network.rs`：提取 `validate_host` 校验 hostname/IP 格式，拒绝以 `-` 开头的输入

**方案 C：修复隐私泄露（影响 NC-10）**
- `get_local_ip`：默认仅返回本地 IP，公网 IP 改为独立命令 `get_external_ip` 并由前端显式触发 + 确认

**方案 D：TCC 错误可识别（影响 NC-11）**
- `get_tcc_permissions`：检测 sqlite3 退出码非零或 stderr 非空时返回明确错误

### 6.3 实施优先级

| 优先级 | 方案 | 理由 |
|--------|------|------|
| P0 | 方案 A | 同类根因，直接影响多个功能是否生效 |
| P0 | 方案 B (privacy) | 安全漏洞，可重置任意 TCC 服务 |
| P1 | 方案 C | 隐私违规，未经同意外发数据 |
| P1 | 方案 B (screenshot/network) | 输入校验加固 |
| P2 | 方案 D | 体验优化，避免误判 |

---

## 7. 排查方法论：diff 两次 defaults 快照定位真实控制键

> 当某个 macOS 设置的 defaults 控制键不明确（官方文档缺失或旧文档与新版系统行为不一致）时，采用本节流程科学定位真实控制键。
> 本方法在 macOS 26 (Tahoe) 电池百分比控制键排查中实战验证有效。

### 7.1 流程

1. **基线快照**：在当前状态下 dump 所有候选域的键值
   - 普通域：`defaults read <domain>`
   - ByHost 域：`defaults -currentHost read <domain>`（必须用 `-currentHost`，否则读不到）
   - 文件直读：`plutil -p ~/Library/Preferences/ByHost/<domain>.<UUID>.plist`

2. **切换状态**：用户手动在系统设置中切换目标开关（**不通过本应用**，避免应用写入干扰）

3. **二次快照**：dump 同样的域

4. **diff 对比**：`diff snapshot-baseline.txt snapshot-on.txt`，找出变化的键

5. **去伪存真**：对每个候选键执行以下三步验证
   - **去垃圾数据**：diff off vs on 无变化 → 是应用历史写入的垃圾键，系统不读取
   - **去状态记录键**：删除该键 + 重启相关进程 → 系统自动重新写入 → 是状态记录键，不是控制键
   - **实证写入**：用 `defaults write` 写入候选值 + 重启进程 → 用户确认 UI 生效 → 确认真实控制键

6. **必要时用 `find -newer <marker>` 辅助**：定位切换设置时被修改的文件，直接锁定 plist 路径，绕过候选域猜测（Tahoe 电池百分比即通过此步定位到 `ByHost/com.apple.controlcenter.<UUID>.plist`）

### 7.2 命令模板

```bash
# 创建快照目录与 marker
mkdir -p /tmp/prefs-dump && touch /tmp/prefs-marker

# 基线快照（在切换设置前）
{
  echo "=== NSGlobalDomain ==="
  defaults read NSGlobalDomain
  echo "=== com.apple.controlcenter ==="
  defaults read com.apple.controlcenter
  echo "=== ByHost com.apple.controlcenter ==="
  defaults -currentHost read com.apple.controlcenter
  echo "=== com.apple.menuextra.battery ==="
  defaults read com.apple.menuextra.battery
} > /tmp/prefs-dump/snapshot-baseline.txt

# 用户手动切换设置...

# 二次快照（切换后）
{ ...同上... } > /tmp/prefs-dump/snapshot-on.txt

# diff
diff /tmp/prefs-dump/snapshot-baseline.txt /tmp/prefs-dump/snapshot-on.txt

# 用 find 定位被修改的 plist（绕过候选域猜测）
find ~/Library/Preferences -newer /tmp/prefs-marker -type f
```

### 7.3 排查陷阱

| 陷阱 | 现象 | 识别方法 |
|------|------|----------|
| **应用写入的垃圾数据** | 候选键在 baseline 中已有值，但 diff off vs on 无变化 | diff 验证无变化，删除后系统行为不变 |
| **状态记录键（非控制键）** | 候选键在 on/off 状态值不同，但删除 + 重启进程后被系统自动重新写入 | 删除键 + 重启进程，系统重新写入 → 状态记录键。`NSStatusItem VisibleCC Battery` 即此类 |
| **cfprefsd 缓存与文件不一致** | `plutil -p` 读到的值与 `defaults read` 读到的值不同 | 两者对比差异 → cfprefsd 缓存未同步，以 `defaults read` 为准（内存值） |
| **ByHost 域必须用 -currentHost** | 普通 `defaults read com.apple.controlcenter` 读不到 ByHost 域的键 | 域名前缀 `~/Library/Preferences/ByHost/` → 必须 `defaults -currentHost` |
| **多 API 变化只改一处** | diff 发现多个键变化，误改其中一个不生效 | diff 输出多个候选时逐个验证；优先用 `find -newer` 锁定单一文件 |

### 7.4 排查案例：Tahoe 电池百分比

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1. 基线 | dump NSGlobalDomain / controlcenter / menuextra.battery | 发现 `BatteryShowPercent=1`、`BatteryShowPercentage=1`、`ShowPercent=1` 三个候选 |
| 2. diff baseline vs off | 用户手动隐藏 | 三个候选键**无任何变化** → 垃圾数据 |
| 3. diff off vs on | 用户手动显示 | 新增 `NSStatusItem VisibleCC Battery=1`、`NSStatusItem Preferred Position Battery=257` |
| 4. 误改 VisibleCC Battery | 写入/删除该键 + killall ControlCenter | UI 不生效 |
| 5. 删除两个键 + 重启 | 验证是否控制键 | ControlCenter 重启后**自动重新写入** `VisibleCC Battery=1` → 状态记录键 |
| 6. `find -newer` | 定位切换时被修改的文件 | 发现 `~/Library/Preferences/ByHost/com.apple.controlcenter.<UUID>.plist` 之前不存在，切换后出现 |
| 7. `defaults -currentHost read` | 读 ByHost 域 | `Battery` 键从 8(off)→ 2(on) 变化，`BatteryShowPercentage` 保持 1 不变 |
| 8. 实证写入 | `defaults -currentHost write com.apple.controlcenter Battery -int 8` + `killall ControlCenter` | UI 立即隐藏 ✓ |

---

## 8. 已知 defaults 键位映射

> 本节沉淀实测确认的 defaults 控制键，作为后续开发与排查参考。所有条目均经过「实证写入 → UI 生效」验证。

### 8.1 电池百分比显示

| macOS 版本 | 域 | 键 | 类型 | 值 | 刷新命令 |
|------------|----|----|------|-----|----------|
| macOS 26 (Tahoe)+ | `ByHost/com.apple.controlcenter` | `Battery` | int | `2` = 显示 / `8` = 隐藏 | `killall ControlCenter` |
| macOS 25 及更早 | `com.apple.menuextra.battery` | `ShowPercent` | bool | `true` / `false` | `killall SystemUIServer` + `killall ControlCenter` |
| macOS 13 (Ventura)+ 备选 | `com.apple.controlcenter` | `BatteryShowPercentage` | bool | `true` / `false` | `killall ControlCenter` |

**Tahoe+ 实现要点**：
- 必须 `defaults -currentHost write com.apple.controlcenter Battery -int <2|8>`，普通 `defaults write` 无效（违反 S-7）
- 写入后 `killall ControlCenter` 立即生效
- 实现见 [display.rs](file:///Users/apple/Documents/github/tauri-app/src-tauri/src/system_settings/display.rs) 与 [helpers.rs](file:///Users/apple/Documents/github/tauri-app/src-tauri/src/system_settings/helpers.rs) 的 `defaults_read_current_host` / `defaults_write_current_host`

**Tahoe 上已确认的无效键**（系统不读取，旧版本应用曾误写，造成「开关已开但实际未生效」的误导）：
- `NSGlobalDomain BatteryShowPercent`
- `com.apple.controlcenter BatteryShowPercentage`
- `com.apple.menuextra.battery ShowPercent`
- `com.apple.controlcenter "NSStatusItem VisibleCC Battery"` —— **状态记录键**，ControlCenter 重启时根据真实控制源重新写入，不是控制键
- `com.apple.controlcenter "NSStatusItem Preferred Position Battery"` —— 仅记录菜单栏图标位置

### 8.2 菜单栏自动隐藏（四态）

> 实测验证日期: 2026-06-28, macOS 26 (Tahoe)。通过 diff 四次状态切换确认。

| 状态 | `AppleMenuBarVisibleInFullscreen` (NSGlobalDomain) | `_HIHideMenuBar` (NSGlobalDomain) | `AutoHideMenuBarOption` (com.apple.controlcenter) |
|------|------------------------------------------------------|------------------------------------|---------------------------------------------------|
| Never (永不) | `1` | `0` | `3` |
| In Full Screen Only (仅全屏时) | `0` | `0` | `2` |
| On Desktop Only (仅桌面时) | `1` | `1` | `1` |
| Always (始终) | `0` | `1` | `0` |

**三键职责分工**：
- `AppleMenuBarVisibleInFullscreen` + `_HIHideMenuBar`：**状态记录键**（非控制键）。Tahoe 上仅记录系统状态，`defaults write` 不触发行为变更
- `AutoHideMenuBarOption`：控制**系统设置 UI 下拉框显示**（UI 键），纯递减序列 `3→2→1→0`
- `com.apple.dock autohide-menubar`：四态下恒为 `0`，**非控制键**（旧实现曾误用此键）

**实现方式（必须用 System Events）**：
macOS Tahoe 上，`defaults write` 写入的值只是状态记录键，**不会触发系统行为变更**。`killall WindowManager/SystemUIServer/ControlCenter` 也不会使其重新加载。

**唯一有效方式**：通过 **System Events AppleScript** 控制，与 System Settings 使用相同的系统路径：
```applescript
tell application "System Events"
    tell dock preferences to set autohide menu bar to true  -- 隐藏菜单栏
end tell
```

参考：[OnlySwitch](https://github.com/jacklandrin/OnlySwitch) 的 `AutoHideMenuBarCMD` 实现。OnlySwitch 同样使用 System Events 而非 `defaults write`。

**注意**：此方案需要 TCC **Automation 权限**（System Events）。

**写入后同步 UI 键**：通过 System Events 切换后，还需 `defaults write com.apple.controlcenter AutoHideMenuBarOption -int <n>` 同步 UI 键，确保系统设置下拉框显示正确。

刷新（兜底）：`killall SystemUIServer`（旧版）+ `killall ControlCenter`（新版）+ `killall WindowManager`（Tahoe+）。

### 8.3 低电量模式（四态）

> 实测验证日期: 2026-06-28, macOS 26 (Tahoe)。通过 pmset 分别设置 Battery/AC 验证。

macOS Tahoe 上低电量模式从二态（开/关）扩展为**四态**，通过 `pmset` 的 Battery (`-b`) 和 AC (`-c`) 分别控制：

| 选项 | `pmset -b lowpowermode` | `pmset -c lowpowermode` | 等效 `pmset -a` |
|------|-------------------------|-------------------------|-----------------|
| 永不 (Never) | `0` | `0` | `pmset -a lowpowermode 0` |
| 始终 (Always) | `1` | `1` | `pmset -a lowpowermode 1` |
| 仅使用电池时 (On Battery Only) | `1` | `0` | 不适用（需分别设置） |
| 仅适用电源适配器时 (On AC Power Only) | `0` | `1` | 不适用（需分别设置） |

**实现要点**：
- 读取：`pmset -g custom` 解析 Battery Power 和 AC Power 段的 `lowpowermode` 值
- 写入：需 **sudo 权限**（通过 `sudo_cmd` / osascript `with administrator privileges`）
- "仅使用电池时"和"仅适用电源适配器时"不能用 `pmset -a`，必须分别用 `pmset -b` 和 `pmset -c` 设置
- `lowpowermode=2` 返回 "HighPowerMode not supported on Battery Power"，`lowpowermode=3` 返回 "Unsupported mode 3"——确认只有 0/1 两个有效值，四态通过 Battery/AC 分别设置实现

### 8.4 Gatekeeper（允许以下来源的应用程序）

> 排查日期: 2026-06-28, macOS 26 (Tahoe)。

macOS 隐私与安全性中的"允许以下来源的应用程序"控制 Gatekeeper 行为。Tahoe 上只有两个选项：
- **App Store** — 仅允许 App Store 应用
- **App Store 和已识别的开发者** — 允许 App Store + 已公证的开发者应用（默认）

**读取**：`spctl -v --status` → 解析 `developer id enabled` / `developer id disabled`

**写入**：**无法从命令行控制**。实测验证：
- `spctl --disable-status` → "The option to globally disable the assessment system is currently not available in System Settings"
- `spctl --global-disable` → 同上
- `spctl --global-enable` → 无效果
- `defaults write` 各种键 → 域不存在或无效果
- `csrutil` → 只控制 SIP，不控制 Gatekeeper

**根因**：System Settings 通过私有 `SecurityPreferences` 框架控制此设置（`spctl` 使用 `Security.framework` + `StorageKit.framework` 私有 API）。Apple 不提供公开 API，这是安全设计——防止恶意软件绕过 Gatekeeper。

**结论**：此设置为**只读**显示当前状态，无法从第三方工具控制。后续如 Apple 提供公开 API 可升级为可写。

### 8.5 键位映射维护规则

新增设置项时，须在此表追加条目并附实证验证记录（排查步骤或测试命令）。违反 S-8 的键不得入库。
