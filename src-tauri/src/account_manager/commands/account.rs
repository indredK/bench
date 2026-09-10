//! Account-owned commands: CRUD, secrets, ephemeral accounts, proxy toggle.

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use zeroize::Zeroizing;

use super::shared::{
    deletion_resource, new_id, normalize_optional, now_label, remove_account_metadata,
    reorder_by_ids, trim_or_invalid,
};
use crate::account_manager::crypto;
use crate::account_manager::state::AccountManagerState;
use crate::account_manager::storage;
use crate::account_manager::types::{
    AccountManagerError, AccountManagerResult, AccountSessionStatus, AccountType, DeletionReport,
    DeletionResourceKind, DeletionResourceStatus, DeletionStatus, LoginMethod, StationAccount,
};
use crate::account_manager::webview;

const CLIPBOARD_SECRET_TTL_SECONDS: u64 = 30;

#[tauri::command]
pub fn list_all_accounts(
    state: State<'_, AccountManagerState>,
) -> AccountManagerResult<Vec<StationAccount>> {
    Ok(state.read_snapshot_checked()?.accounts)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    username: String,
    password: Option<String>,
    notes: String,
    phone: Option<String>,
    tg_account: Option<String>,
    linked_account: Option<String>,
    invite_link: Option<String>,
    login_methods: Vec<LoginMethod>,
) -> AccountManagerResult<StationAccount> {
    create_account_inner(
        &app,
        &state,
        station_id,
        username,
        password,
        notes,
        phone,
        tg_account,
        linked_account,
        invite_link,
        login_methods,
    )
}

/// 建号的共用实现：命令创建与「站点回采 → 新建账号」共用同一条路径，避免两套建号规则。
///
/// 回采场景传入 `phone`/`tg_account`/`linked_account`/`invite_link`/`login_methods` 为 `None`/`[]`，
/// 仅用 `station_id` + `username` + 可选 `password` + `notes`；其余字段保持默认。
#[allow(clippy::too_many_arguments)]
pub(crate) fn create_account_inner<R: Runtime>(
    app: &AppHandle<R>,
    state: &AccountManagerState,
    station_id: String,
    username: String,
    password: Option<String>,
    notes: String,
    phone: Option<String>,
    tg_account: Option<String>,
    linked_account: Option<String>,
    invite_link: Option<String>,
    login_methods: Vec<LoginMethod>,
) -> AccountManagerResult<StationAccount> {
    let password = normalize_optional(password);
    let encrypted_password = match password {
        Some(pw) => {
            let key = state.master_key()?;
            Some(crypto::encrypt(&key, &pw)?)
        }
        None => None,
    };
    let account = StationAccount {
        account_type: Default::default(),
        website: None,
        session: None,
        exclusivity_group: None,
        proxy_enabled: false,
        external_app_ids: Vec::new(),
        refresh_schedule: None,
        next_refresh_at_ts: None,
        first_login_at: None,
        status_reason: None,
        id: new_id("acct"),
        station_id,
        username: trim_or_invalid(&username, "username")?,
        notes: notes.trim().to_string(),
        phone: normalize_optional(phone),
        tg_account: normalize_optional(tg_account),
        linked_account: normalize_optional(linked_account),
        invite_link: normalize_optional(invite_link),
        login_methods,
        status: AccountSessionStatus::LoginRequired,
        last_login_at: None,
        last_refreshed_at: None,
        created_at: now_label(),
        has_password: encrypted_password.is_some(),
    };

    storage::with_state_mut(app, state, |snapshot| {
        if !snapshot.stations.iter().any(|s| s.id == account.station_id) {
            return Err(AccountManagerError::not_found(format!(
                "station {}",
                account.station_id
            )));
        }
        snapshot.accounts.push(account.clone());
        if let Some(blob) = encrypted_password.clone() {
            snapshot.secrets.insert(account.id.clone(), blob);
        }
        Ok(account.clone())
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    id: String,
    username: Option<String>,
    notes: Option<String>,
    phone: Option<Option<String>>,
    tg_account: Option<Option<String>>,
    linked_account: Option<Option<String>>,
    invite_link: Option<Option<String>>,
    login_methods: Option<Vec<LoginMethod>>,
) -> AccountManagerResult<StationAccount> {
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == id) else {
            return Err(AccountManagerError::not_found(format!("account {id}")));
        };
        if let Some(u) = username.as_ref() {
            account.username = trim_or_invalid(u, "username")?;
        }
        if let Some(n) = notes.as_ref() {
            account.notes = n.trim().to_string();
        }
        if let Some(p) = phone.clone() {
            account.phone = normalize_optional(p);
        }
        if let Some(t) = tg_account.clone() {
            account.tg_account = normalize_optional(t);
        }
        if let Some(l) = linked_account.clone() {
            account.linked_account = normalize_optional(l);
        }
        if let Some(i) = invite_link.clone() {
            account.invite_link = normalize_optional(i);
        }
        if let Some(methods) = login_methods.clone() {
            account.login_methods = methods;
        }
        Ok(account.clone())
    })
}

