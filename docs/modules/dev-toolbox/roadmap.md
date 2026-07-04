# Dev Toolbox 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-05  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | controller 抽取完成，状态与 handler 集中管理 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 7 Tab 完整：端口/清理/环境/Token/工具/诊断/系统信息 |
| 用户体验 | ⭐⭐⭐⭐⚬ | Tab IA 清晰；devtools 区可再分组 |
| 性能 | ⭐⭐⭐⭐⚬ | 子页懒加载 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | 无测试 |
| 可维护性 | ⭐⭐⭐⭐⚬ | controller 持有所有状态，page.tsx 仅做渲染 |

## ✅ 已交付 (v1.15.x)

- [x] 侧边栏收拢为 Dev Toolbox 统一入口（7 Tab）
- [x] JSON 格式化/压缩、Base64、哈希、UUID、时间戳（devtools Tab）
- [x] Ping/DNS 等网络诊断 Tab
- [x] 系统信息 Tab（Rust 后端 + 懒加载）

## v1.16

- [x] 4 个子页改 `lazy()` + `<Suspense>` 懒加载
- [x] 抽出 `hooks/useDevToolboxController.ts`，14 个 devtools 状态 + 2 个 diagnostics 状态 + 3 个 system info 状态 + 10 个 handler + lazy-load effect 全部迁入（Commit 8ea0985）

## v1.17

- [ ] 拆分子模块（`devtools/`、`diagnostics/`、`info/`），避免 `page.tsx` 继续膨胀
- [ ] 正则测试器
- [ ] JSON 校验增强（schema 可选）
