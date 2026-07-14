# Clean Space Roadmap

扫描、APFS 归因、清理白名单和路径安全以 [design.md](./design.md) 为准。已完成历史由 Git 保留，不在 roadmap 重复。

## 2.0 发布阻断

- [ ] 为 `scan_storage_overview`、流式扫描和 `execute_category_cleanup` 补 Rust 单测。
- [ ] 消除 `scan_overview` 与 `scan_overview_stream` 的路径和分类构造重复。

## 远期

- [ ] 若扩展 Windows/Linux，先抽象 `PlatformStorageScanner`、独立删除白名单和 supported/partial/failed contract；2.0.0 不承诺这些平台。
- [ ] 智能建议需先定义隐私、活跃度信号和可解释规则。
- [ ] 定时提醒需支持关闭、频率控制和系统权限失败反馈。
- [ ] Undo 需先设计隔离区、容量上限、过期和跨卷恢复语义。