#[tauri::command]
pub fn delete_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    id: String,
) -> AccountManagerResult<DeletionReport> {
    if !state
        .read_snapshot_checked()?
        .accounts
        .iter()
        .any(|account| account.id == id)
    {
        return Err(AccountManagerError::not_found(format!("account {id}")));
    }

    let mut resources = vec![deletion_resource(
        DeletionResourceKind::WebviewData,
        Some(id.clone()),
        webview::remove_account_data_dir(&app, &id),
    )];
    if resources[0].status == DeletionResourceStatus::Failed {
        return Ok(DeletionReport {
            target_id: id,
            status: DeletionStatus::Partial,
            metadata_deleted: false,
            removed_account_count: 0,
            resources,
        });
    }

    let metadata_result = storage::with_state_mut(&app, &state, |snapshot| {
        remove_account_metadata(snapshot, &id)
    });
    let removed_account_count = metadata_result.as_ref().copied().unwrap_or(0);
    resources.push(deletion_resource(
        DeletionResourceKind::Metadata,
        None,
        metadata_result.map(|_| ()),
    ));
    let metadata_deleted = resources
        .last()
        .is_some_and(|resource| resource.status == DeletionResourceStatus::Succeeded);
    Ok(DeletionReport {
        target_id: id,
        status: if metadata_deleted {
            DeletionStatus::Complete
        } else {
            DeletionStatus::Partial
        },
        metadata_deleted,
        removed_account_count,
        resources,
    })
}

#[tauri::command]
pub fn reorder_accounts<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    station_id: String,
    ordered_ids: Vec<String>,
) -> AccountManagerResult<Vec<StationAccount>> {
    storage::with_state_mut(&app, &state, |snapshot| {
        if !snapshot.stations.iter().any(|s| s.id == station_id) {
            return Err(AccountManagerError::not_found(format!(
                "station {station_id}"
            )));
        }

        let (mine, others): (Vec<StationAccount>, Vec<StationAccount>) = snapshot
            .accounts
            .iter()
            .cloned()
            .partition(|a| a.station_id == station_id);
        let mine_reordered = reorder_by_ids(&mine, &ordered_ids, "account")?;

        let mut mine_iter = mine_reordered.into_iter();
        let mut others_iter = others.into_iter();
        let mut next: Vec<StationAccount> = Vec::with_capacity(snapshot.accounts.len());
        for original in &snapshot.accounts {
            if original.station_id == station_id {
                let item = mine_iter.next().ok_or_else(|| {
                    AccountManagerError::store_fail(
                        "reorder_by_ids returned fewer items than expected",
                    )
                })?;
                next.push(item);
            } else {
                let item = others_iter.next().ok_or_else(|| {
                    AccountManagerError::store_fail("partition preserved this element")
                })?;
                next.push(item);
            }
        }
        snapshot.accounts = next;
        Ok(snapshot
            .accounts
            .iter()
            .filter(|a| a.station_id == station_id)
            .cloned()
            .collect::<Vec<_>>())
    })
}

