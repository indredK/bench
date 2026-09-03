# 持久化 Schema 清单

> GAP-TO-2.0 A5-2 / ROADMAP R06 步骤 1 交付物。列出全部已确认的持久化文件: owner 模块、schema 版本、大小上限、失败策略。与代码不一致时以代码为准并回改本清单。路径基准: `app_data_dir` / `config_dir` (下表省略前缀)。

| 文件                                               | Owner 模块                                                                    | Schema 版本                                            | 大小上限                                     | 失败策略                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `account-manager-store.json`                       | `account_manager` ([storage.rs](../src-tauri/src/account_manager/storage.rs)) | v5 (`CURRENT_SCHEMA`)                                  | 16MB (`ensure_file_size`)                    | 启动校验 schema, 未来版本拒绝; 明文 secrets 迁移重加密; 迁移前 `backup_file` 保留 3 份备份; 文件锁防并发写 |
| `bench/app-manager/inventory.json`                 | `app_manager` ([commands.rs](../src-tauri/src/app_manager/commands.rs))       | v1 (`schemaVersion`, serde default 兼容旧格式)         | 16MB (超限剥离 `iconBase64`, 仍超限拒绝缓存) | 损坏 JSON / 未来 schema → 丢弃缓存 + 重新扫描; 缓存丢失不影响功能                                          |
| `bench/command-center/cards.json`                  | `command_center` ([storage.rs](../src-tauri/src/command_center/storage.rs))   | v1                                                     | `ensure_file_size` 上限                      | schema 缺失/未来版本 fail-closed 抛错                                                                      |
| `bench/clean-space/records.json`                   | `clean_space`                                                                 | v1                                                     | `ensure_file_size` 上限                      | 损坏降级为空记录                                                                                           |
| `terminology-store.json`                           | `terminology`                                                                 | v1                                                     | `ensure_file_size` 上限                      | 有版本迁移与测试                                                                                           |
| `token-pricing-store.json`                         | `token_calculator`                                                            | v1                                                     | `ensure_file_size` 上限                      | 损坏降级默认定价                                                                                           |
| `app-preferences.json`                             | `app_preferences` ([storage.rs](../src-tauri/src/app_preferences/storage.rs)) | v1 (`schema_version`, A5-1)                            | —                                            | 未来版本 fail-closed; 缺键/形状异常/文件不可读 → 降级默认值                                                |
| `bench/network-probe/agents.json`                  | `net_probe`                                                                   | v1                                                     | `ensure_file_size` 上限                      | 损坏降级默认 agent 列表                                                                                    |
| `bench/network-probe/defaults-override.json`       | `net_probe`                                                                   | v1                                                     | `ensure_file_size` 上限                      | 损坏降级内置 defaults                                                                                      |
| `photo-triage/config.json`                         | `photo_triage` ([commands.rs](../src-tauri/src/photo_triage/commands.rs))     | v1 (`schema_version`)                                  | 1MB (recent 8 条)                            | 损坏/未来版本 → 降级空列表                                                                                 |
| `photo-triage/build-<md5(src)[:10]>/manifest.json` | `photo_triage` ([scan.rs](../src-tauri/src/photo_triage/scan.rs))             | 无字段 (Python 版逐字节兼容, D-020; 原子写 + 上限治理) | 256MB (`MANIFEST_MAX_BYTES`)                 | 损坏/超限 → 拒绝打开并提示重新扫描; 写入走 `persistence::atomic_write`                                     |
| `photo-triage/build-<md5(src)[:10]>/proxies/*`     | `photo_triage` ([preview.rs](../src-tauri/src/photo_triage/preview.rs))       | 无 (文件非空即复用)                                    | —                                            | 生成失败清 `.part` 临时文件, 下次按需重建                                                                  |

## Dev / Prod 共存约定 (A5-4)

Dev 与正式版共享 bundle identifier `com.bench.app` ([D-011](./DECISIONS.md#d-011--20-保留既有-bundle-identifier)), 因此**共享同一 app-data 目录**是既定设计而非缺陷 (见 [dev-prod-coexistence.md](./dev-prod-coexistence.md)):

- 不存在 "dev/prod 不同数据目录" 的隔离机制, 因此 R06 的 "dev 写入不影响 prod 文件" 不适用于本仓库的既定约定;
- 并发写覆盖风险由 `account-manager-store.lock` 文件锁 (account_manager) 与 store 只在设置变更时写入的现有行为缓解;
- 数据格式向后兼容由上表各 owner 的 schema 迁移 + 版本校验保证 (dev 修改结构必须走版本迁移, 见 R06 步骤 3 与 [D-011] 影响说明)。

若未来引入 dev/prod 目录隔离, 必须先单独设计 identifier 变更 (涉及 Keychain、updater、卸载迁移, 见 D-011)。
