# Bench 发布主题路线图

> **唯一发布节奏源** — 各模块 backlog 见 [../modules/](../modules/README.md) 下 `roadmap.md`  
> 基线：v1.15.0 | 更新：2026-07-01  
> 产品定位：**macOS 开发者工作台**（副线：多站点 Session 管家）

---

## 定位与选品原则

| 优先级 | 用户故事 | 模块 |
|--------|----------|------|
| **主** | 日常开发：启动 App、端口/清理/环境、小工具 | Quick Launch, Dev Toolbox, Port Manager, Dev Cleaner, Env Detector |
| **差异化** | 多站点登录态与会话恢复 | Account Manager |
| **保留** | 垂直工具，不扩新品类 | Terminology, Hardware, App Manager |
| **macOS 壳层** | 系统调优 + 托盘 | System Settings, Tray |

**不做 / 远期（v1.20+）：** `feature-candidates.md` 中 R 播放器、T 白噪音、W TOTP、X AI Agent 等 OnlySwitch 长尾功能。

---

## 平台能力矩阵

| 模块 | macOS | Windows | Linux | 说明 |
|------|:-----:|:-------:|:-----:|------|
| Quick Launch | ✅ | ✅ | ✅ | 依赖本机已安装应用 |
| App Manager | ✅ | ✅ | ✅ | 安装源因平台而异 |
| Hardware Compare | ✅ | ⚠️ | ⚠️ | 数据以 Apple/常见硬件为主 |
| Terminology | ✅ | ✅ | ✅ | 纯前端 + 本地存储 |
| Account Manager | ✅ | ⚠️ | ⚠️ | WebView Session 以 macOS 为主；非 macOS 应显示 `DesktopOnly` |
| Dev Toolbox（含子 Tab） | ✅ | 部分 | 部分 | 网络诊断/系统信息依赖后端能力 |
| System Settings | ✅ | ❌ | ❌ | macOS `defaults` / 系统 API |
| Menu bar Tray | ✅ | ❌ | ❌ | 托盘与防睡眠联动 |

图例：✅ 完整支持 · ⚠️ 部分可用 · ❌ 不适用

---

## v1.15.x 已交付（Polish 基建）

跨模块，已在 v1.15 合入但未写入各模块 roadmap 前：

| 项 | 说明 |
|----|------|
| 菜单栏托盘 | 显示窗口 / 防睡眠 / 退出 |
| 危险操作确认 | `DestructiveConfirmDialog` — 端口 kill、快捷操作、术语删除、外部 App 撤销等 |
| Token 实时汇率 | Frankfurter API + 1h 缓存 |
| Dev Toolbox IA | 7 Tab 收拢端口/清理/环境/Token/工具/诊断/系统信息 |
| Account Manager 架构 | `store` + `repository` + `use-cases` + `lib/tauri/commands/account-manager` |
| Sortable 卡片 | 提升至 `components/ui/sortable-card` |

---

## v1.16 — Polish & Trust（当前冲刺）

**主题：** 用户可感知的稳定与一致，而非加新模块。

| # | 交付项 | 负责模块 | 状态 |
|---|--------|----------|------|
| 1 | 路线图与代码对齐 | 全部 `docs/modules/*/roadmap.md` | ✅ |
| 2 | Account Manager 架构/守卫/i18n/撤销确认 | Account Manager | ✅ |
| 3 | Quick Login → WebView | Account Manager | ✅ |
| 4 | 全量 i18n（System Settings TCC/浏览器/Dock 等） | System Settings | ✅ 核心项 |
| 5 | shadcn Select、defaultBrowser 失败 toast | System Settings | ⏳ Select 待换 |
| 6 | Quick Launch 启动/Reveal 重入保护 | Quick Launch | ✅ |
| 7 | Token Calculator 提交/计算重入保护 | Token Calculator | ✅ 标准 CRUD + 汇率 |
| 8 | Terminology clipboard → platform 封装 | Terminology | ✅ |
| 9 | Session v1→v2 迁移（local_storage → origins） | Account Manager (Rust) | ⏳ |
| 10 | Account 状态/空态 UX（Session 可读性） | Account Manager | ⏳ |