// ───── secrets (P1: AES-256-GCM encrypted at rest) ─────

#[tauri::command]
pub fn reveal_password(
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<String> {
    let blob = state
        .read_snapshot_checked()?
        .secrets
        .get(&account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("password for {account_id}")))?;
    let key = state.master_key()?;
    crypto::decrypt(&key, &blob)
}

#[tauri::command]
pub fn set_password<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    password: String,
) -> AccountManagerResult<()> {
    let blob = if password.is_empty() {
        None
    } else {
        let key = state.master_key()?;
        Some(crypto::encrypt(&key, &password)?)
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!(
                "account {account_id}"
            )));
        };
        match blob.clone() {
            Some(encrypted) => {
                snapshot.secrets.insert(account_id.clone(), encrypted);
            }
            None => {
                snapshot.secrets.remove(&account_id);
            }
        }
        account.has_password = snapshot.secrets.contains_key(&account_id);
        Ok(())
    })
}

#[tauri::command]
pub fn copy_password_to_clipboard<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<()> {
    let blob = state
        .read_snapshot_checked()?
        .secrets
        .get(&account_id)
        .cloned()
        .ok_or_else(|| AccountManagerError::not_found(format!("password for {account_id}")))?;
    let key = state.master_key()?;
    let plaintext = Zeroizing::new(crypto::decrypt(&key, &blob)?);
    let expected_digest = Sha256::digest(plaintext.as_bytes());
    app.clipboard()
        .write_text(plaintext.to_string())
        .map_err(|e| AccountManagerError::clipboard_fail(e.to_string()))?;
    let app_for_cleanup = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(CLIPBOARD_SECRET_TTL_SECONDS)).await;
        let clipboard = app_for_cleanup.clipboard();
        let Ok(current) = clipboard.read_text() else {
            return;
        };
        if Sha256::digest(current.as_bytes()) == expected_digest {
            if let Err(error) = clipboard.write_text(String::new()) {
                eprintln!("[account_manager] clipboard cleanup failed: {error}");
            }
        }
    });
    Ok(())
}

// ───── account snapshot export（用户主动触发的明文凭证出口） ─────

/// 解密 origin storage blob（localStorage/sessionStorage/IndexedDB 加密块）。
/// 解密失败不阻断整体导出，标注 `decryptError`；明文不是 JSON 时原样作字符串返回。
fn decrypt_storage_blob(key: &[u8; 32], blob: &Option<crypto::EncryptedBlob>) -> serde_json::Value {
    match blob {
        None => serde_json::Value::Null,
        Some(blob) => match crypto::decrypt(key, blob) {
            Ok(text) => serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text)),
            Err(error) => serde_json::json!({ "decryptError": error.to_string() }),
        },
    }
}

