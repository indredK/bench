# Dev / Prod 共存策略

> 开发版（`cargo tauri dev`）与正式版共享 bundle identifier（`com.bench.app`），导致系统资源部分共享、部分隔离。以下列出具体影响，避免误判为 bug。

## 共享的资源

| 资源       | 路径 / 机制                                          | 影响                                                                       |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Store 文件 | `~/Library/Application Support/com.bench.app/*.json` | 设置（关闭行为、token pricing 等）两边互通；**并发写入时后保存者覆盖前者** |
| 账号数据   | 同上（Account Manager 持久化）                       | 账号互通，正式版可直接使用 dev 中导入的账号                                |
| Keychain   | macOS Keychain, 按 bundle id 索引                    | 共享密钥项                                                                 |
| 窗口状态   | Tauri 自动保存的窗口位置/大小                        | 两边会互相覆盖窗口布局                                                     |
| Deep Link  | `bench-auth://` scheme 注册                          | 两边都注册同一 scheme，macOS 只路由给最后注册的实例                        |

## 隔离的资源

| 资源       | 生产版                    | 开发版                               |
| ---------- | ------------------------- | ------------------------------------ |
| 二进制路径 | `/Applications/Bench.app` | `target/debug/Bench.app`（按需创建） |
| 自启登录项 | 按路径独立，互不干扰      | 同上                                 |
| 托盘图标   | 各自独立显示              | 同上                                 |
| 进程       | 各自独立进程              | 同上                                 |

## 关键风险

### 1. Store 并发写

`tauri-plugin-store` 没有进程级文件锁。两个版本同时运行且都修改 store 时，后保存的写入会覆盖先保存的。实际触发场景少（store 只在设置变更时写入），但需要注意。

### 2. Deep Link 竞态

两边都通过 `tauri_plugin_deep_link` 注册 `bench-auth://`。macOS 只能将 URL scheme 路由给一个进程。如果两个版本都在运行，点 `bench-auth://authorize?target=...` 链接可能不路由到预期进程。

### 3. 数据格式向后兼容

如果 dev 修改了 store 的 key 或 value 格式，正式版可能无法正确读取。修改 store 结构时需要做兼容处理。

### 4. 无单例锁

两版本可以同时运行，各自有独立托盘图标。这不是 bug，是设计使然。

## 最佳实践

1. **不同时运行两个版本** — 这是最简单可靠的策略
2. **如需完全隔离** — 修改 `tauri.conf.json` 中 `identifier` 为 `com.bench.dev`，代价是设置和账号不互通
3. **修改 store 结构时** — 确保向后兼容，或清除 store 文件后再测试
4. **自启登录项已按路径隔离** — 各版本管理的登录项互不影响（见 `login_items.rs:remove_login_item_by_path`）
