# Bench 发布主题路线图

> **唯一发布节奏源** — 各模块 backlog 见 [../modules/](../modules/README.md) 下 `roadmap.md`  
> 基线：v1.18.0 | 更新：2026-07-04  
> 产品定位：**macOS 开发者工作台**（副线：多站点 Session 管家）

---

## 定位与选品原则

| 优先级 | 用户故事 | 模块 |
|--------|----------|------|
| **主** | 日常开发：启动 App、端口/清理/环境、小工具 | Quick Launch, Dev Toolbox, Port Manager, Dev Cleaner, Env Detector |
| **差异化** | 多站点登录态与会话恢复 | Account Manager |
| **保留** | 垂直工具，不扩新品类 | Terminology, Hardware, App Manager |
| **macOS 壳层** | 系统调优 + 托盘 | System Settings, Tray |

**不做 / 远期（v1.20+）：** R 播放器、T 白噪音、W TOTP、X AI Agent 等 OnlySwitch 长尾功能（详见各模块 [roadmap.md](../modules/README.md)）。

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

## 文档索引

| 文档 | 用途 |
|------|------|
| [release-themes.md](./release-themes.md) | **本文件** — 发布主题与节奏 |
| [modules/](../modules/README.md) | 各模块 `features.md` / `design.md` / `roadmap.md` / `bugs.md` |

模块 backlog 示例：[account-manager/roadmap.md](../modules/account-manager/roadmap.md) · [system-settings/roadmap.md](../modules/system-settings/roadmap.md) · [port-manager/roadmap.md](../modules/port-manager/roadmap.md)
