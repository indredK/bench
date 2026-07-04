# Updater 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-05
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | store / controller / error-classifier 分层清晰；错误分类完备 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 检查 / 下载 / 安装 / 重启全链路；进度与错误反馈完善 |
| 用户体验 | ⭐⭐⭐⭐⚬ | UpdateDialog 弹窗 + 菜单栏触发；错误可重试 |
| 性能 | ⭐⭐⭐⭐⚬ | 轻量，事件驱动，无轮询 |
| 测试覆盖 | ⭐⭐⭐⭐⚬ | controller 行为测试 + 契约测试 + error-classifier 单测 |
| 可维护性 | ⭐⭐⭐⭐⚬ | 模块小且内聚 |

## ✅ 已交付 (v1.15.x)

- [x] Tauri updater 集成（check / download / install / restart）
- [x] 错误分类器（`UpdaterErrorKind` 11 种 + retryAction）
- [x] 下载进度反馈（downloadedBytes / totalBytes）
- [x] `getErrorMessage` 统一错误解析（§5.3）

## v1.16

- [x] `useUpdaterController` 行为测试（13 个用例 + 1 个 mount 测试，覆盖 check / download / install / restart / cancel / progress 全流程）
- [x] 契约测试扩展（`AppUpdateInfo` + `AppUpdateInstallResult` DTO 字段一致性检查）

## v1.17

- [ ] 自动检查策略（启动后定时检查 / 仅手动触发）
- [ ] 更新日志 changelog 展示
