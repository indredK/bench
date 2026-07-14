# Clean Space Roadmap

扫描、APFS 归因、清理白名单和路径安全以 [design.md](./design.md) 为准。已完成历史由 Git 保留，不在 roadmap 重复。

## 延期验证

- [ ] 在 macOS 真机覆盖权限拒绝、受保护目录、自定义目录、Docker/find timeout、取消和清理前后释放量；自动化测试不能替代真实磁盘行为。

## 远期

- [ ] 若扩展 Windows/Linux，先抽象 `PlatformStorageScanner`、独立删除白名单和 supported/partial/failed contract；2.0.0 不承诺这些平台。
- [ ] 智能建议需先定义隐私、活跃度信号和可解释规则。
- [ ] 定时提醒需支持关闭、频率控制和系统权限失败反馈。
- [ ] Undo 需先设计隔离区、容量上限、过期和跨卷恢复语义。
