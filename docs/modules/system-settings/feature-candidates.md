# Bench 后续待选功能库

> 已规划好技术方案，后续按需挑选实现，不用重新考虑。  
> **选品与发布节奏见 [roadmap/release-themes.md](../../roadmap/release-themes.md)** — 勿与本文件平行维护两套优先级。  
> 日期：2026-06-26（选品规则更新：2026-07-01）

---

## 选品规则

| 档位 | 标准 | 示例 |
|------|------|------|
| **v1.17 已选** | 开发者刚需 + 纯 defaults + 与 System Settings 现有区块一致 | C 键盘、B Dock、Q 隐藏桌面 |
| **候选池** | 中复杂度、与「开发者工作台」一致 | G 维护、H 迷你监控、N 剪贴板 |
| **不做 / v1.20+** | OnlySwitch 长尾、私有 API、与主定位无关 | R 播放器、T 白噪音、W TOTP、X AI Agent |

实现前：在 [roadmap.md](./roadmap.md) 增加对应 checkbox，并在 [release-themes](../../roadmap/release-themes.md) 打勾。

---

## A. Finder 设置（剩余）

| 开关 | 默认 | 命令 | 说明 |
|------|------|------|------|
| 搜索当前文件夹 | OFF | `defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"` | 搜索不跳全局 |
| 新窗口默认列表视图 | 图标 | `defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"` | 列表更高效 |

---

## B. Dock 设置（剩余）

| 开关 | 默认 | 命令 | 说明 |
|------|------|------|------|
| 自动隐藏 Dock | OFF | `defaults write com.apple.dock autohide -bool true` | 更多屏幕空间 |
| Dock 图标大小 | 48 | `defaults write com.apple.dock tilesize -int {size}` | 滑块调节 |
| 放大效果 | OFF | `defaults write com.apple.dock magnification -bool true` | 悬停放大 |
| 最小化动画 | 妙想 | `defaults write com.apple.dock mineffect -string "scale"` | scale 更快 |
| 显示最近应用 | ON | `defaults write com.apple.dock show-recents -bool false` | 减少干扰 |

---

## C. 键盘与输入（剩余）

| 开关 | 默认 | 命令 | 说明 |
|------|------|------|------|
| 按键重复速率 | 慢 | `defaults write NSGlobalDomain KeyRepeat -int {0-120}` | 最快=0 |
| 按键重复延迟 | 长 | `defaults write NSGlobalDomain InitialKeyRepeat -int {15-120}` | 最短=15 |
| 关闭自动纠正 | ON | `defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false` | 代码必备 |
| 关闭智能引号 | ON | `defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false` | 避免 `""` |
| 关闭破折号替换 | ON | `defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false` | 避免 `-- → —` |
| 关闭自动大写 | ON | `defaults write NSGlobalDomain NSAutomaticCapitalizationEnabled -bool false` | 代码场景 |

---

## D. 触控板

| 开关 | 默认 | 命令 | 说明 |
|------|------|------|------|
| 轻点=点击 | OFF | `defaults write com.apple.AppleMultitouchTrackpad Clicking -bool true` | 省力 |
| 三指拖移 | OFF | `defaults write com.apple.AppleMultitouchTrackpad TrackpadThreeFingerDrag -bool true` | 拖拽方便 |
| 跟踪速度 | 中 | `defaults write NSGlobalDomain com.apple.trackpad.scaling -float {0.5-3.0}` | 滑块调节 |
| 自然滚动 | ON | `defaults write NSGlobalDomain com.apple.swipescrolldirection -bool false` | 传统滚动 |

---

## E. 显示与外观（剩余）

| 开关 | 默认 | 命令 | 说明 |
|------|------|------|------|
| 降低透明度 | OFF | `defaults write com.apple.universalaccess reduceTransparency -bool true` | 性能+可读性 |
| 减弱动态效果 | OFF | `defaults write com.apple.universalaccess reduceMotion -bool true` | 加速切换 |
| 菜单栏图标大小 | 24 | `defaults write NSGlobalDomain StatusBarItemsWidthIcon -float {16-40}` | 状态栏图标 |

---

## F. Mission Control

