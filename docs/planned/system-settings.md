# System Settings（系统设置）规划功能

> 本文件记录 system-settings 模块**未实现 / 待验证**的功能规划，与 `../product-specs/system-settings.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 来源：`../modules/system-settings/roadmap.md`、`design.md`、`docs/ROADMAP.md` R03。

## 待实现（Backlog）

- [ ] **评估「隐藏桌面」候选**：确认系统版本与可逆性后再实现（当前 `hideDesktopIcons` 为受控开关，候选指更彻底方案）。
- [ ] **设置导入 / 导出**：写入前校验 schema、平台和权限，并展示变更预览。

## 待验证（真机）

### 自启动机制（D-019）

- [ ] 真机验证：开启自启动 → 重启登录后 Bench 以 `--hidden` 静默启动，驻留程序坞（Regular），不弹窗；点击 Dock 图标唤出主窗口。
- [ ] 真机验证：`~/Library/LaunchAgents/com.bench.app.plist` 在系统设置「允许在后台」可见且可停用；应用内开关读写回读一致。
- [ ] 旧版 System Events 登录项用户迁移验证：应用内关闭再开启自启动后，旧登录项被清理，开机无双实例。
- [ ] 确认 `get_login_items` / `remove_login_item`（System Events，用户触发查看「登录项」页面用）的授权弹窗文案与频次可接受，或评估替代 API。

### 延期验证（R03 关联）

- [ ] 在支持的 macOS 版本真机覆盖 Finder、截图、网络、Dock/系统开关和默认浏览器的 **read → write → read-after-write → rollback**、权限拒绝与回滚。
- [ ] 各设置项权限拒绝 / unsupported / 写入失败 / 重启后状态均有 UI；失败不显示为 off/成功。

## 远期

- [ ] 新增设置遵循「新增设置流程」（design §7）：真机确认控制接口 → 领域 adapter → IPC 契约 → 接线 → i18n/权限/失败态/测试 → 更新 roadmap。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：首版生成——依据 `docs/modules/system-settings/roadmap.md` 与 `docs/ROADMAP.md` R03/D-019 提取未完成项；产品说明见 `../product-specs/system-settings.md`。
