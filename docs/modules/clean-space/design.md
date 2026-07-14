# Clean Space 技术设计

> 交互参考保留在 `clean-space-prototype.html`；本文只记录当前实现和安全边界。

## 1. 模块职责

Clean Space 是唯一的顶层清理入口，包含存储总览、分类详情、开发项目清理、自定义文件夹和清理记录。`dev-cleaner` 仅作为其复用的扫描/清理引擎。

| 层                  | 位置                                                       |
| ------------------- | ---------------------------------------------------------- |
| 页面/controller     | `src/features/clean-space/`                                |
| use-case/repository | `services/clean-space.*`                                   |
| 共享清理引擎        | `src/features/dev-cleaner/`                                |
| 后端                | `src-tauri/src/clean_space/`、`src-tauri/src/dev_cleaner/` |
| IPC                 | `src/lib/tauri/commands/clean-space.ts`、`contracts.ts`    |

## 2. 应用结构

- 顶部 tab：总览、开发项目、自定义文件夹、清理记录。
- `StorageOverview`：磁盘摘要、分类和快速刷新。
- `CategoryDetail`：按需加载分类明细、排序和选择。
- `CleanupConfirmSheet`：展示影响范围和风险确认。
- `CleanupProgress`：逐项进度、日志和最终结果。
- `CleanupRecords`：有上限的历史记录。

扫描中允许浏览旧数据和进入已知分类，但写操作必须按任务冲突策略禁用。

## 3. 扫描模型

macOS 使用混合扫描：

1. APFS/df 容量和最近精确缓存快速返回总览。
2. 后台 `du` 精扫并按分类事件刷新。
3. 分类详情按需扫描，避免首屏遍历所有文件。

强制约束：

- 阻塞命令进入 `spawn_blocking`，外部进程有 timeout。
- 路径通过参数数组传递，不拼接 shell 字符串。
- 父子分类遵循“更具体路径优先”，避免重复计数。
- 结果必须区分快照、精确值、partial、unsupported 和失败。
- Windows/Linux 未实现时返回 unsupported，不伪造空扫描成功。

## 4. 清理安全模型

`StorageItem` 显式携带 `is_cleanable`、`protection_kind` 和 `protection_reason`。风险等级只用于解释，不能决定能否删除。

清理流程：

```text
前端选择可清理项 -> 确认影响 -> 提交 category/id/path -> 后端 canonicalize
-> 后端映射 CleanupAction 白名单 -> 逐项执行 -> 记录结果
```

- 后端不信任前端 command 字符串。
- 只允许 Home 目录内受控缓存、日志、废纸篓、下载直接子项和已定义开发缓存等动作。
- 系统文件、Keychain、App State、应用包、跨用户数据和未知路径默认拒绝。
- 高风险操作要求额外确认；部分失败分别报告，不得把失败项计为已释放空间。
- 自定义目录必须 canonicalize，拒绝保护根、符号链接逃逸和超出授权范围的路径。

## 5. 状态与事件

- 共享 store 保存 active tab、overview、selection、progress 和 records。
- 开发项目清理保留独立 store，避免不同数据域共享筛选状态。
- 扫描事件携带任务身份；旧任务事件不得覆盖新状态。
- listener/timer 在卸载时清理；重复扫描和清理必须防重入。
- 清理完成后只刷新一次总览并追加一条有界记录。

## 6. 国际化与 UX

- 分类名称、风险、保护原因和状态使用 canonical value + i18n 映射。
- 首载 skeleton 匹配环形图和分类列表；重扫保留旧数据。
- 空、错误、partial、unsupported、取消和完成状态必须可见。
- 列表文本支持截断和 title；危险操作使用统一确认组件或功能专用确认 sheet。

## 7. 平台扩展

平台实现留在 Rust adapter，前端 DTO 保持平台无关。新增 Windows/Linux scanner 时不得修改现有清理授权语义，也不得把平台路径暴露为前端可执行命令。

## 8. 修改检查表

- [ ] 新分类无重复计数，并明确 cleanability/protection。
- [ ] 新清理动作进入后端白名单并有拒绝测试。
- [ ] 路径、symlink、权限、磁盘变化和部分失败有边界测试。
- [ ] 新 IPC 同步 TS/Rust 契约并返回结构化错误。
- [ ] i18n、关键前端测试、Rust 测试和文档门禁通过。
- [ ] 未完成能力只记录在 [roadmap.md](./roadmap.md)。