| 开关 | 默认 | 命令 | 说明 |
|------|------|------|------|
| 独立空间 | ON | `defaults write com.apple.spaces spans-displays -bool false` | 每显示器独立 |
| 禁用热角 | 开 | `defaults write com.apple.dock wvous-{tl/tr/bl/br}-corner -int 0` | 防误触 |
| 加速动画 | ON | `defaults write com.apple.dock expose-animation-duration -float 0.1` | 0.1 秒 |

---

## G. 更多维护工具

| 操作 | 命令 | 说明 |
|------|------|------|
| 清除最近项目 | `defaults delete com.apple.recentitems` | 清理最近打开记录 |
| 清除字体缓存 | `sudo atsutil databases -remove` | 字体显示异常时用 |
| 清除 RAM | `sudo purge` | 释放内存，解决卡顿 |
| 清除 swap | `sudo swapoff -a && sudo swapon -a` | 清除交换文件 |

---

## H. 系统信息与监控

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| CPU/内存实时占用 | 类似 Activity Monitor 的迷你面板 | `sysinfo` crate 读取 |
| 电池健康度 | 循环次数、最大容量百分比 | `ioreg -r -c AppleSmartBattery` |
| 存储空间分析 | 可视化各目录占用大小 | `du` + 进度条 |
| 进程列表 | 按 CPU/内存排序，一键 kill | `sysinfo` crate |
| 网络接口信息 | IP 地址、MAC 地址、网速 | `ifconfig` / `ipconfig` |
| 系统启动时间 | 上次开机至今的时长 | `sysctl kern.boottime` |

---

## I. 音频设备

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 输出设备切换 | 切换扬声器/耳机/蓝牙音箱 | `SwitchAudioSource` CLI 或 CoreAudio API |
| 输入设备切换 | 切换内置麦克风/外接麦克风 | 同上 |
| 输入音量调节 | 调节麦克风增益 | `osascript` 或 CoreAudio |
| 系统音效开关 | 关闭/开启提示音 | `defaults write NSGlobalDomain com.apple.sound.uiaudioenabled -int 0` |
| 菜单栏音量图标 | 显示/隐藏 | `defaults write com.apple.menuextra Volume -bool false` |

---

## J. 蓝牙

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 蓝牙开关 | 开启/关闭蓝牙 | `blueutil --power 0/1` 或 `defaults` |
| 已连接设备 | 列出已配对设备 | `system_profiler SPBluetoothDataType` |
| 蓝牙重置 | 重置蓝牙模块 | `sudo pkill bluetoothd` |

---

## K. 显示器

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| Night Shift 开关 | 夜间护眼模式 | `blueutil` 或 `pmset` |
| True Tone 开关 | 原彩显示 | `defaults read/com.apple.CoreDisplay` |
| 分辨率切换 | 快速切换外接显示器分辨率 | `displayplacer` CLI |
| 外接显示器排列 | 拖拽排列多显示器位置 | `displayplacer` CLI |
| 颜色配置文件 | 切换色彩空间 | `defaults read/com.apple.windowserver` |
| ProMotion 切换 | 60Hz/120Hz 刷新率 | `displayplacer`（需支持） |

---

## L. 菜单栏（剩余）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 菜单栏自动隐藏 | 全屏时自动隐藏菜单栏 | `defaults write NSGlobalDomain AppleMenuBarVisibleInFullScreen -bool false` |
| 时钟显示日期 | 菜单栏时钟显示完整日期 | `defaults write com.apple.menuextra.clock DateFormat -string "EEE MMM d HH:mm:ss"` |
| 滚动条行为 | 始终显示 / 自动显示 / 隐藏 | `defaults write NSGlobalDomain AppleShowScrollBars -string "Always"` |

---

## M. 文件操作

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 安全删除文件 | 用 0 覆盖后删除 | `srm` 或 `dd if=/dev/zero of=文件` 后 rm |
| 计算文件夹大小 | 快速统计目录占用 | `du -sh` |
| 文件哈希计算 | MD5/SHA1/SHA256 | `shasum -a 256 文件` |
| 批量重命名 | 正则替换文件名 | Rust `std::fs` + 正则 |
| 查找大文件 | 找出目录下最大的 N 个文件 | `find . -type f -exec du -h {} + \| sort -rh \| head -20` |

---

