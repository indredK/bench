# Quick Launch 跨平台可靠性说明

> 状态：共享清单、错误反馈、加载体验和大列表性能已整改；目标平台 smoke 待完成。

## 1. 模块边界

- 页面与 controller：`src/features/quick-launch/`
- 共享清单：`src/shared/app-inventory/`
- 后端能力：App Manager 的 `appId -> LaunchTarget`

Quick Launch 只负责搜索、分类、用户覆盖和启动交互。扫描、平台路径、AUMID、图标与 revision 由共享 inventory 提供。

## 2. 不可退化的约束

| 领域 | 强制约束 |
|------|----------|
| 数据源 | 只消费 `InventorySnapshot`，不得直接写 App Manager store 或复制扫描流程 |
| 启动 | 前端只传 `appId`；不可启动项不得进入可点击场景 |
| 刷新 | single-flight；按 inventory revision 重新分类；旧数据保留并标记刷新状态 |
| 错误 | launch/reveal/scan/partial/stale 必须有 i18n 反馈和 retry |
| 加载 | 首载 skeleton；未知总量使用 indeterminate；扫描有取消入口 |
| 性能 | 大列表使用 `VirtualGridView`；图标仅按可见项加载 |
| 分类 | 执行器与规则分离并带版本；overrides 带 schema version 持久化 |
| 搜索 | 使用 Unicode NFKC，并包含当前语言的场景文案 |

## 3. 平台现状

| 功能 | macOS | Windows |
|------|-------|---------|
| 清单 | 共享 App Manager inventory | 共享 App Manager inventory |
| 启动 | 后端 `.app` target | 后端 EXE/AUMID target |
| 图标 | 按需提取 | EXE 图标或稳定 fallback |
| 分类 | bundle ID/name/source 规则 | package/AUMID/name/source 规则 |

平台能力必须由真机 smoke 证明，不能由文档声明代替。

## 4. 剩余工作

- [ ] Windows EXE/AUMID 与 macOS `.app` 真机启动 smoke。
- [ ] 500+ 应用场景的 DOM 数量和滚动性能测试。
- [ ] 分类规则增加命中解释与 platform/source/exact ID 优先级数据治理。
- [ ] 清理未使用的 `LaunchAppEntry` 前确认外部消费者。

## 5. 修改入口

| 需求 | 修改位置 |
|------|----------|
| inventory 刷新/取消 | `src/shared/app-inventory/` |
| 页面状态与交互 | `hooks/useQuickLaunchController.ts` |
| 分类执行 | `classification-engine.ts` |
| 分类规则 | `scenes.ts` |
| 用户覆盖 | `store.ts` |
| 列表与加载 UI | `page.tsx` |

不要在 Quick Launch 中新增平台分支或 Tauri 直调；平台差异必须留在后端 adapter。

## 6. 验证命令

```bash
pnpm run lint:fe
pnpm run test:critical
pnpm run check:docs
git diff --check
```

## 7. 完成定义

- macOS/Windows 启动均通过稳定 `appId -> LaunchTarget` 的行为测试。
- revision、并发刷新、失败保留旧快照、不可启动项和虚拟列表有回归测试。
- 所有用户文案支持中英文，加载/空/错误/partial 状态完整。
