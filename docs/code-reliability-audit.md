# Bench 代码可靠性审计报告

| 项目 | 值                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 日期 | 2026-08-04                                                                                             |
| 范围 | 全量代码可靠性审计（前端 + Rust 后端）                                                                 |
| 方法 | 静态模式扫描 + 逐点人工确认 + 验证链基线                                                               |
| 基线 | `cargo clippy` 零警告；`pnpm run lint:fe` 通过；`pnpm run test:critical` 117/117；`cargo test` 334/334 |

---

## 审计维度与结论总览

| 维度                                 | 结论                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| IPC 错误边界（`AppResult<T>`）       | ✅ 全部命令使用 `AppResult`；仅 1 处 IPC 路径存在 Mutex 中毒 panic 隐患（见 R1）                                                               |
| `.unwrap()` / `.expect()` / `panic!` | ✅ 非测试代码仅 4 处：3 处有前置守卫（逻辑安全），1 处为启动链末端（audit-report 决策 #6 豁免）；1 处 `unreachable!()` 依赖隐式不变式（见 R3） |
| 子进程执行                           | ✅ 超时 / 中止 / 进程组终止 / 输出引流齐全；⚠️ 输出捕获无上限（见 R2）                                                                         |
| 持久化                               | ✅ 原子写 + 文件大小上限 + schema 版本校验 + 损坏降级（command_center/persistence）                                                            |
| 前端错误处理                         | ✅ 无散装错误判断，统一 `parseCommandError` / `getErrorMessage`                                                                                |
| 前端重入保护                         | ✅ 写/运行操作经 `useGuardedAsync` / `useGuardedAsyncSet`（command-center 另有全局互斥锁）                                                     |
| 资源清理                             | ✅ 事件监听 / 长定时器均有 ref + cleanup；⚠️ 少量短反馈定时器无清理（见 R4）                                                                   |
| Zustand 订阅                         | ✅ 未发现无 selector 整 store 订阅进入 hook 依赖                                                                                               |
| 平台边界                             | ✅ `invoke` 仅出现在 `lib/tauri/invoke.ts`；`isTauri` 仅出现在 `platform/runtime.ts`                                                           |

---

## 发现的问题

- [ARCH §2.9] `src-tauri/src/command_center/commands.rs:68,107` — `run_command_card` / `cancel_command_card` 在 IPC 命令路径使用 `flag.0.lock().unwrap()`，若锁中毒（持锁线程 panic）将导致命令 panic 而非返回错误 — 改用 `into_inner()` 恢复守卫 — **强制** — 状态：已修复
- [可靠性/资源上限] `src-tauri/src/subprocess.rs:95-106` — `run_output_with_timeout` 对子进程 stdout/stderr 无上限捕获（`read_to_end`）；命令中心可执行任意用户命令，`cat 大文件` 类命令会无限膨胀内存并经 IPC 序列化放大 — 每路输出设 1 MiB 上限并截断 — **强制** — 状态：已修复
- [ARCH §2.9 潜在] `src-tauri/src/account_manager/capabilities.rs:97` — 生产路径 `unreachable!()`：虽被第 53 行早退守卫（Other 平台提前返回）保护，但依赖隐式不变式，后续重构易引入 panic — 改为与 Windows 相同的 `unsupported` 分支 — **建议** — 状态：已修复
- [§3 Effect 清理] `src/features/terminology/page.tsx:60,127` — `WebsiteChip` / `TermCard` 复制反馈的 `setTimeout(() => setCopied(false), 1500)` 未持 ref、组件卸载后仍会 setState（列表卡片卸载概率高） — 用 ref 持有 timer 并在 unmount 清理 — **建议** — 状态：已修复

## 确认安全、不计违规的点

- `src-tauri/src/persistence.rs:130` — `last_err.unwrap()` 由循环不变式保证（最后一次迭代必经 `Some(error)` 分支），逻辑安全，保留。
- `src-tauri/src/net_probe/discovery.rs:71` — `primary.unwrap()` 前有 `is_none()` 早退守卫，逻辑安全，保留。
- `src-tauri/src/lib.rs:258` — 启动链末端 `.expect()`，audit-report 决策 #6 豁免。
- `src-tauri/src/command_center/exec.rs` — 命令中心执行任意 shell 属产品设计（用户自建卡片），且已有超时 300s、中止标志、进程组终止、Windows `start` 禁用、提权转义等防护。
- 各模块短 UI 反馈定时器（`setCopied(false)` 类，如 account-manager/shared.tsx:74）为既有普遍模式，除 R4 所列高频卸载场景外不逐处整改。

## 验证链结果（修复后）

```
pnpm run lint:fe      # 通过
pnpm run test:critical # 117/117 通过
cargo clippy -- -D warnings # 零警告
cargo test             # 334/334 通过
```
