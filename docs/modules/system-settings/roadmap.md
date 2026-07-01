# System Settings 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-01  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)  
> 设计文档见 [README.md](./README.md)  
> v1.17 候选开关见 [feature-candidates.md](./feature-candidates.md) 节 C/B/Q

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⚬⚬ | 模块拆分合理；原生 select、空 catch、useEffect 依赖仍待修 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | Finder/Dock/键盘/显示/网络/隐私/截图 覆盖广 |
| 用户体验 | ⭐⭐⭐⚬⚬ | TCC 面板、聚焦刷新好；TCC toast 仍硬编码英文 |
| 性能 | ⭐⭐⭐⭐⚬ | 轻量无瓶颈 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | 无测试文件 |
| 可维护性 | ⭐⭐⭐⚬⚬ | store 字段清理、死代码待收 |

## ✅ 已交付 (v1.15.x)

- [x] 危险快捷操作二次确认（`QuickActionsSection` + `DestructiveConfirmDialog`）
- [x] 窗口聚焦自动刷新系统状态（design-spec C-3）

## v1.16 — 近期

- [x] i18n: TCC 弹窗 Allowed/Denied/none → `t()`
- [x] i18n: 浏览器选择器 option 文本 → `t()`
- [x] i18n: Dock 位置按钮、密码延迟秒数 → `t()`
- [x] defaultBrowser 加载失败 toast
- [x] useEffect 补充 loadTabSettings 依赖
- [ ] 原生 select 改为 shadcn Select 组件
- [ ] store 中未使用字段清理

## v1.17

- [ ] **设置搜索 MVP**（从 v1.18 提前）
- [ ] 浏览器名称 canonical value + locale 映射
- [ ] 启动配置读取失败传播到前端 UI
- [ ] 精选 candidates：键盘(C)、Dock(B)、隐藏桌面(Q)

## v1.18

- [ ] 设置导入/导出
