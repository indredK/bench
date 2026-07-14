# Port Manager 技术设计

> 端口与进程数据以 Rust 返回值为准；本文只记录模式、安全和性能约束。

## 1. 模块边界

| 层                  | 位置                                                     |
| ------------------- | -------------------------------------------------------- |
| 页面/controller     | `src/features/port-manager/`                             |
| use-case/repository | `services/port-manager.*`                                |
| 历史/告警           | `hooks/usePortHistory.ts`、`usePortOccupationAlerts.ts`  |
| 后端                | `src-tauri/src/port_manager/`                            |
| IPC                 | `src/lib/tauri/commands/port-manager.ts`、`contracts.ts` |

`commands.rs` 提供扫描与进程操作，`processes.rs` 解析进程树，`fingerprints.rs` 识别常见服务。

## 2. Local 与 Remote 模式

| 能力           | Local | Remote |
| -------------- | ----- | ------ |
| 端口连通性检查 | 是    | 是     |
| PID/进程树     | 是    | 否     |
| Kill           | 是    | 禁止   |
| 历史记录       | 是    | 是     |

Remote 仅表示网络连通性，不能推断远端进程或开放破坏性操作。模式切换必须清除不兼容选择和详情状态。

## 3. 数据流

```text
controls -> controller -> use-case -> repository -> typed IPC -> Rust scan/process adapter
```

- controller 负责搜索、排序、模式、选择和详情。
- use-case 负责输入校验、结果映射和操作编排。
- store 只保存共享状态和简单 setter。
- 扫描、轮询和告警必须防重入，并在 effect 卸载时清理 listener/timer。

## 4. Kill 安全

- Kill 仅允许 Local 模式和后端当前扫描得到的 PID。
- 前端必须使用 `DestructiveConfirmDialog` 展示 PID、进程名和影响。
- 后端需重新检查进程仍存在，避免 PID 复用导致误杀。
- 结果区分成功、权限不足、已退出、受保护和失败；禁止只写 console。
- 批量或进程树操作需要明确父子进程顺序与部分失败结果。

## 5. 性能与 UX

- 长列表必须虚拟化；动态行高变化后重新测量。
- 进程树按需展开，不为所有 PID 预加载完整子树。
- Occupation alert 以首次扫描为基线，只通知新占用，关闭时清理轮询。
- 重扫保留旧结果并显示刷新状态；首次加载使用与列表一致的 skeleton。
- 搜索和排序使用 memoized 派生数据，避免每行重复计算 fingerprint。

## 6. 历史与持久化

- 历史记录只保存端口、host、模式和时间等非敏感信息。
- 设置容量上限，损坏数据回退为空并保留可诊断错误。
- 远端 host 输入必须标准化并限制长度，不进入 shell 字符串。

## 7. 修改检查表

- [ ] Local/Remote 能力边界未被绕过。
- [ ] Kill 有二次确认、后端复核和结构化结果。
- [ ] 轮询/listener 可清理，重复扫描有 guard。
- [ ] 大列表保持虚拟化，空/错/刷新状态完整。
- [ ] IPC 双边契约、关键前端测试和 Rust 测试通过。
- [ ] 未完成优化只记录在 [roadmap.md](./roadmap.md)。