**v1.16 明确不做：** TLS 指纹、跨平台 WebView、feature-candidates 大批量上新。

### 验收标准

- `npm run lint:fe` + i18n guard 通过
- `npm run test:critical` 通过
- 中英文切换后 Settings / Account Manager 无漏翻
- 杀端口 / 删账号 / 撤销外部 App 均有后果说明
- Quick Launch / Token 连点无重复副作用

---

## v1.17 — Developer Daily Loop

**主题：** 开发者每天打开 Bench 能闭环完成一件事。

| # | 交付项 | 模块 |
|---|--------|------|
| 1 | Dev Cleaner 异步扫描 + 清理历史 | Dev Cleaner |
| 2 | Env 对比 / 导出 / CI 模板 | Env Detector |
| 3 | Quick Launch 使用频率 + 可选分类规则 | Quick Launch |
| 4 | Dev Toolbox 拆分子模块 + 正则测试器 | Dev Toolbox |
| 5 | **System Settings 搜索 MVP** | System Settings |
| 6 | 精选 candidates 入库（键盘 C、Dock B、隐藏桌面 Q） | System Settings ← candidates |
| 7 | App Manager 更新 diff / 来源过滤 | App Manager |
| 8 | Port 大列表虚拟化 + 端口历史 | Port Manager |
| 9 | Terminology 大列表虚拟化 + 收藏导出 | Terminology |
| 10 | Token 定价缓存 + 用量历史 | Token Calculator |
| 11 | 质量门禁：Quick Launch / System Settings / Terminology 各 ≥1 测试 | 多模块 |

---

## v1.18 — Session Platform

**主题：** 差异化 Session 能力 + 设置可迁移。

| # | 交付项 | 模块 |
|---|--------|------|
| 1 | IndexedDB 导出 + Session TTL 自动清理 | Account Manager |
| 2 | 设置导入/导出 | System Settings |
| 3 | per-station 代理（HTTP/SOCKS5） | Account Manager |
| 4 | Port 远程检测 / 占用告警 | Port Manager |
| 5 | 硬件对比导出、术语社区/TTS | Hardware, Terminology |
| 6 | 跨平台能力边界 UI（RuntimeFeatureGate 文案） | 全局 |

---

## 文档索引

| 文档 | 用途 |
|------|------|
| [release-themes.md](./release-themes.md) | **本文件** — 发布主题与节奏 |
| [modules/](../modules/README.md) | 各模块 `roadmap.md` / `bugs.md` / 设计稿 |
| [product-roadmap-review-plan.md](./product-roadmap-review-plan.md) | 2026-07-01 评审记录 |
| [product-iteration-reference.md](../product-iteration-reference.md) | 迭代方法论与未来方向（仅供参考） |

模块 backlog 示例：[account-manager/roadmap.md](../modules/account-manager/roadmap.md) · [system-settings/roadmap.md](../modules/system-settings/roadmap.md) · [feature-candidates.md](../modules/system-settings/feature-candidates.md)

---

## v1.17 System Settings 候选清单（来自 feature-candidates）

已选入 v1.17 的开关（实现时逐条打勾）：

| 候选节 | 开关 | 理由 |
|--------|------|------|
| C | 关闭自动纠正 / 智能引号 / 破折号 / 自动大写 | 开发者刚需 |
| B | 自动隐藏 Dock、最小化动画 scale | 与现有 Dock 区块一致 |
| Q | 隐藏桌面图标 | 托盘用户高频 |
| C | 按键重复速率 / 延迟 | 与现有键盘区块一致 |

未选入 v1.17：R/T/W/X 及媒体、AI、认证器类。
