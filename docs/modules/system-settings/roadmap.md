# System Settings Roadmap

新增设置必须遵守 [design.md](./design.md) 的平台、权限、读写回读和键位映射规则。

## Backlog

- [ ] 评估“隐藏桌面”候选；确认系统版本与可逆性后再实现。
- [ ] 设置导入/导出；写入前校验 schema、平台和权限并展示变更预览。

## 延期验证

- [ ] 在支持的 macOS 版本真机覆盖 Finder、截图、网络、Dock/系统开关和默认浏览器的 read-after-write、权限拒绝与回滚。
