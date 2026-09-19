//! 直读本机 Chrome 落盘登录态 —— 互通 I3 的**兜底**入向通道（仅 macOS）。
//!
//! ## 为什么要有这条通道
//!
//! I3（将日常浏览器的登录态搬进 Bench）的主路径是 bench-companion 扩展，代价是
//! 用户必须**手动装一次**扩展（Chrome 137 移除了 `--load-extension`，无法程序化安
//! 装）。本通道不需要任何扩展：直接只读打开 Chrome 自己落盘的 Cookies 库，解密后
//! 交给既有的 [`finalize_capture`](super::finalize_capture) 落进 canonical store。
//!
//! 定位是**兜底而非替代**：Cookie 库只有 cookie，拿不到 localStorage /
//! sessionStorage / IndexedDB，对「令牌存在本地存储里」的站点（trae 的
//! Cloud-IDE-Token、7242 端口的 IDB-only 实测案例）仍然必须走扩展。扩展可用时
//! 一律优先扩展。
//!
//! ## 原先判定「读不到」是错的
//!
//! `docs/explanation/browser-session-extension-plan.md` §6 曾把「直读浏览器
//! Cookies SQLite」列为显式不做，理由是「macOS Keychain Safe Storage + Chrome 130+
//! app-bound encryption」。前者只是**一次钥匙串授权弹窗**，不是墙；后者
//! （App-Bound Encryption）是 Google 2024-07 公告里明确只面向 **Windows** 的
//! （Chrome 127 起，密文前缀 `v20`），macOS 至今仍是老的 Keychain 方案。
//!
//! 本机实测（Chrome 152.0.7977.84 / macOS，3678 条 cookie）：
//! - `encrypted_value` 前缀全部为 `v10`，明文 `value` 列 0 行使用；
//! - 密钥 = 钥匙串 `Chrome Safe Storage` → PBKDF2-HMAC-SHA1(salt `saltysalt`,
//!   1003 轮, 16 字节) → AES-128-CBC，IV 为 16 个 `0x20`；
//! - 解出并去 PKCS7 填充后，**前 32 字节恰为 `SHA256(host_key)`**（抽样 40/40 命中，
//!   剥掉后 40/40 为可打印 ASCII；不剥则 0/40 可读）；
//! - Chrome 正在运行时以 `mode=ro` 打开原库即可读（该库 `journal_mode` 非 WAL），
//!   **不需要退出 Chrome**，也不需要 Full Disk Access。
//!
//! 因此剥摘要这一步刻意写成「**算一遍摘要比对，相等才剥**」而不是无条件砍掉前 32
//! 字节：Chrome 一旦改格式，我们会得到「解不出/非 UTF-8」的显式失败，而不是静默把
//! 每个值截掉 32 字节存进 store。
//!
//! ## 边界
//!
//! - 只读：全程 `SQLITE_OPEN_READ_ONLY`，不写、不改、不复制用户浏览器数据。
//! - 只覆盖 Chrome 系且只认 `Chrome Safe Storage` 这一把钥匙（Edge/Brave 用各自的
//!   钥匙串条目，未实现即报不可用，不猜）。
//! - 解出的明文只存在于 Rust 内存，随即按站点交给自己那套加密（Keychain 主密钥 +
//!   AES-256-GCM）落盘；不进 renderer、不落明文、不进日志（与 design.md §5 一致）。
//! - 分区（CHIPS）cookie 与已过期 cookie 一律丢弃并计数，与 CDP / 扩展两条链路的
//!   fail-closed 口径相同。
//! - 钥匙串读取只在用户显式点「导入」时发生，不在启动路径（architecture.md §2 第 12
//!   条：启动关键路径不得调用会触发 TCC / 钥匙串弹窗的东西）。

use crate::account_manager::types::{AccountManagerError, AccountManagerResult, CookieEntry};

/// 本机能找到的 Chrome 登录态来源概要（供前端决定是否展示兜底入口）。
#[derive(Debug, Clone)]
pub struct ChromeStoreAvailability {
    /// 可读取的 Chrome profile 数量（0 = 没找到可用的 Cookies 库）。
    pub profile_count: usize,
    /// 探测到的 Chrome 版本（`CFBundleVersion`），仅用于向用户交代读的是哪个浏览器。
    pub chrome_version: String,
}