## N. 剪贴板增强

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 剪贴板历史 | 保存最近 N 条复制内容 | 持续监听 `pbpaste` + 本地存储 |
| 固定常用片段 | 收藏代码片段/命令 | 本地 JSON 存储 |
| 图片剪贴板 | 支持复制图片预览 | `NSPasteboard` 读取图片数据 |
| 纯文本粘贴 | 粘贴时去除富文本格式 | 写入前用 `textutil` 转纯文本 |

---

## O. Xcode / 开发环境

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| Xcode 路径 | 快速打开 Xcode.app | `mdfind "kMDItemCFBundleIdentifier == com.apple.dt.Xcode"` |
| 模拟器列表 | 列出已安装的 iOS 模拟器 | `xcrun simctl list devices` |
| 模拟器截屏 | 对模拟器截屏 | `xcrun simctl io booted screenshot` |
| Derived Data 清理 | 清除 Xcode 缓存的编译产物 | `rm -rf ~/Library/Developer/Xcode/DerivedData/*` |
| iOS 设备日志 | 实时查看连接设备的日志 | `idevicesyslog`（libimobiledevice） |
| Provisioning Profile | 查看/管理描述文件 | `ls ~/Library/MobileDevice/Provisioning\ Profiles/` |

---

## P. 外接设备

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 外接显示器管理 | 列出所有连接的显示器 | `system_profiler SPDisplaysDataType` |
| 外接硬盘管理 | 列出挂载的外部存储 | `diskutil list` + `mount` |
| USB 设备列表 | 列出所有 USB 设备 | `system_profiler SPUSBDataType` |
| 安全弹出硬盘 | 一键安全弹出 | `diskutil unmountDisk` |

---

## Q. 桌面与壁纸（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 隐藏桌面图标 | 一键隐藏/显示桌面上所有文件和文件夹 | `defaults write com.apple.finder CreateDesktop -bool false && killall Finder` |
| 隐藏桌面 Widget | 隐藏 Sonoma 桌面小组件 | `defaults write com.apple.WindowManager StandardHideWidgets -bool true` |
| 桌面便签（Top Sticker） | 在桌面置顶显示便签/文本 | NSPanel 置顶窗口 + `defaults` 保存内容 |
| Stage Manager 开关 | 快速开启/关闭台前调度 | `defaults write com.apple.WindowManager GloballyEnabled -bool true/false` |

---

## R. 播放器与媒体（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| Apple Music 控制 | 播放/暂停/上下曲 | `osascript -e 'tell application "Music" to playpause'` |
| Spotify 控制 | 播放/暂停/上下曲 | `osascript -e 'tell application "Spotify" to playpause'` |
| 系统静音 | 一键静音/取消静音 | `osascript -e 'set volume output muted not (output muted of (get volume settings))'` |
| 麦克风静音 | 一键静音/取消麦克风 | `osascript -e 'set volume input volume 0'` 或 CoreAudio API |
| 电台播放器 | 播放在线电台流（m3u/aac） | `AVPlayer` 或 `ffmpeg` 流播放 |

---

## S. 屏幕与显示工具（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 隐藏刘海（Notch） | M1 Pro/Max MacBook Pro 隐藏屏幕刘海 | 动态壁纸处理，刘海区域填充黑色 |
| 屏幕测试 | 全屏纯色显示（黑/白/红/绿/蓝），检测坏点 | NSWindow 全屏 + 纯色背景 |
| 屏幕清洁模式 | 全屏显示纯色以便发现屏幕污渍 | 同上 |
| 降低屏幕亮度 | 快速调低屏幕亮度 | `brightness` CLI 或 CoreDisplay API |
| True Tone 开关 | 原彩显示快速开关 | `defaults read/write com.apple.CoreDisplay` |

---

## T. 定时器与效率工具（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 番茄钟计时器 | 25 分钟工作 + 5 分钟休息的循环计时器 | `Timer` + 通知中心提醒 |
| 后台白噪音 | 播放雨声/海浪/咖啡厅等环境音 | `AVPlayer` + 音频流 |
| 菜单栏时钟增强 | 菜单栏显示秒、日期、星期 | `defaults write com.apple.menuextra.clock ShowSeconds -bool true` |

---

