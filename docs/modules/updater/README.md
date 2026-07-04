# Updater 文档

代码：`src/features/updater/`（应用自更新：检查 / 下载 / 安装）

## 模块结构

| 文件 | 职责 |
|------|------|
| `store.ts` | 更新状态（status / progress / error / updateInfo） |
| `hooks/useUpdaterController.ts` | 编排：触发检查、下载、安装、重启；对接 Tauri updater 事件 |
| `error-classifier.ts` | 把后端/网络错误归类为用户可读的 `UpdaterErrorInfo`（kind + operation + retryAction） |
| `__tests__/error-classifier.test.ts` | 错误分类单元测试 |

状态机：`idle → checking → available → downloading → installing → readyToRestart`（任一步可转 `error`）

UI 入口：`UpdateDialog`（`src/components/common/UpdateDialog.tsx`），由 `App.tsx` 通过 `useUpdaterController` 驱动。

| 文档 | 说明 |
|------|------|
| [roadmap.md](./roadmap.md) | 迭代规划 |

发布节奏：[release-themes.md](../../roadmap/release-themes.md)
