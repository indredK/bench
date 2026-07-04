# Port Manager 迭代规划

> 最后更新: 2026-07-05  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | 控制器模式清晰 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 扫描/kill/进程树/指纹完整 |
| 用户体验 | ⭐⭐⭐⭐⭐ | kill 二次确认 + 后果说明、进程树、状态指示 |
| 性能 | ⭐⭐⭐⚬⚬ | 大 PID 列表进程树可能退化 |
| 测试覆盖 | ⭐⭐⭐⭐⭐ | PortManager + ports + fingerprints |
| 可维护性 | ⭐⭐⭐⭐⚬ | Rust fingerprints 模块独立 |

## Backlog

- [ ] 未使用返回值清理
- [ ] 进程树性能优化
