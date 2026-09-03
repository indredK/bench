# Clean Space（清理空间）规划功能

> 本文件记录 clean-space 模块**未实现 / 待验证**的功能规划，与 `../product-specs/clean-space.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。

## 待验证（真机）

- [ ] macOS 真机覆盖：权限拒绝、受保护目录、自定义目录、Docker/find timeout、取消、目录占用、只读文件（来源：roadmap「延期验证」+ 全局 R03）。
- [ ] 清理前后重新测量真实磁盘占用；总释放量只累计成功项，partial 保留失败项并可重试（R03）。
- [ ] symlink 逃逸、跨卷 `du` 归属、APFS 容器级 used 计算在真机与「系统设置 → 存储空间」交叉比对。

## 待实现（代码缺口）

- [ ] **自定义目录清理结果接入清理执行**：`CustomFolderCleanerTool` 目前只扫描并展示（结果项 `category_id=custom_folder`、`command=remove_path`、`is_cleanable=true`），界面没有「清理选中」按钮与二次确认；后端 `executeCategoryCleanup` 的 `custom_folder` 白名单分支已就绪，补前端入口即可闭环。

## 远期

- [ ] **Windows 扩展**：先抽象 `PlatformStorageScanner`、独立删除白名单和 `supported/partial/failed` contract；2.0.0 不承诺该平台。
- [ ] **智能建议**：需先定义隐私、活跃度信号和可解释规则，再做「建议清理」排序与推送。
- [ ] **定时提醒**：需支持关闭、频率控制和系统权限失败反馈。
- [ ] **Undo（撤销清理）**：需先设计隔离区、容量上限、过期和跨卷恢复语义。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成本产品说明与规划文档——梳理流式扫描/清理白名单/确认弹窗/进度与记录全链路；标注自定义目录清理执行入口缺失。
