# Clean Space Roadmap

扫描、APFS 归因、清理白名单和路径安全以 [design.md](./design.md) 为准。已完成历史由 Git 保留，不在 roadmap 重复。

## Backlog

- [ ] 抽象 `PlatformStorageScanner`，适配 Windows/Linux，并明确 unsupported/partial/failed 状态。
- [ ] 为 `scan_storage_overview`、流式扫描和 `execute_category_cleanup` 补 Rust 单测。
- [ ] 消除 `scan_overview` 与 `scan_overview_stream` 的路径和分类构造重复。
- [ ] 智能建议需先定义隐私、活跃度信号和可解释规则。
- [ ] 定时提醒需支持关闭、频率控制和系统权限失败反馈。
- [ ] Undo 需先设计隔离区、容量上限、过期和跨卷恢复语义。
