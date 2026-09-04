# Account Manager（账号管理）

> **完备功能规格** → [product-specs/account-manager.md](../../product-specs/account-manager.md)
> **规划功能** → [planned/account-manager.md](../../planned/account-manager.md)

代码：`src/features/account-manager/` · `src-tauri/src/account_manager/`

定位：集中管理「站点（RelayStation）+ 隔离账号（StationAccount）」——保存凭据、捕获/恢复登录 Session、探测登录状态、外部 App 登录代理、导入导出；凭据以系统 Keyring 主密钥 + AES-256-GCM 加密，账号数据目录隔离，Session 恢复后须 probe 才标记 Ready。

| 文档                     | 说明                                        |
| ------------------------ | ------------------------------------------- |
| [design.md](./design.md) | Session、加密、探针和登录代理的长期安全边界 |
