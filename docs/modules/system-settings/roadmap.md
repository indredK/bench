# System Settings 迭代规划

> 最后更新: 2026-07-05  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)  
> 功能说明见 [features.md](./features.md) · 技术设计见 [design.md](./design.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⚬⚬ | 模块拆分合理；原生 select、空 catch、useEffect 依赖仍待修 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | Finder/Dock/键盘/显示/网络/隐私/截图 覆盖广 |
| 用户体验 | ⭐⭐⭐⚬⚬ | TCC 面板、聚焦刷新好；TCC toast 仍硬编码英文 |
| 性能 | ⭐⭐⭐⭐⚬ | 轻量无瓶颈 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | 无测试文件 |
| 可维护性 | ⭐⭐⭐⚬⚬ | store 字段清理、死代码待收 |

## Backlog

- [ ] store 中未使用字段清理
- [ ] 浏览器名称 canonical value + locale 映射
- [ ] 启动配置读取失败传播到前端 UI
- [ ] 精选 candidates：隐藏桌面(Q)
- [ ] 设置导入/导出
