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

Remote 仅表示网络连通性，不能推断远端进程或开放破坏性操作。实现使用 Tokio TCP connect 直接探测，单端口包含 DNS 解析在内最多等待 3 秒，支持 IPv4 / IPv6 和带方括号 IPv6 输入，不依赖 `nc` 或系统代理。模式切换必须清除不兼容选择和详情状态。

## 3. 数据流

```text
controls -> controller -> use-case -> repository -> typed IPC -> Rust scan/process adapter
```

- controller 负责搜索、排序、模式、选择和详情。
- use-case 负责输入校验、结果映射和操作编排。
- store 只保存共享状态和简单 setter。
- 扫描、轮询和告警必须防重入，并在 effect 卸载时清理 listener/timer。
- 告警仅在用户主动开启时检查/请求系统通知权限；拒绝或发送失败要保持/切回关闭状态并显示独立的本地化说明，不能让开关显示启用但静默丢弃通知或覆盖扫描/Kill 错误。最后一个端口移除、清空或切换模式时关闭告警，新增端口不自动启用旧监控意图。

## 4. Kill 安全

- Kill 仅允许 Local 模式和后端当前扫描得到的 PID。
- 前端必须使用 `DestructiveConfirmDialog` 展示 PID、进程名和影响。
- 后端必须校验扫描时身份；身份缺失/空白、PID 0 或同一 PID 的身份互相冲突时 fail-closed。
- 批量目标按 PID 去重且限制最多 100 个；同一进程占用多个端口只终止一次，结果显示在全部关联端口。
- 后端需重新检查进程仍存在，且扫描身份标识（PID、名称、OS 原生高精度创建时间与可执行文件路径的 SHA-256）一致；名称相同但 PID 已复用也必须拒绝。macOS 用 `proc_pidinfo` 微秒时间，Windows 用 `GetProcessTimes` 的 100ns FILETIME，Linux 用 `/proc/<pid>/stat` 启动 tick，并与 `sysinfo` 的秒级快照交叉校验。原生时间或可执行文件信息不可用时 fail-closed。Unix 对每个后代 PID 在发信号前再次比较扫描身份，身份变化或不可用时拒绝该后代；这些检查仍无法与 PID 信号原子绑定，平台权限及复用行为仍需真机验收。
- Kill 在途期间禁用重扫、移除和其他入口；扫描期间禁用 Kill 和单端口重扫。控制器按端口单飞，并用请求 ID + `scanSession` 校验回写；移除后重加同一端口、切换模式/主机或清空时，旧响应不得写入当前行。
- 结果区分成功、权限不足、已退出、受保护和失败；禁止只写 console。
- 批量或进程树操作需要明确父子进程顺序与部分失败结果；每次仅刷新一份系统进程快照，批量终止对该快照只构建一次父子索引，避免重复全量扫描。

## 5. 性能与 UX

- 长列表必须虚拟化；动态行高变化后重新测量。
- 进程树初始响应只含所有 owner 的合并祖先路径；为首屏可见节点和按页返回的直接子节点尽力生成身份快照，分支展开时用当前父节点的 PID、名称、PPID 和可用身份复核后再加载直接子节点，每页最多 100 个。折叠再展开保留已加载页，不得以 offset 页替换首屏。失败显示重试与重新扫描说明，分页结果不得覆盖 owner 的扫描时 Kill 身份。
- 进程树按需展开，不为所有 PID 预加载完整子树；大进程树还需在 500+ 进程的 macOS / Windows 真机验收构建、IPC 体积和虚拟滚动 DOM 数量。
- Occupation alert 单飞轮询；以当前模式、Remote 主机和端口集合为范围建立基线，只通知范围内新占用。权限检查期间目标变化时跳过旧范围的请求派发；已经发出的请求若目标变化则丢弃过期结果。仅全部受监控端口都有成功观测时更新基线，缺行或单端口错误视为未知并保留最近完整基线，关闭或卸载时清理轮询。
- Remote 主机变化递增 scan session 并清除旧结果；在途响应不得覆盖新目标状态。
- Local 查询每批只读取一次系统 socket 列表；macOS 使用 `lsof` 结构化字段，TCP 仅计入本地 LISTEN、UDP 仅计入本地绑定端口，不能把外连连接的远端端口当成本机占用；Windows 使用一次 `netstat -ano` 快照并筛选本地监听地址。权限/运行错误、非零退出或匹配行结构/PID 格式异常都作为查询失败呈现，不得因空 stdout 被折叠为空闲；进程父链/子树遍历要有环保护。
- `lsof` / `netstat` 查询最多等待 10 秒；进程终止命令最多等待 10 秒。子进程 stdout/stderr 各自最多捕获 1 MiB；捕获达到上限按结果不完整报错，不可继续解析成部分或空闲快照。超时 / 取消清理必须有界：Unix 对隔离进程组发送 SIGKILL，防止忽略 SIGTERM 的后代继续持有输出管道；Windows `taskkill` 辅助进程等待最多 1 秒，超时报告终止失败并提示重扫确认实际进程状态。Windows 实机行为仍待验收。
- 重扫保留旧结果并显示刷新状态；首次加载使用与列表一致的 skeleton。
- 搜索和排序使用 memoized 派生数据，避免每行重复计算 fingerprint。

## 6. 历史与持久化

- 历史记录只保存端口、host、模式和时间等非敏感信息。
- 设置容量上限，损坏数据回退为空并保留可诊断错误。
- 远端 host 输入必须标准化并限制长度，不进入 shell 字符串。

## 7. 修改检查表

- [x] Local/Remote 能力边界未被绕过。
- [x] Kill 有二次确认、后端复核和结构化结果。
- [x] 轮询/listener 可清理，重复扫描有 guard。
- [x] 大列表保持虚拟化，空/错/刷新状态完整。
- [x] IPC 双边契约、关键前端测试和 Rust 测试通过。
- [x] 未完成优化只记录在 [roadmap.md](./roadmap.md)。

以上勾选表示代码结构与静态自动化检查通过；操作系统权限 / 进程身份复用和 500+ 进程性能仍按上文单独要求真机验收，不由本检查表替代。
