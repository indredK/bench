# Account Manager（账号管理）规划功能

> 本文件记录 account-manager 模块**未实现 / 待验证**的功能规划，与 `../product-specs/account-manager.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 长期安全边界与参考实现见 `../modules/account-manager/design.md`；执行顺序见全局路线图 [R01](../ROADMAP.md#r01-account-manager-代码收口) 与 [R04](../ROADMAP.md#r04-account-manager-双平台真机矩阵)。

## 待实现（代码阻断）

- [ ] 将同账号 single-flight、429/5xx 重试预算、Cookie scope、Deep Link 多 URL/去重和平台行为测试接入 macOS/Windows CI runner。

## 待验证（真机，全新 macOS 测试用户 + Windows Sandbox/VM，禁用生产账号）

### 1. Keyring、持久化与重启

- [ ] 两平台首次创建账号、保存密码与 Session；完全退出重启后密码可按需 reveal、Session 恢复后 probe 为 Ready。
- [ ] 两个进程并发触发首次主密钥与账号写入；重启后只有一个 canonical key、全部密文可解、revision 单调无覆盖。
- [ ] 拒绝 Keychain/Credential Manager：capability 返回 `failed`，页面可重试，不创建伪成功 Session。
- [ ] 记录卸载 / 重装后系统凭据的真实生命周期；不得为“修复”手工删除系统凭据。

### 2. Cookie、Web Storage 与 IndexedDB

- [ ] 账号 A 捕获状态后备份/重命名测试 WebView data directory，保留加密 store，重启后强制从 canonical Session 恢复（HttpOnly Cookie、expiry、local/session storage、database/store/index/key/record）。
- [ ] 导航 fixture B 时 A 数据不可见；两账号反复切换/重启互不可见。
- [ ] 提升 schema version 或修改 store/index 后恢复必须 fail-closed，不覆盖现有数据库。
- [ ] 超限（512 key/2 MiB、32 database、128 store、10000 record/8 MiB）与 Blob/CryptoKey/循环引用返回 limited/failed，旧 Session 不被半截快照覆盖。
- [ ] Partitioned Cookie 继续不进入 HTTP probe；Tauri 未提供 partition key 前不得改为普通 Cookie 发送。

### 3. Probe、批量与隔离

- [ ] HTTP/WebView/Hybrid 策略真实改变执行；timeout 可取消、只重试规定瞬态错误、预算不超设计值。
- [ ] 同账号并发刷新只运行一个 leader；leader 取消/drop 后 follower 拿到结构化结果且 registry 清理。
- [ ] 批量 partial/cancel/retry 每账号恰好落入 succeeded/failed/cancelled；失败账号保留旧数据。
- [ ] coexisting/exclusive/rotating 的状态、Cookie 与 data store 语义一致，账号间不共享浏览上下文。

### 4. Deep Link 与 Auth Proxy

- [ ] App 未运行时连续两个 `bench-auth://` 请求：主窗口启动、FIFO 正确、第二实例退出、原始 URL 不进 renderer 日志。
- [ ] 已运行时重复 URL 在去重窗口内只处理一次；超过 32 条报告 dropped。
- [ ] 合法/非法回调（scheme/host/port/path、伪 loopback、过期 ticket、重放）均按预期接受/拒绝。
- [ ] 跨 origin 或跳转后的自动填充被拒绝；密码只在后端精确 origin 校验后的单次操作中解密。
- [ ] Windows `networkProxy` 显示 `unsupported`；UI 与直接 IPC 都拒绝非空代理，失败不直连、不打开共享浏览器；已有配置可清除。

### 5. 删除、UX 与 capability

- [ ] 删除账号关闭窗口并逐项报告 metadata/secret/Session/binding/data directory；partial 不影响其他账号。
- [ ] 首载 skeleton、区域 retry、窄屏 Detail Sheet、500+ 虚拟列表、中英文长文本、Tab/Escape/焦点恢复均通过。
- [ ] 平台相关用例全部通过并有证据后，才把 `capabilities.rs` 对应项从 `partial` 改为 `supported` 并补平台行为测试。

## 远期

- [ ] **可移植加密导出**：实现 passphrase + KDF + AEAD 的可移植格式；当前 renderer 只能请求 sanitized export，后端继续拒绝 `encryptedFull`。
- [ ] **指纹隔离评估**：评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得降低 origin、账号隔离或日志脱敏边界。
- [ ] **云同步**：先提交独立 RFC，只允许 BYO endpoint、客户端加密、版本迁移、冲突与删除语义；不得内置维护者公共服务。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成产品说明与规划功能文档（依据 `src/features/account-manager/`、`src-tauri/src/account_manager/`、`docs/modules/account-manager/` 与 ROADMAP R01/R04）。