/// 一次站点级导入的结果。
#[derive(Debug, Clone)]
pub struct ChromeStoreImport {
    pub cookies: Vec<CookieEntry>,
    /// 命中站点但因分区作用域 / 已过期 / 解不出而被丢弃的条数。
    pub skipped_partitioned: usize,
    pub skipped_unusable: usize,
    /// 实际读取过的 profile 数（多 profile 时逐个试，取有命中的第一个）。
    pub profiles_read: usize,
}

/// 该通道在当前平台是否可用（不可用时给出稳定 reasonCode，供前端隐藏入口）。
pub fn availability() -> Result<ChromeStoreAvailability, AccountManagerError> {
    #[cfg(target_os = "macos")]
    {
        macos::availability()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(AccountManagerError::unsupported(
            "CHROME_IMPORT_PLATFORM_UNSUPPORTED",
        ))
    }
}

/// 读取 `site_host` 所在可注册域的全部 Chrome cookie。
///
/// `site_host` 是站点主页的 host（不含 scheme）。过滤口径与扩展 / CDP 通道**共用同
/// 一条** [`super::super::session::hosts_share_registrable_domain`]，不再新增第四份
/// 「可注册域」近似实现。
pub fn import_site_cookies(site_host: &str) -> AccountManagerResult<ChromeStoreImport> {
    #[cfg(target_os = "macos")]
    {
        macos::import_site_cookies(site_host)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = site_host;
        Err(AccountManagerError::unsupported(
            "CHROME_IMPORT_PLATFORM_UNSUPPORTED",
        ))
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{ChromeStoreAvailability, ChromeStoreImport};
    use crate::account_manager::session::hosts_share_registrable_domain;
    use crate::account_manager::types::{AccountManagerError, AccountManagerResult, CookieEntry};
    use std::path::{Path, PathBuf};

    /// Chrome 在 macOS 上存放主密钥的钥匙串条目（generic password）。
    const KEYCHAIN_SERVICE: &str = "Chrome Safe Storage";
    const KEYCHAIN_ACCOUNT: &str = "Chrome";
    /// Chromium `OSCrypt` 的固定 PBKDF2 参数（macOS / Linux 共用一套常量）。
    const PBKDF2_SALT: &[u8] = b"saltysalt";
    const PBKDF2_ROUNDS: u32 = 1003;
    const KEY_LEN: usize = 16;
    /// CBC 的 IV：16 个 `0x20`（Chromium 硬编码）。
    const IV: [u8; KEY_LEN] = [0x20; KEY_LEN];
    /// 密文版本前缀（`b"v10"`）。
    const V10: &[u8] = b"v10";
    /// Chrome epoch（1601-01-01）与 Unix epoch 的秒差：**11,644,473,600**。
    /// 少一位/多一位都不会编译报错，只会让所有带过期时间的 cookie 被判成
    /// 「早已过期」而整站丢光 —— 所以下面的单测刻意用写死的真实值校验。
    const CHROM_EPOCH_DELTA_SECS: i64 = 11_644_473_600;
    /// 明文前缀摘要长度：`SHA256(host_key)`。
    const DIGEST_LEN: usize = 32;

    /// Chrome 的 user-data-dir 候选（本机实测：profile 的 cookie 库在
    /// `Default/Cookies`，另有版本放在 `Default/Network/Cookies`，两种都试）。
    fn cookie_databases() -> Vec<PathBuf> {
        let Some(home) = dirs::home_dir() else {
            return Vec::new();
        };
        let roots = [home.join("Library/Application Support/Google/Chrome")];
        let mut found = Vec::new();
        for root in roots {
            let Ok(entries) = std::fs::read_dir(&root) else {
                continue;
            };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                // 只认 profile 目录：Default 与 `Profile *`，其余（System Profile、
                // component CRX 缓存目录等）没有 cookie 库。
                if name != "Default" && !name.starts_with("Profile ") {
                    continue;
                }
                for layout in ["Network/Cookies", "Cookies"] {
                    let path = root.join(&name).join(layout);
                    if path.is_file() {
                        found.push(path);
                        break;
                    }
                }
            }
        }
        found
    }

    fn chrome_version() -> String {
        let plist = Path::new("/Applications/Google Chrome.app/Contents/Info.plist");
        let Ok(raw) = std::fs::read(plist) else {
            return String::new();
        };
        plist::Value::from_reader(std::io::Cursor::new(raw))
            .ok()
            .and_then(|value| {
                value
                    .as_dictionary()
                    .and_then(|dict| dict.get("CFBundleVersion"))
                    .and_then(|item| item.as_string())
                    .map(|item| item.to_string())
            })
            .unwrap_or_default()
    }

    pub fn availability() -> AccountManagerResult<ChromeStoreAvailability> {
        let databases = cookie_databases();
        if databases.is_empty() {
            return Err(AccountManagerError::not_found(
                "CHROME_IMPORT_NO_PROFILE: 未找到可读的 Chrome 登录态存储",
            ));
        }
        Ok(ChromeStoreAvailability {
            profile_count: databases.len(),
            chrome_version: chrome_version(),
        })
    }

    /// 取 Chrome 主密钥。失败时区分「用户拒绝授权」与其它钥匙串错误 —— 前者要引导
    /// 用户重试点「始终允许」，后者不该让他白点。
    fn master_key() -> AccountManagerResult<[u8; KEY_LEN]> {
        use zeroize::Zeroize as _;

        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            .map_err(|e| AccountManagerError::keyring_unavailable(format!("open entry: {e}")))?;
        // 取原始字节而非口令字符串：钥匙串里存的是任意二进制，UTF-8 校验不是我们要
        // 的约束，且只有字节能就地清零。
        let mut secret = match entry.get_secret() {
            Ok(secret) => secret,
            Err(keyring::Error::NoEntry) => {
                return Err(AccountManagerError::not_found(
                    "CHROME_IMPORT_NO_KEYCHAIN_ITEM: 钥匙串里没有 Chrome Safe Storage 条目",
                ));
            }
            // keyring 用它表示「平台访问规则挡住了读取」，即用户在弹窗里点了拒绝。
            Err(keyring::Error::NoStorageAccess(_)) => {
                return Err(AccountManagerError::keyring_unavailable(
                    "CHROME_IMPORT_KEYCHAIN_DENIED: 钥匙串授权被拒绝，请在弹窗里点「始终允许」后重试",
                ));
            }
            Err(error) => {
                return Err(AccountManagerError::keyring_unavailable(format!(
                    "read keychain: {error}"
                )));
            }
        };
        let mut key = [0u8; KEY_LEN];
        pbkdf2::pbkdf2_hmac::<sha1::Sha1>(&secret, PBKDF2_SALT, PBKDF2_ROUNDS, &mut key);
        // 钥匙串里的口令不进日志、不进 store；用完即清。
        secret.zeroize();
        Ok(key)
    }

    /// 解一条 `v10` 密文 → 明文（已剥摘要前缀、已去填充）。解不出返回 `None`。
    fn decrypt_v10(key: &[u8; KEY_LEN], host_key: &str, blob: &[u8]) -> Option<String> {
        let ciphertext = blob.strip_prefix(V10)?;
        if ciphertext.is_empty() || ciphertext.len() % KEY_LEN != 0 {
            return None;
        }
        use cbc::cipher::{BlockModeDecrypt as _, KeyIvInit};
        let decrypted = cbc::Decryptor::<aes::Aes128>::new(key.into(), (&IV).into())
            .decrypt_padded_vec::<cbc::cipher::block_padding::Pkcs7>(ciphertext)
            .ok()?;
        let plaintext = strip_host_digest(host_key, &decrypted);
        // 非 UTF-8 = 密钥不对或格式已变：丢弃而不是塞进 store。
        std::str::from_utf8(plaintext).ok().map(str::to_string)
    }

    /// 剥掉 `SHA256(host_key)` 前缀 —— **只在确实相等时剥**。
    ///
    /// 不无条件砍前 32 字节：Chrome 改格式时我们要的是显式「解不出」，而不是把每个
    /// cookie 值静默截短 32 字节再存进 canonical store。
    fn strip_host_digest<'a>(host_key: &str, plaintext: &'a [u8]) -> &'a [u8] {
        if plaintext.len() <= DIGEST_LEN {
            return plaintext;
        }
        // 全限定调用：不在平台门控模块里 `use sha2::Digest`，否则 cfg 卫生检查
        // 会把 `Digest` 的引用点算到只在 macOS 编译的本文件上，误判其它文件的同名导入。
        let digest = <sha2::Sha256 as sha2::Digest>::digest(host_key.as_bytes());
        if plaintext[..DIGEST_LEN] == digest[..] {
            return &plaintext[DIGEST_LEN..];
        }
        plaintext
    }

    /// Chrome epoch（自 1601-01-01 的微秒）→ Unix 秒。`0` / 负数表示会话 cookie。
    fn chrome_expires_to_unix(expires_utc: i64) -> Option<i64> {
        if expires_utc <= 0 {
            return None;
        }
        Some(expires_utc / 1_000_000 - CHROM_EPOCH_DELTA_SECS)
    }

    /// Chrome 的 `samesite` 整数 → **canonical** 字符串（与 AccountSession 的取值口径
    /// 一致：`strict` / `lax` / `none`，未指定回 `None` 交给注入端按默认处理）。
    ///
    /// 注意不能照抄 chrome.cookies 的 `no_restriction`：注入端 `normalize_same_site`
    /// 与 WebView 侧都只认 canonical 值，`no_restriction` 会落到 `_` 分支被丢掉属性，
    /// 跨站接口（iframe / 跨子域 XHR）因此不带凭证 —— 「导入了但还是没登录」。
    fn same_site_from_chrome(value: i64) -> Option<&'static str> {
        // Chromium net::cookies::CookieSameSite：0=OMITTED 1=NO_RESTRICTION
        // 2=LAX 4=STRICT（3 为历史值，按未指定处理）。
        match value {
            1 => Some("none"),
            2 => Some("lax"),
            4 => Some("strict"),
            _ => None,
        }
    }

    /// 一条 cookie 记录（仅取需要的列）。
    struct Row {
        host_key: String,
        name: String,
        path: String,
        value: String,
        encrypted_value: Vec<u8>,
        secure: bool,
        http_only: bool,
        expires_utc: i64,
        same_site: i64,
        partitioned: bool,
    }

    fn read_rows(database: &Path) -> AccountManagerResult<Vec<Row>> {
        let connection = rusqlite::Connection::open_with_flags(
            database,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| {
            AccountManagerError::store_fail(format!("open chrome cookies database: {e}"))
        })?;
        let mut statement = connection
            .prepare(
                "SELECT host_key, name, path, value, encrypted_value, is_secure, is_httponly,
                        expires_utc, samesite, top_frame_site_key
                 FROM cookies",
            )
            .map_err(|e| {
                AccountManagerError::store_fail(format!("prepare chrome cookie query: {e}"))
            })?;
        let rows = statement
            .query_map([], |row| {
                Ok(Row {
                    host_key: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    value: row.get(3)?,
                    encrypted_value: row.get(4)?,
                    secure: row.get(5)?,
                    http_only: row.get(6)?,
                    expires_utc: row.get(7)?,
                    same_site: row.get(8)?,
                    partitioned: !row.get::<_, String>(9)?.is_empty(),
                })
            })
            .map_err(|e| AccountManagerError::store_fail(format!("query chrome cookies: {e}")))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| {
                AccountManagerError::store_fail(format!("read chrome cookie row: {e}"))
            })?);
        }
        Ok(out)
    }

    pub fn import_site_cookies(site_host: &str) -> AccountManagerResult<ChromeStoreImport> {
        let site_host = site_host
            .trim()
            .trim_start_matches('.')
            .to_ascii_lowercase();
        if site_host.is_empty() {
            return Err(AccountManagerError::invalid_input(
                "CHROME_IMPORT_MISSING_HOST: 站点 host 为空",
            ));
        }
        let databases = cookie_databases();
        if databases.is_empty() {
            return Err(AccountManagerError::not_found(
                "CHROME_IMPORT_NO_PROFILE: 未找到可读的 Chrome 登录态存储",
            ));
        }
        let key = master_key()?;
        let now = chrono::Utc::now().timestamp();
        let mut best: Option<ChromeStoreImport> = None;

        for database in &databases {
            let rows = read_rows(database)?;
            let mut cookies = Vec::new();
            let mut skipped_partitioned = 0usize;
            let mut skipped_unusable = 0usize;
            for row in rows {
                // Chrome 把域级 cookie 的 host_key 存成 `.trae.cn`（前导点），而
                // `hosts_share_registrable_domain` 比对的是**去点**的可注册域：
                // 不去点会让 `.trae.cn` 与 `www.trae.cn` 判异，把整站域级 cookie
                // ——trae 的 passport 会话正是这一类——全部丢掉（2026-09-10 同类
                // 事故：wry 的精确匹配漏掉域级 cookie 导致探针恒判未登录）。
                let cookie_host = row.host_key.trim().trim_start_matches('.');
                if !hosts_share_registrable_domain(cookie_host, &site_host) {
                    continue;
                }
                if row.partitioned {
                    skipped_partitioned += 1;
                    continue;
                }
                let expires_at_ts = chrome_expires_to_unix(row.expires_utc);
                if expires_at_ts.is_some_and(|ts| ts <= now) {
                    skipped_unusable += 1;
                    continue;
                }
                let value = if row.encrypted_value.is_empty() {
                    // 老数据或未加密站点：明文列直接用（本机实测 0 行使用）。
                    row.value.clone()
                } else {
                    match decrypt_v10(&key, &row.host_key, &row.encrypted_value) {
                        Some(value) => value,
                        // 解不出即丢弃，不写入可疑值（fail-closed）。
                        None => {
                            skipped_unusable += 1;
                            continue;
                        }
                    }
                };
                cookies.push(CookieEntry {
                    name: row.name.clone(),
                    value,
                    domain: row.host_key.clone(),
                    // 前导点 = 域级 cookie；没有点就是 host-only。
                    host_only: !row.host_key.starts_with('.'),
                    path: if row.path.is_empty() {
                        "/".to_string()
                    } else {
                        row.path.clone()
                    },
                    http_only: row.http_only,
                    secure: row.secure,
                    same_site: same_site_from_chrome(row.same_site).map(str::to_string),
                    partitioned: false,
                    expires: expires_at_ts.map(|ts| {
                        chrono::DateTime::<chrono::Utc>::from_timestamp(ts, 0)
                            .map(|moment| moment.to_rfc3339())
                            .unwrap_or_default()
                    }),
                    expires_at_ts,
                });
            }
            let import = ChromeStoreImport {
                cookies,
                skipped_partitioned,
                skipped_unusable,
                profiles_read: 1,
            };
            // 多 profile：取命中最多的那个（用户的日常 profile 往往不是 Default）。
            if best
                .as_ref()
                .is_none_or(|current| import.cookies.len() > current.cookies.len())
            {
                best = Some(import);
            }
        }

        let mut import = best.unwrap_or(ChromeStoreImport {
            cookies: Vec::new(),
            skipped_partitioned: 0,
            skipped_unusable: 0,
            profiles_read: 0,
        });
        import.profiles_read = databases.len().min(1.max(import.profiles_read));
        // 稳定顺序：域 → 路径 → 名，便于比对与去重。
        import
            .cookies
            .sort_by(|a, b| (&a.domain, &a.path, &a.name).cmp(&(&b.domain, &b.path, &b.name)));
        Ok(import)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn encrypt_with(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Vec<u8> {
            use cbc::cipher::{BlockModeEncrypt as _, KeyIvInit};
            let padded = cbc::Encryptor::<aes::Aes128>::new(key.into(), (&IV).into())
                .encrypt_padded_vec::<cbc::cipher::block_padding::Pkcs7>(plaintext);
            let mut blob = V10.to_vec();
            blob.extend_from_slice(&padded);
            blob
        }

        fn key() -> [u8; KEY_LEN] {
            let mut key = [0u8; KEY_LEN];
            pbkdf2::pbkdf2_hmac::<sha1::Sha1>(b"test-secret", PBKDF2_SALT, PBKDF2_ROUNDS, &mut key);
            key
        }

        #[test]
        fn round_trips_a_digest_prefixed_value() {
            // 与本机实测同构：明文 = SHA256(host_key) || 值。
            let host = ".trae.cn";
            let value = "sessionid-abc123";
            let mut plaintext = <sha2::Sha256 as sha2::Digest>::digest(host.as_bytes()).to_vec();
            plaintext.extend_from_slice(value.as_bytes());
            let blob = encrypt_with(&key(), &plaintext);
            assert_eq!(decrypt_v10(&key(), host, &blob).as_deref(), Some(value));
        }

        #[test]
        fn strips_only_an_exact_digest_match() {
            let host = "example.com";
            let payload = b"0123456789abcdef0123456789abcdef-actual-value";
            // 前 32 字节全 0 ≠ SHA256(host)：整串保留，绝不盲切。
            let mut mismatched = vec![0u8; DIGEST_LEN];
            mismatched.extend_from_slice(payload);
            assert_eq!(strip_host_digest(host, &mismatched), &mismatched[..]);
            // 前 32 字节确实是 SHA256(host)：剥掉。
            let mut matched = <sha2::Sha256 as sha2::Digest>::digest(host.as_bytes()).to_vec();
            matched.extend_from_slice(payload);
            assert_eq!(strip_host_digest(host, &matched), &payload[..]);
        }

        #[test]
        fn rejects_non_v10_and_misaligned_ciphertext() {
            let key = key();
            assert_eq!(decrypt_v10(&key, "a.test", b"x10abcdef"), None);
            assert_eq!(decrypt_v10(&key, "a.test", b""), None);
            assert_eq!(decrypt_v10(&key, "a.test", b"v10abc"), None);
        }

        #[test]
        fn chrome_epoch_converts_to_unix_seconds() {
            // 2026-09-19T00:00:00Z：unix 1_790_006_400 ⇔ Chrome epoch
            // 13_434_480_000_000_000 µs。两端都写死字面量，秒差常量少一位就会
            // 在这里炸（曾经就多写了一个零，导致全站 cookie 被判「已过期」丢光）。
            assert_eq!(
                chrome_expires_to_unix(13_434_480_000_000_000),
                Some(1_790_006_400)
            );
            // 0 / 负数 = 会话 cookie（无过期时间）。
            assert_eq!(chrome_expires_to_unix(0), None);
            assert_eq!(chrome_expires_to_unix(-1), None);
        }

        #[test]
        fn same_site_maps_known_values_and_passes_through_unknown() {
            // canonical 口径：`none` 而非 chrome.cookies 的 `no_restriction`，
            // 否则注入端认不出来，跨站 cookie 会丢掉 SameSite 属性。
            assert_eq!(same_site_from_chrome(1), Some("none"));
            assert_eq!(same_site_from_chrome(2), Some("lax"));
            assert_eq!(same_site_from_chrome(4), Some("strict"));
            assert_eq!(same_site_from_chrome(0), None);
            assert_eq!(same_site_from_chrome(3), None);
        }

        #[test]
        fn domain_level_cookie_host_is_dot_stripped_before_matching() {
            // Chrome 存 `.trae.cn`，站点配的是 www.trae.cn：直接拿去比会判异，
            // 整站域级 cookie（trae 的 passport 会话）会被静默丢光。
            assert_eq!(".trae.cn".trim().trim_start_matches('.'), "trae.cn");
            assert!(hosts_share_registrable_domain("trae.cn", "www.trae.cn"));
            assert!(hosts_share_registrable_domain("api.trae.cn", "www.trae.cn"));
            // 但绝不放大到无关站点。
            assert!(!hosts_share_registrable_domain("evil.cn", "www.trae.cn"));
        }

        /// 真机端到端验证：只在本机手动跑（`cargo test -- --ignored`）。
        /// 断言里**不出现**任何站点名、cookie 名或值，只报计数与长度。
        #[test]
        #[ignore = "读取本机 Chrome 真实登录态，仅在开发机手动执行"]
        fn reads_real_chrome_store_end_to_end() {
            let databases = cookie_databases();
            assert!(!databases.is_empty(), "本机应能找到 Chrome 的 cookie 库");
            let rows = read_rows(&databases[0]).expect("read rows");
            // 自动挑库里出现次数最多的可注册域作为目标，避免把站点名写进代码。
            let mut counts: std::collections::HashMap<String, usize> = Default::default();
            for row in &rows {
                let labels: Vec<&str> = row
                    .host_key
                    .trim()
                    .trim_start_matches('.')
                    .split('.')
                    .filter(|label| !label.is_empty())
                    .collect();
                if labels.len() >= 2 {
                    *counts
                        .entry(format!(
                            "{}.{}",
                            labels[labels.len() - 2],
                            labels[labels.len() - 1]
                        ))
                        .or_default() += 1;
                }
            }
            let (target, raw_hits) = counts
                .into_iter()
                .max_by_key(|(_, count)| *count)
                .expect("库里应有可用域");
            println!("目标域原始行数={raw_hits}");

            let import = import_site_cookies(&target).expect("导入应成功");
            println!(
                "解出={} 跳过分区={} 跳过不可用={} 读过 profile={}",
                import.cookies.len(),
                import.skipped_partitioned,
                import.skipped_unusable,
                import.profiles_read
            );
            assert!(!import.cookies.is_empty(), "应能解出该站点的 cookie");
            for cookie in &import.cookies {
                assert!(!cookie.value.is_empty(), "解出的值不应为空");
                assert!(
                    cookie.value.is_ascii()
                        && cookie.value.chars().all(|c| !c.is_control() || c == ' '),
                    "值应为可读 ASCII（长度 {}），否则说明剥摘要或解密出了问题",
                    cookie.value.len()
                );
            }
            println!("全部 {} 条值解密后为干净 ASCII ✓", import.cookies.len());
        }
    }
}