/// 导出账号完整快照（pretty JSON 字符串）：账号信息 + 明文密码 + 站点信息 +
/// session（cookies 明文、CSRF、origins 解密明文）+ 登录指纹 + 认证画像。
/// **明文凭证出口**：与 reveal_password 同级的敏感面，仅由用户主动触发；
/// 内容去向（剪贴板 / JSON 文件）由前端决定。
#[tauri::command]
pub fn export_account_snapshot(
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<String> {
    let snapshot = state.read_snapshot_checked()?;
    let account = snapshot
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
    let station = snapshot
        .stations
        .iter()
        .find(|s| s.id == account.station_id)
        .ok_or_else(|| AccountManagerError::not_found(format!("station {}", account.station_id)))?;

    let key = state.master_key()?;

    // 明文密码（无密码时省略字段）。
    let password = snapshot
        .secrets
        .get(&account_id)
        .map(|blob| crypto::decrypt(&key, blob))
        .transpose()?;

    // session：外层 blob 已由 restore_session 解密；origins 内层 storage 再逐块解密。
    let session_value = match crate::account_manager::session::restore_session(&state, &account_id)?
    {
        Some(session) => {
            let origins: Vec<serde_json::Value> = session
                .origins
                .iter()
                .map(|origin| {
                    serde_json::json!({
                        "origin": origin.origin,
                        "localStorage": decrypt_storage_blob(&key, &origin.local_storage),
                        "sessionStorage": decrypt_storage_blob(&key, &origin.session_storage),
                        "indexedDb": decrypt_storage_blob(&key, &origin.indexed_db),
                    })
                })
                .collect();
            serde_json::json!({
                "capturedAt": session.captured_at,
                "capturedAtTs": session.captured_at_ts,
                "expiresHint": session.expires_hint,
                "userAgent": session.user_agent,
                "cookies": session.cookies,
                "csrfToken": session.csrf_token,
                "origins": origins,
            })
        }
        None => serde_json::Value::Null,
    };

    // 站点级登录指纹（特征名 + 值长度；值本身从未存储）。
    let fingerprint = snapshot.fingerprints.get(&account.station_id);

    let mut account_value = serde_json::to_value(account)
        .map_err(|e| AccountManagerError::store_fail(format!("serialize account: {e}")))?;
    if let Some(password) = password {
        account_value["password"] = serde_json::Value::String(password);
    }

    let payload = serde_json::json!({
        "kind": "bench-account-snapshot",
        "version": 1,
        "exportedAt": now_label(),
        "station": {
            "id": station.id,
            "remark": station.remark,
            "website": station.website,
        },
        "account": account_value,
        "session": session_value,
        "fingerprint": fingerprint,
        "authProfile": station.auth_profile,
    });
    serde_json::to_string_pretty(&payload)
        .map_err(|e| AccountManagerError::store_fail(format!("serialize snapshot: {e}")))
}

// ───── ephemeral (Phase 2) ─────

/// 创建一个临时账号(快速登录入口)。
/// `station_id` 可选 — 为 None 时表示不归属任何 Station,账号自带 `website`。
#[tauri::command]
pub fn create_ephemeral_account<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    website: String,
    username: String,
    station_id: Option<String>,
) -> AccountManagerResult<StationAccount> {
    let website = trim_or_invalid(&website, "website")?;
    let username = trim_or_invalid(&username, "username")?;

    // 若指定了 station,必须存在
    if let Some(ref sid) = station_id {
        let exists = state
            .read_snapshot_checked()?
            .stations
            .iter()
            .any(|s| &s.id == sid);
        if !exists {
            return Err(AccountManagerError::not_found(format!("station {sid}")));
        }
    }

    let account = StationAccount {
        account_type: AccountType::Ephemeral,
        website: Some(website),
        session: None,
        exclusivity_group: None,
        proxy_enabled: false,
        external_app_ids: Vec::new(),
        refresh_schedule: None,
        next_refresh_at_ts: None,
        first_login_at: None,
        status_reason: None,
        id: new_id("eph"),
        station_id: station_id.unwrap_or_default(),
        username,
        notes: String::new(),
        phone: None,
        tg_account: None,
        linked_account: None,
        invite_link: None,
        login_methods: Vec::new(),
        status: AccountSessionStatus::LoginRequired,
        last_login_at: None,
        last_refreshed_at: None,
        created_at: now_label(),
        has_password: false,
    };

    storage::with_state_mut(&app, &state, |snapshot| {
        snapshot.accounts.push(account.clone());
        Ok(account)
    })
}

#[tauri::command]
pub fn set_account_proxy_enabled<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    enabled: bool,
) -> AccountManagerResult<StationAccount> {
    let result = storage::with_state_mut(&app, &state, |snapshot| {
        let account = snapshot
            .accounts
            .iter_mut()
            .find(|a| a.id == account_id)
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        account.proxy_enabled = enabled;

        // 关闭代理时立即吊销该账号的所有外部 App 绑定与引用（设计文档 §7.2）。
        if !enabled {
            account.external_app_ids.clear();
            snapshot
                .external_app_bindings
                .retain(|b| b.account_id != account_id);
        }

        let updated = snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))?;
        Ok(updated)
    })?;

    crate::account_manager::proxy::protocol::audit_log(
        "proxy_setting_changed",
        &[
            ("account_id", &account_id),
            ("enabled", if enabled { "true" } else { "false" }),
        ],
    );
    Ok(result)
}

