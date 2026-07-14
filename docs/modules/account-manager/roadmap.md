# Account Manager Roadmap

长期安全边界与参考实现见 [design.md](./design.md)。本文件只保留 2.0 未完成项和真机验收步骤；先执行全局路线图 [R01](../../ROADMAP.md#r01-account-manager-代码收口)，再执行 [R04](../../ROADMAP.md#r04-account-manager-双平台真机矩阵)。

## 代码阻断

- [ ] 为 Station、账号列表、详情和 Auth Proxy 补区域 error/retry；刷新保留旧数据，partial 不删除失败账号。
- [ ] 按真实 owner 拆分超大的 Rust `commands.rs`、前端 controller 和 dialogs；不改 IPC 名称，不创建纯转发层。
- [ ] 将同账号 single-flight、429/5xx 重试预算、Cookie scope、Deep Link 多 URL/去重和平台行为测试接入 macOS/Windows CI runner。

## 真机验收准备

在全新 macOS 测试用户和 Windows Sandbox/VM 中执行，禁止使用生产账号。准备两个不同 HTTPS origin 的 fixture A/B；两者写入同名不同值的 Cookie、localStorage、sessionStorage 和 IndexedDB。IndexedDB 至少包含两个 object store、inline/out-of-line key、index、Date、Map、Set、ArrayBuffer/TypedArray 和嵌套对象。

每轮记录 Bench commit、OS/架构、WebView2 版本、capability DTO、步骤、预期/实际、脱敏日志和截图。日志不得出现 Cookie、token、密码或 callback query。

## 真机验收步骤

### 1. Keyring、持久化与重启

- [ ] 两平台首次创建账号、保存密码和 Session；完全退出后重启，密码可按需 reveal，Session 恢复后 probe 为 Ready。
- [ ] 两个进程并发触发首次主密钥和账号写入；重启后只有一个 canonical key，全部密文可解，revision 单调且无覆盖。
- [ ] 拒绝 Keychain/Credential Manager；capability 返回 `failed`，页面显示可重试错误，不创建伪成功 Session。
- [ ] 记录卸载/重装后系统凭据的真实生命周期；不得为“修复”手工删除系统凭据。

### 2. Cookie、Web Storage 与 IndexedDB

- [ ] 账号 A 在 fixture A 捕获状态；备份并重命名其测试 WebView data directory，保留加密 store，重启后强制从 canonical Session 恢复。
- [ ] 验证 HttpOnly Cookie、expiry、local/session storage、database version、store/index/key/record 恢复且 probe 为 Ready。
- [ ] 导航到 fixture B，A 的数据不可见；账号 B 写入不同值后反复切换和重启，两个账号互不可见。
- [ ] 提升 fixture A schema version 或修改 store/index；恢复必须明确失败，不能覆盖现有数据库或标记 Ready。
- [ ] 分别超过 512 Web Storage key/2 MiB、32 database、128 store、10,000 record/8 MiB，并加入 Blob/CryptoKey/循环引用；返回 limited/failed，旧 Session 不被半截快照覆盖。
- [ ] Partitioned Cookie 继续不进入 HTTP probe；Tauri 未提供 partition key 前不得改为普通 Cookie 发送。

### 3. Probe、批量与隔离

- [ ] HTTP/WebView/Hybrid 策略真实改变执行；timeout 可取消，只对规定的瞬态错误重试，总预算不超过设计值。
- [ ] 同账号并发刷新只运行一个 leader；leader 取消或 drop 后 follower 收到结构化结果且 registry 被清理。
- [ ] 批量 partial/cancel/retry 的每个账号恰好落入 succeeded/failed/cancelled；失败账号保留旧数据。
- [ ] coexisting/exclusive/rotating 的状态、Cookie 和 data store 语义一致；账号间不共享浏览上下文。

### 4. Deep Link 与 Auth Proxy

- [ ] App 未运行时连续触发两个不同 `bench-auth://` 请求；主窗口启动、FIFO 正确、第二实例退出，原始 URL 不进 renderer 日志。
- [ ] App 已运行且停留在其他页面时重复测试；重复 URL 在去重窗口内只处理一次，超过 32 条报告 dropped count。
- [ ] custom scheme、IPv4/IPv6 loopback 有效回调通过；错误 state/host/port/path、伪 loopback 域名、过期 ticket 和重放全部拒绝。
- [ ] 跨 origin 或跳转后的自动填充被拒绝；密码只在后端精确 origin 校验后的单次操作中解密。
- [ ] Windows `networkProxy` 显示 `unsupported`；UI 和直接 IPC 都拒绝非空代理，失败不直连、不打开共享浏览器。已有配置可以清除。

### 5. 删除、UX 与 capability

- [ ] 删除账号时关闭窗口并逐项报告 metadata、secret、Session、binding 和 data directory；目录占用显示 partial 且不影响其他账号。
- [ ] 首载 skeleton、区域 retry、窄屏 Detail Sheet、500+ 账号虚拟列表、中英文长文本、Tab/Escape/焦点恢复均通过。
- [ ] 只有某平台相关用例全部通过并有证据后，才把 `capabilities.rs` 对应项从 `partial` 改为 `supported`，同时补平台行为测试。

Windows `networkProxy` 在上游 WebView2/Tauri 提供等价且已验证的代理能力前始终保持 `unsupported`。

## 验证命令

```bash
pnpm run lint:fe
pnpm exec vitest run src/features/account-manager
cargo test --manifest-path src-tauri/Cargo.toml account_manager
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm run test:critical
pnpm run check:docs
git diff --check
```

本机没有对应目标平台时只能写“未验证”，不得勾选真机项。

## 远期

- [ ] 如恢复完整导出，实现 passphrase + KDF + AEAD 的可移植格式；当前 renderer 只能请求 sanitized export，后端继续拒绝 `encryptedFull`。
- [ ] 评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得降低 origin、账号隔离或日志脱敏边界。
- [ ] 云同步先提交独立 RFC，只允许 BYO endpoint、客户端加密、版本迁移、冲突和删除语义；不得内置维护者公共服务。
