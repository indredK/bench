# Bench 发布策略

产品定位：macOS 开发者工作台；已声明跨平台的模块必须在 Windows 提供同等语义，macOS 专属能力必须明确标注。

当前发布目标为 2.0.0，停止扩展新品类。实现与验收分别以[功能发布规范](./2.0.0-release-readiness.md)和[用户体验规范](./2.0.0-ux-readiness.md)为准。

## 选品顺序

| 优先级 | 用户故事 | 模块 |
|--------|----------|------|
| 主线 | 启动应用、端口/清理/环境、小工具 | Quick Launch、Dev Toolbox 及子模块 |
| 差异化 | 多站点登录态和会话恢复 | Account Manager |
| 维护 | 垂直工具，不扩新品类 | Terminology、Hardware、App Manager |
| macOS 专属 | 系统调优、托盘和防睡眠 | System Settings、Tray |

远期长尾功能不得挤占 [当前主题](../ROADMAP.md)：播放器、白噪音、TOTP、AI Agent 等需单独产品决策后才能进入 backlog。

## 平台能力

| 模块 | macOS | Windows | Linux | 约束 |
|------|:-----:|:-------:|:-----:|------|
| Quick Launch | ⚠️ | ⚠️ | 未审计 | 核心代码已整改，真机启动和大列表验收未完成 |
| App Manager | ⚠️ | ⚠️ | 未审计 | 核心代码已整改，平台 fixture/smoke/runner 未完成 |
| Account Manager | ⚠️ | ⚠️ | 未审计 | Session/代理安全边界未闭环；Windows 入口和行为验收未完成 |
| Dev Toolbox | ✅ | 部分 | 部分 | 子工具分别声明平台能力 |
| Clean Space | ✅ | 不适用 | 不适用 | 2.0.0 维持 macOS-only；其他平台导航隐藏、直达 gate |
| Hardware | ✅ | 不适用 | 不适用 | 2.0.0 维持 macOS-only；数据以 Apple 和常见硬件为主 |
| Terminology | ✅ | ✅ | ✅ | 纯前端与本地存储 |
| System Settings | ✅ | 不适用 | 不适用 | macOS `defaults` 和系统权限 API |
| Tray / 防睡眠 | ✅ | 不适用 | 不适用 | 当前仅定义 macOS 行为 |

`✅` 表示目标平台行为已经验收；`⚠️` 表示部分可用或待验收。unsupported、partial 和 failed 不得折叠为成功空结果。
