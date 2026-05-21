# 架构优化重点

项目主架构目前健康，不需要大规模重构。已完成的架构加固包括：

- IPC command/event 名称集中化，`menu-event` 与 `env-scan-done` 都纳入契约测试。
- 关键 IPC DTO 字段增加契约测试，降低 Rust/TypeScript 手写类型漂移风险。
- App Manager store 已拆出异步编排到 `model/store-actions.ts`，`store.ts` 更接近状态装配层。
- 跨 feature 共享的 compare/context-menu 能力已迁到 `src/shared`，不再伪装成业务 feature。

## 剩余演进项

Rust 侧 `src-tauri/src/env_detector.rs`、`src-tauri/src/dev_cleaner.rs`、`src-tauri/src/port_manager.rs` 仍是大单文件。它们有较多单元测试兜底，当前不是紧急风险；建议下次修改对应模块时顺手按职责拆分为 `commands.rs`、`types.rs`、规则/扫描/平台实现等子模块。

在这项完成前，保留本文档作为提醒。完成后可以删除本文档。
