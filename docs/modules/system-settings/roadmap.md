# System Settings Roadmap

新增设置必须遵守 [design.md](./design.md) 的平台、权限、读写回读和键位映射规则。

## Backlog

- [ ] 评估“隐藏桌面”候选；确认系统版本与可逆性后再实现。
- [ ] 设置导入/导出；写入前校验 schema、平台和权限并展示变更预览。

## 自启动机制（D-019）

- [ ] 真机验证：开启自启动 → 重启登录后 Bench 以 `--hidden` 静默启动，驻留程序坞（Regular），不弹窗；点击 Dock 图标唤出主窗口。
- [ ] 真机验证：`~/Library/LaunchAgents/com.bench.app.plist` 在系统设置「允许在后台」可见且可停用；应用内开关读写回读一致。
- [ ] 旧版 System Events 登录项用户迁移验证：应用内关闭再开启自启动后，旧登录项被清理，开机无双实例。
- [ ] 确认 `get_login_items`/`remove_login_item`（System Events，用户触发查看「登录项」页面用）的授权弹窗文案与频次可接受，或评估替代 API。

## 延期验证

- [ ] 在支持的 macOS 版本真机覆盖 Finder、截图、网络、Dock/系统开关和默认浏览器的 read-after-write、权限拒绝与回滚。
