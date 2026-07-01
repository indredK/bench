# Changelog

## [1.15.2](https://github.com/indredK/bench/compare/v1.15.1...v1.15.2) (2026-07-01)


### Bug Fixes

* **account-manager:** 修复store使用方式，遵循zustand编码规范 ([27aa88c](https://github.com/indredK/bench/commit/27aa88c27966fab2a82508c38c9240c92fb1f824))

## [1.15.1](https://github.com/indredK/bench/compare/v1.15.0...v1.15.1) (2026-07-01)


### Bug Fixes

* **quick-launch:** i18n 硬编码修复 — formatLastModified 改用 t() 翻译 ([df7dd5a](https://github.com/indredK/bench/commit/df7dd5a403d4b054b723eefe2ad1c0382b6a4481))
* **system-settings:** 移除未使用的 SystemTogglesSection 组件 ([5dd1740](https://github.com/indredK/bench/commit/5dd17403edcc6f2d90e4597587d25ea39391722f))

## [1.15.0](https://github.com/indredK/bench/compare/v1.14.1...v1.15.0) (2026-07-01)


### Features

* **api-billing:** 实现完整 Session Manager 功能模块 ([3ed388e](https://github.com/indredK/bench/commit/3ed388e856eae49a5dc2b45fef95398e8fbc77c4))
* **api-billing:** 新增API账单管理模块完整功能 ([5850bc5](https://github.com/indredK/bench/commit/5850bc55a46eb456ad7ae0ddf5d632fa15135730))
* 实现外部登录代理功能，支持通过 bench-auth:// 协议接入外部应用 ([f2300cf](https://github.com/indredK/bench/commit/f2300cfe67fb6cc37844dfc38dedddcd2db7cf27))
* 新增系统托盘、端口/术语/系统设置二次确认弹窗，添加汇率计算功能 ([15b2d72](https://github.com/indredK/bench/commit/15b2d725e7e2ee0d80d2a7dd50faa4b745b26581))

## [1.14.1](https://github.com/indredK/bench/compare/v1.14.0...v1.14.1) (2026-06-30)


### Bug Fixes

* **updater:** 完善更新弹窗功能与文案 ([c4d6b15](https://github.com/indredK/bench/commit/c4d6b15f920b9e519fc50d3f468ea3414bc961a7))

## [1.14.0](https://github.com/indredK/bench/compare/v1.13.0...v1.14.0) (2026-06-29)


### Features

* add quick launch feature and system pane shortcuts ([84b76c6](https://github.com/indredK/bench/commit/84b76c66957f4723fb3bbc538fe0bfa050521617))
* **app-manager:** 实现多标签页独立的搜索和过滤状态 ([f86e1ef](https://github.com/indredK/bench/commit/f86e1ef1ca58936a05c180c3e357ec4a01e82581))
* **dev-cleaner:** 添加自定义清理功能 ([8c18ef7](https://github.com/indredK/bench/commit/8c18ef75d1499c084dd45fec9a4f481a11f86169))
* **system-settings:** 新增系统设置模块，重构系统信息功能 ([206cca1](https://github.com/indredK/bench/commit/206cca1f7c65c519550ffa072228a7c95c8a78c3))
* **terminology:** 添加术语管理模块 ([8f64370](https://github.com/indredK/bench/commit/8f643703f5351cb0cab031f05943638b11b5920d))
* 实现启动失败诊断与硬件对比模块重构 ([40df21a](https://github.com/indredK/bench/commit/40df21a7e5d7cd8784dc764c945752885d407cba))


### Bug Fixes

* **api_billing:** 修复持久化失败时的状态撕裂风险 ([ebbbf29](https://github.com/indredK/bench/commit/ebbbf2903c147f9c40c0509ae008d162c21b457b))
* **rust:** 修复跨平台编译问题并增加预提交检查 ([f595f2b](https://github.com/indredK/bench/commit/f595f2bc85b56c0e2e7887cdfa2eaa14159e361f))
* 完成多模块加载错误处理与状态优化 ([52b57b8](https://github.com/indredK/bench/commit/52b57b8ac8e47528a8fb1a3929bfac10d920f581))

## [1.13.0](https://github.com/indredK/bench/compare/v1.12.1...v1.13.0) (2026-06-08)


### Features

* **token-calculator:** 添加 Token 价格计算器模块 ([4851e36](https://github.com/indredK/bench/commit/4851e36f0387779461716041c178d654dc8a53a5))

## [1.12.1](https://github.com/indredK/bench/compare/v1.12.0...v1.12.1) (2026-05-25)


### Bug Fixes

* **api-billing:** 站点/账号卡片支持拖动排序 ([8017db8](https://github.com/indredK/bench/commit/8017db81c94c4ceb0c94a98ae7167341c9003218))

## [1.12.0](https://github.com/indredK/bench/compare/v1.11.1...v1.12.0) (2026-05-25)


### Features

* **api-billing:** 挂载 Toaster 并为刷新操作添加成功通知 ([e5a1e48](https://github.com/indredK/bench/commit/e5a1e48c9ca48ac493e354824dbed3ae60fddc0c))
* **api-billing:** 新增登录方式、邀请链接支持并优化界面 ([d4a5434](https://github.com/indredK/bench/commit/d4a54346ca693c3fe9dfe6d9e34cb27bfdd0d7a4))
* **api-billing:** 新增账号手机号、TG账号及关联账号字段 ([281bb82](https://github.com/indredK/bench/commit/281bb825bb28ecde23b62aa8c4159988cbdca7f0))
* **api-billing:** 新增错误分类、多账号并发刷新与账号密码管理 ([b04e863](https://github.com/indredK/bench/commit/b04e863132a9735b1e45890447332afc4474819e))


### Bug Fixes

* **api-billing:** 修复密码静默清空与英文翻译缺失等严重问题 ([79b74a9](https://github.com/indredK/bench/commit/79b74a9543834a9ca99b4886ab78670b60b78523))
* **api-billing:** 移除 autoFocus 与电话字段格式优化 ([baadcb8](https://github.com/indredK/bench/commit/baadcb800b28296f92721ecd4b4a9803b447647b))
* **api-billing:** 统一弹窗提交流程并修复状态/闭包问题 ([fe30926](https://github.com/indredK/bench/commit/fe3092664c89a0ee1532da3fd7d7e361883ee196))
* **api-billing:** 通过 innerText 轮询避免 SPA 渲染未完成时误判登录态 ([865cc82](https://github.com/indredK/bench/commit/865cc823198f9d9a49f11fb76d44cd3309c796a1))
* **billing:** 修复页面加载后探针稳定检测逻辑 ([ec46e63](https://github.com/indredK/bench/commit/ec46e634cc2fcbc302f70c11d541fed96d4f6f93))

## [1.11.1](https://github.com/indredK/bench/compare/v1.11.0...v1.11.1) (2026-05-24)


### Bug Fixes

* **api-billing:** add relay data import and export functions ([9fc94c3](https://github.com/indredK/bench/commit/9fc94c36bdeb175fa474a20705b6d050a35e84b7))

## [1.11.0](https://github.com/indredK/bench/compare/v1.10.0...v1.11.0) (2026-05-24)


### Features

* **api-billing:** add last refreshed time tracking for station accounts ([8a37a1f](https://github.com/indredK/bench/commit/8a37a1f44218aad9bb1627a4593e5c717d4c8259))

## [1.10.0](https://github.com/indredK/bench/compare/v1.9.0...v1.10.0) (2026-05-24)


### Features

* **api-billing:** 新增中转站账号管理功能 ([0b3c8cb](https://github.com/indredK/bench/commit/0b3c8cb69f068b11af73b4573d8d0a56aa18412c))
* 新增窗口主题支持，添加macOS毛玻璃效果 ([cdc0404](https://github.com/indredK/bench/commit/cdc04041f444241dcb6ed83b59a14945c6fd64f3))

## [1.9.0](https://github.com/indredK/bench/compare/v1.8.10...v1.9.0) (2026-05-24)


### Features

* add app restart function ([87a62df](https://github.com/indredK/bench/commit/87a62df32445b05856729a322f3d48c790c8dc12))
* add framer motion animations for layout and components ([0a88441](https://github.com/indredK/bench/commit/0a884410cab65b1ff6bfb9c771437f3b7c813b84))
* add page transition animations for routes and filter bar ([797371f](https://github.com/indredK/bench/commit/797371f5c3623345ca893e7ceb123c8c473e886a))
* **app-manager:** add installed app filter count selector and tests ([18db7bb](https://github.com/indredK/bench/commit/18db7bb7ab45633dcb68661d245ae6dfdba86703))
* **app-manager:** add marketplace filter for install list ([4384cef](https://github.com/indredK/bench/commit/4384cef6bef76cdf16859ac052a66ea0c122ad9e))
* **app-manager:** add search function for app manager ([04d62aa](https://github.com/indredK/bench/commit/04d62aa256f8cde1220fe0ce523510ac14fedfee))
* **app-manager:** 批量操作弹窗显示选中应用列表，优化批量操作流程 ([720051f](https://github.com/indredK/bench/commit/720051f0327311649ca2e14151303c4b8a19c51f))
* **app-manager:** 移除操作历史功能，新增Mac App Store更新页快捷入口 ([93098f1](https://github.com/indredK/bench/commit/93098f18a7229d50efc323cc1934b287544ff82a))
* **app-manager:** 软件更新 v1.0 — Homebrew / MAS / Sparkle 三源聚合 ([399399c](https://github.com/indredK/bench/commit/399399c34a387e1108cd0dcd0a9309013f20e515))
* **app-manager:** 软件更新 v1.1 — 新增 Electron + Squirrel.Mac 检测 ([3c273e2](https://github.com/indredK/bench/commit/3c273e21eb34b099462b6ab88b2acc98bbeea8f7))
* **app-manager:** 软件更新 v1.2 — Sparkle/Electron/Squirrel 代下载代安装 ([3568bdd](https://github.com/indredK/bench/commit/3568bddbecd50a5fe0a179b12ab68178fa8810f2))
* **sidebar:** add scramble text animation to sidebar title ([02ca182](https://github.com/indredK/bench/commit/02ca182defe163fa1207d563a48164b7abe6cd9b))
* **splashscreen:** 实现科幻风启动动画并调整窗口尺寸 ([38e4db4](https://github.com/indredK/bench/commit/38e4db4f0586695b665632c4ec1f252148e07bf6))


### Bug Fixes

* **app_manager:** 修复macOS和installer测试中的路径匹配问题 ([a94e3c8](https://github.com/indredK/bench/commit/a94e3c877d2abb1a5507074197eb97768fb9faff))

## [1.8.10](https://github.com/indredK/bench/compare/v1.8.9...v1.8.10) (2026-05-23)


### Bug Fixes

* **app-manager:** 生产构建图标不显示 — CSP 补 img-src data: ([17af422](https://github.com/indredK/bench/commit/17af4228ef75271684ab87b9888fb0968930b6e9))
* **ui/i18n:** 4 项跨模块修复 ([#066](https://github.com/indredK/bench/issues/066) [#069](https://github.com/indredK/bench/issues/069) [#084](https://github.com/indredK/bench/issues/084) [#109](https://github.com/indredK/bench/issues/109)) ([b907d7c](https://github.com/indredK/bench/commit/b907d7c8a4cefcb0fb2f1e3dc69a9be6fed602c1))

## [1.8.9](https://github.com/indredK/bench/compare/v1.8.8...v1.8.9) (2026-05-23)


### Bug Fixes

* **dev_cleaner:** du/PowerShell 子进程加超时 + Unix hardlink dedup ([#046](https://github.com/indredK/bench/issues/046) [#048](https://github.com/indredK/bench/issues/048)) ([0822238](https://github.com/indredK/bench/commit/0822238856bde6fd8a26bfe850ab253707340cda))
* **env_detector:** 版本探测超时放宽到 3s 并清洗 ANSI ([#061](https://github.com/indredK/bench/issues/061) [#064](https://github.com/indredK/bench/issues/064)) ([e2875ee](https://github.com/indredK/bench/commit/e2875ee7dfde7757b76160a363e191a731dadd35))
* **env-detector:** 前端扫描加 90s 超时并 i18n 化错误信息 ([#075](https://github.com/indredK/bench/issues/075) [#079](https://github.com/indredK/bench/issues/079)) ([24321e9](https://github.com/indredK/bench/commit/24321e9f31f2848618e716e2106beed7c09e4d1f))
* **port_manager:** lsof PID 去重 + 进程树 O(N) ([#055](https://github.com/indredK/bench/issues/055) [#058](https://github.com/indredK/bench/issues/058)) ([bbc472b](https://github.com/indredK/bench/commit/bbc472b0181c1e730530135f05060832a33c15de))
* **port-manager:** scan 回包过滤被移除端口 + 卸载清 highlight ([#077](https://github.com/indredK/bench/issues/077) [#090](https://github.com/indredK/bench/issues/090)) ([eae7d46](https://github.com/indredK/bench/commit/eae7d460f383edd597a603a354c4391ed0aef958))

## [1.8.8](https://github.com/indredK/bench/compare/v1.8.7...v1.8.8) (2026-05-23)


### Bug Fixes

* **app_manager/linux:** Exec 字段解析符合 freedesktop 规范 ([#018](https://github.com/indredK/bench/issues/018) [#019](https://github.com/indredK/bench/issues/019) [#020](https://github.com/indredK/bench/issues/020)) ([1960ef6](https://github.com/indredK/bench/commit/1960ef6d505d2a350e869837927c86e0fad9e5a0))
* **app_manager/macos:** brew 可用性增加 --version 探活 ([#023](https://github.com/indredK/bench/issues/023)) ([1eb3fbe](https://github.com/indredK/bench/commit/1eb3fbe51da7b3e0bc83c98407c4f5e63a4a8b2f))
* **app_manager:** 短 token 名称匹配避免子串误伤 ([#016](https://github.com/indredK/bench/issues/016)) ([a5181ef](https://github.com/indredK/bench/commit/a5181ef01cc233926d9fef79b1499793408c7aeb))
* **app-manager:** AppIcon 模块级缓存改为有界 LRU ([#070](https://github.com/indredK/bench/issues/070)) ([6aab454](https://github.com/indredK/bench/commit/6aab454bd5db8405793fc8192813d9f1fa4777be))
* **dev_cleaner:** Windows polish 与扫描入口校验 ([#032](https://github.com/indredK/bench/issues/032) [#033](https://github.com/indredK/bench/issues/033) [#041](https://github.com/indredK/bench/issues/041) [#042](https://github.com/indredK/bench/issues/042)) ([818923f](https://github.com/indredK/bench/commit/818923f92934c865c792e735e74722ed4b2a8f19))
* **dev-cleaner:** i18n 化清理成功 toast 与扫描停止消息 ([#080](https://github.com/indredK/bench/issues/080) [#083](https://github.com/indredK/bench/issues/083)) ([ae1ef88](https://github.com/indredK/bench/commit/ae1ef8876cd72256cdc4a435bda7a047b616489d))
* **platform:** clipboard textarea 兜底 + shell openExternal 失败降级 ([9167663](https://github.com/indredK/bench/commit/916766327937c8ee07c3acede10d0e510a597576))

## [1.8.7](https://github.com/indredK/bench/compare/v1.8.6...v1.8.7) (2026-05-23)


### Bug Fixes

* **app-manager:** brew/winget 表头列解析 + Linux 启动脱壳 ([9361f3b](https://github.com/indredK/bench/commit/9361f3bbb98530859f3abf89d597ad4162c73919))
* **app-manager:** operationStatus setTimeout 卸载未清理 ([#068](https://github.com/indredK/bench/issues/068)) ([fc72125](https://github.com/indredK/bench/commit/fc721251c89374b9dd68f7fe57ec7547ca4621f1))
* **app-manager:** 筛选切换时同步清空批量选择 ([925df1f](https://github.com/indredK/bench/commit/925df1f7350127c29476e1bb3c04a5271cc398a8))
* **boot:** 隐私模式 storage 兜底 + i18n init 等待 + HTML inline try/catch ([b897115](https://github.com/indredK/bench/commit/b8971152aad9fa74bdd1c6ea4231c6bda9a75230))
* **ci:** publish 步骤优先使用 RELEASE_PLEASE_TOKEN,与 release-please 对齐 ([5470de8](https://github.com/indredK/bench/commit/5470de853248ad7cb1ae067c476af7fa35125e74))
* **ci:** 让 linux.rs 在 Windows 上能编译,清理跨平台 use 警告 ([ff8691d](https://github.com/indredK/bench/commit/ff8691d29a27da6debc752fe67c97bae089b7a27))
* **dev-cleaner:** cleanup 接入 abort flag + 卸载时清理 rescan timer ([c026a96](https://github.com/indredK/bench/commit/c026a9677decbe7178e34cfae017a244a4bcfa0e))
* **port-manager:** 本地化 netstat + PID 重用守卫 + 错误码分类 + 常量去重 ([b71d0df](https://github.com/indredK/bench/commit/b71d0dfa725040537c400ae01b79efed469d6b19))
* **tauri tests:** add error_code field to KillPidResult DTO test ([273660c](https://github.com/indredK/bench/commit/273660c98767e12056600277b098afc034c9550c))

## [1.8.6](https://github.com/indredK/bench/compare/v1.8.5...v1.8.6) (2026-05-23)


### Bug Fixes

* **app-manager:** mutex 中毒恢复 + install 操作锁 + batch 进度事件 ([9a8f686](https://github.com/indredK/bench/commit/9a8f686c94e7237918e21fea5b7872cba964ecb8))
* **app-updater:** 单飞检查 + 取消下载 + 失败保留 cache + 进度饱和 ([865e7d4](https://github.com/indredK/bench/commit/865e7d4b2869d75b38b9585e516dff1f4a49082e))
* **bootstrap:** splash 握手 + 窗口重试 + 监听清理竞态 ([f2ccf62](https://github.com/indredK/bench/commit/f2ccf623279eaca2588533577f19c2a38d899848))
* **dev-cleaner:** 数据安全四连击 — 防 symlink/junction 越界、防跨卷、走回收站 ([afd84eb](https://github.com/indredK/bench/commit/afd84eb5351f60d8c6543913ee13add8cf59340e))

## [1.8.5](https://github.com/indredK/bench/compare/v1.8.4...v1.8.5) (2026-05-23)


### Bug Fixes

* **app-manager:** Linux 启动遵循 TryExec, macOS 图标支持 PNG/iconset 回退 ([7d91370](https://github.com/indredK/bench/commit/7d91370ee593a785a27d11ee2d55e4b32ceac58e))
* **app-manager:** 修复三个平台特定的 user-facing bug ([fa704f8](https://github.com/indredK/bench/commit/fa704f8de0bab10c1dfdb9fb54780059812c88f4))
* **app-manager:** 空扫描丢缓存、检查更新错误吞噬、批量无法取消 ([3f918aa](https://github.com/indredK/bench/commit/3f918aaf7f76a2be0673e814bc0b28fa6b5c71c7))
* **dev-cleaner,app-updater:** 多语言项目标签与更新元数据缓存 ([a6d2985](https://github.com/indredK/bench/commit/a6d29850c4c9b8af29f96bff568ec84c33cec36b))
* **dev-cleaner:** 嵌套跳过目录、单位口径、abort 响应延迟 ([4e59159](https://github.com/indredK/bench/commit/4e59159e33593af4f2cc51327731812fd5edf800))
* **env-detector:** 修复非 zsh 登录 shell PATH 采集与探测节流可见性 ([ba494d5](https://github.com/indredK/bench/commit/ba494d54f6aeb70c36bcc62cbaf18d36844f76c1))
* **port-manager:** 杀进程递归到子进程,父链 max_depth 提升到 64 ([bfb078a](https://github.com/indredK/bench/commit/bfb078ac91df6f00b9df2ad114bce8acffa3df82))
* **port-manager:** 进程采集鲁棒性,改用 sysinfo 并修正端口/指纹匹配 ([9259c4a](https://github.com/indredK/bench/commit/9259c4acbc881a9dcc62a219956837301f0f7fed))
* 闭环 panic → Mutex 中毒 → 状态不可恢复 链路 ([49afa9c](https://github.com/indredK/bench/commit/49afa9c4fca54095850c93a97450ed9e5e3e3d71))

## [1.8.4](https://github.com/indredK/bench/compare/v1.8.3...v1.8.4) (2026-05-22)


### Bug Fixes

* **release-please:** 修正Cargo.lock版本提取的jsonpath语法 ([e549572](https://github.com/indredK/bench/commit/e549572cbff75957d8b2a0ecffd48ee56c83fe60))
* **release-please:** 简化release-please配置，合并版本管理 ([0795ce4](https://github.com/indredK/bench/commit/0795ce48117d6973e6c285ed024125abfdb3ec7e))
* trigger release ([890b5f2](https://github.com/indredK/bench/commit/890b5f23f6f690b3a8fd589ff9312922b23cc9b9))

## [1.8.3](https://github.com/indredK/bench/compare/v1.8.2...v1.8.3) (2026-05-22)


### Bug Fixes

* trigger release-please ([f739702](https://github.com/indredK/bench/commit/f7397022d959c8238b9caa2182eee0ad008a25d0))

## [1.8.2](https://github.com/indredK/bench/compare/v1.8.1...v1.8.2) (2026-05-22)


### Bug Fixes

* 修复发布问题 ([38fa1f4](https://github.com/indredK/bench/commit/38fa1f46f19353a7bf5a03d8eed41628b015b879))

## [1.8.1](https://github.com/indredK/bench/compare/v1.8.0...v1.8.1) (2026-05-22)


### Bug Fixes

* **ci:** install libglib2.0-dev for linux tauri checks ([cd3cac2](https://github.com/indredK/bench/commit/cd3cac26e599246c954ca449541982594c75420d))
* **ci:** install libglib2.0-dev for linux tauri checks ([cd3cac2](https://github.com/indredK/bench/commit/cd3cac26e599246c954ca449541982594c75420d))
* **ci:** install libglib2.0-dev for linux tauri checks ([eb65f5b](https://github.com/indredK/bench/commit/eb65f5b5000ca5566f4310a12f35587224882581))

## [1.8.0](https://github.com/indredK/bench/compare/v1.7.1...v1.8.0) (2026-05-22)


### Features

* **updater:** add full update dialog state and i18n translations ([e38704d](https://github.com/indredK/bench/commit/e38704da4dda6d726e62270577682c2857f9c088))
* **updater:** 完善更新错误处理与多语言文案 ([0816e27](https://github.com/indredK/bench/commit/0816e275a6327a946ea4d233b2e716bde485f550))
* **updater:** 新增更新包签名校验相关功能与错误处理 ([da23577](https://github.com/indredK/bench/commit/da235772ee98bc0502fa97b23964a2d2d55b1df8))


### Bug Fixes

* **release:** trigger release-please after updater fix ([2a13ec8](https://github.com/indredK/bench/commit/2a13ec874af2204e8a80de42ffe8a99afb310880))
* 修复升级 ([a35ee83](https://github.com/indredK/bench/commit/a35ee83ee081f3f4310a3307e3396a18fe34eef3))

## [1.7.1](https://github.com/indredK/bench/compare/v1.7.0...v1.7.1) (2026-05-22)


### Features

* 尝试新打包流程 ([4ca9eca](https://github.com/indredK/bench/commit/4ca9eca2729648aeb51b155c5e55672fc42eccd8))
* 尝试新打包流程 ([4ca9eca](https://github.com/indredK/bench/commit/4ca9eca2729648aeb51b155c5e55672fc42eccd8))


### Bug Fixes

* **release:** simplify cargo workspace release config ([ff3f204](https://github.com/indredK/bench/commit/ff3f204881c9254319a5d0e8f3475f06b860c3d0))


### Miscellaneous Chores

* release 1.7.1 ([02f77b4](https://github.com/indredK/bench/commit/02f77b41ffcb5c40602ed13ef78d4c2ce28e0956))
* release 1.7.1 ([6427178](https://github.com/indredK/bench/commit/642717817b662f32755e8b734ff0fc73a923cb6e))
* release 1.7.1 ([7e960c1](https://github.com/indredK/bench/commit/7e960c1b441418613e44e12edd2bab2f77fbc873))

## [1.7.0](https://github.com/indredK/bench/compare/v1.6.0...v1.7.0) (2026-05-22)


### Features

* 实现启动窗口与主窗口的协同启动流程 ([f6e0936](https://github.com/indredK/bench/commit/f6e0936066330eecfffe550f96597f8fb598a033))
* 实现启动窗口与主窗口的协同启动流程 ([26ee556](https://github.com/indredK/bench/commit/26ee556e223eef8f29e9c4289d7266e7355574f9))

## [1.6.0](https://github.com/indredK/bench/compare/v1.5.1...v1.6.0) (2026-05-22)


### Features

* 集成应用更新功能，实现完整的版本更新流程 ([d6e6203](https://github.com/indredK/bench/commit/d6e6203c6a2846a026ab88c3f523fb6a7d86dd0d))