// ───── Session Keeper(会话保活) ─────

/// 设置/更新/关闭账号的静默刷新计划。
/// - `schedule = None`:清除计划并清空 next_refresh_at_ts。
/// - `schedule.enabled = false`:保留配置但暂停调度(next 同步清空)。
/// 仅 persistent 账号可设置;ephemeral 账号拒绝(INVALID_INPUT)。
#[tauri::command]
pub fn set_account_refresh_schedule<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AccountManagerState>,
    account_id: String,
    schedule: Option<crate::account_manager::types::RefreshSchedule>,
) -> AccountManagerResult<StationAccount> {
    if let Some(schedule) = schedule.as_ref() {
        schedule.validate()?;
    }
    storage::with_state_mut(&app, &state, |snapshot| {
        let Some(account) = snapshot.accounts.iter_mut().find(|a| a.id == account_id) else {
            return Err(AccountManagerError::not_found(format!(
                "account {account_id}"
            )));
        };
        if account.account_type != AccountType::Persistent {
            return Err(AccountManagerError::invalid_input(
                "refresh schedule is only available for persistent accounts",
            ));
        }
        account.next_refresh_at_ts = match schedule {
            Some(ref s) if s.enabled => Some(
                crate::account_manager::session_keeper::compute_next_run(s, chrono::Local::now()),
            ),
            _ => None,
        };
        account.refresh_schedule = schedule;
        let mode_summary = account.refresh_schedule.as_ref().map(|s| match s.mode {
            crate::account_manager::types::RefreshScheduleMode::Interval { hours } => {
                format!("interval:{hours}h")
            }
            crate::account_manager::types::RefreshScheduleMode::Daily { minute_of_day } => {
                format!("daily:{:02}:{:02}", minute_of_day / 60, minute_of_day % 60)
            }
        });
        if let Some(summary) = mode_summary {
            let enabled = account.refresh_schedule.is_some_and(|s| s.enabled);
            crate::account_manager::state::push_account_log(
                snapshot,
                &account_id,
                crate::account_manager::types::AccountLogKind::ScheduleChanged,
                crate::account_manager::types::AccountLogLevel::Info,
                Some(serde_json::json!({ "enabled": enabled, "mode": summary })),
            );
        } else {
            crate::account_manager::state::push_account_log(
                snapshot,
                &account_id,
                crate::account_manager::types::AccountLogKind::ScheduleChanged,
                crate::account_manager::types::AccountLogLevel::Info,
                Some(serde_json::json!({ "enabled": false, "mode": "cleared" })),
            );
        }
        snapshot
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or_else(|| AccountManagerError::not_found(format!("account {account_id}")))
    })
}

/// 读取账号日志(倒序)与当前保活计划/下次执行时间。纯内存读,不落盘。
#[tauri::command]
pub fn list_account_logs(
    state: State<'_, AccountManagerState>,
    account_id: String,
) -> AccountManagerResult<crate::account_manager::types::AccountLogsResponse> {
    let snapshot = state.read_snapshot_checked()?;
    let Some(account) = snapshot.accounts.iter().find(|a| a.id == account_id) else {
        return Err(AccountManagerError::not_found(format!(
            "account {account_id}"
        )));
    };
    let mut entries: Vec<crate::account_manager::types::AccountLogEntry> = snapshot
        .account_logs
        .get(&account_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect();
    entries.sort_by(|a, b| b.at_ts.cmp(&a.at_ts).then(b.id.cmp(&a.id)));
    Ok(crate::account_manager::types::AccountLogsResponse {
        entries,
        schedule: account.refresh_schedule,
        next_refresh_at_ts: account.next_refresh_at_ts,
    })
}