## U. 隐藏与整理（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| 隐藏菜单栏图标 | 折叠隐藏指定的菜单栏图标（类似 Hidden/Dozer） | `NSStatusItem` 隐藏或 BarTidy 方式 |
| 自动隐藏菜单栏 | 全屏时自动隐藏菜单栏 | `defaults write NSGlobalDomain AppleMenuBarVisibleInFullScreen -bool false` |
| 显示 Launchpad 小图标 | 缩小 Launchpad 图标大小 | `defaults write com.apple.dock springboard-show-duration -int 1` |
| 显示 Dock 最近应用 | 显示/隐藏 Dock 中的最近使用应用 | `defaults write com.apple.dock show-recents -bool false` |
| 弹出所有光盘 | 一键弹出所有挂载的光盘/DMG | `diskutil eject /Volumes/*` |

---

## V. AirPods 与蓝牙设备（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| AirPods 电量显示 | 显示 AirPods 和充电盒的电量 | `system_profiler SPBluetoothDataType` + `ioreg` |
| AirPods 快速连接 | 一键切换音频输出到 AirPods | `SwitchAudioSource` CLI |
| AirPods 降噪切换 | 切换主动降噪/通透模式 | 私有 API 或 Bluetooth HCI 命令 |

---

## W. 认证器与安全（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| TOTP 认证器 | 生成两步验证 TOTP 码（类似 Google Authenticator） | HMAC-SHA1 算法 + Base32 解码 |
| 密码管理 | 安全存储和自动填充密码 | macOS Keychain API |

---

## X. Only Agent — AI 自然语言控制（参考 OnlySwitch）

| 功能 | 说明 | 实现方式 |
|------|------|---------|
| AI 自然语言控制 | 用自然语言描述需求，AI 生成并执行 AppleScript | OpenAI/Ollama API + `osascript` |
| 智能场景联动 | 根据时间/位置自动切换设置组合 | 定时器 + GPS + 条件判断 |

---

## 速查表：按复杂度分类

### 低复杂度（纯 defaults 开关，可批量做）

A. Finder 剩余 · B. Dock 剩余 · C. 键盘剩余 · D. 触控板 · E. 显示剩余 · F. Mission Control · L. 菜单栏剩余 · Q. 桌面壁纸 · T. 定时器 · U. 隐藏整理

### 中复杂度（需要 shell 命令或系统 API）

G. 维护工具 · H. 系统监控 · I. 音频设备 · J. 蓝牙 · K. 显示器 · M. 文件操作 · N. 剪贴板增强 · O. Xcode 开发 · P. 外接设备 · R. 播放器媒体 · S. 屏幕工具 · V. AirPods

### 高复杂度（需要私有 API 或复杂集成）

W. 认证器安全 · X. AI 自然语言控制

---

## Y. 系统设置跳转增强（体验优化）

| 功能 | 说明 | 实现方式 | 复杂度 |
|------|------|---------|--------|
| 精确定位到设置项 | 点击跳转时不仅打开对应面板，还自动滚动/高亮到具体设置项 | AppleScript UI Scripting + 可访问性 API | 高 |
| 设置项高亮闪烁 | 跳转后对目标设置项做闪烁/高亮动画，引导用户注意力 | 同上，UI 元素属性操作 | 高 |

**技术方案说明：**

当前 `open_system_pane` 使用 AppleScript `reveal pane id` 只能打开到整个设置面板（如"桌面与程序坞"），无法精确定位到面板内的具体开关。

**可选实现路径：**

1. **UI Scripting 方案**
   - 通过可访问性 API 遍历 System Settings 的 UI 元素树
   - 找到目标设置项对应的 UI 元素
   - 执行 `AXScrollToVisible` 滚动到可视区域
   - 可选：通过设置 `AXHighlighted` 或临时改变背景色实现闪烁效果
   - 缺点：需要用户授权辅助功能权限；不同 macOS 版本 UI 结构可能变化

2. **Anchor 锚点方案**
   - 研究 System Settings 是否支持 `reveal anchor "xxx"` 语法
   - 收集各设置项对应的 anchor ID
   - 缺点：并非所有设置项都有公开的 anchor，覆盖面有限

3. **降级方案**
   - 对无法精确定位的设置项，保持现有"打开整个面板"的行为
   - 在 UI 上明确哪些支持精确定位、哪些只支持到面板级
