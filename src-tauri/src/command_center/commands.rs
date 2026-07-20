//! Command Center Commands / 命令中心命令: IPC surface only; 只暴露命令.

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::command_center::storage::{load_cards, save_cards};
use crate::command_center::types::{CardKind, CommandCard, RunResult};
use crate::command_center::{exec, storage};
use crate::error::{AppError, AppResult};

/// 当前命令执行的取消标志。每次运行创建独立标志并存入此处，
/// 仅最新一次运行可被取消，避免「终止」误伤其它并发运行的卡片。
pub struct RunAbortFlag(pub Mutex<Arc<AtomicBool>>);

#[tauri::command]
pub async fn list_command_cards() -> AppResult<Vec<CommandCard>> {
    tokio::task::spawn_blocking(load_cards)
        .await
        .map_err(|e| AppError::task_failed(format!("list_command_cards: {e}")))?
}

#[tauri::command]
pub async fn save_command_cards(cards: Vec<CommandCard>) -> AppResult<()> {
    tokio::task::spawn_blocking(move || save_cards(&cards))
        .await
        .map_err(|e| AppError::task_failed(format!("save_command_cards: {e}")))?
}

#[tauri::command]
pub async fn upsert_command_card(card: CommandCard) -> AppResult<Vec<CommandCard>> {
    tokio::task::spawn_blocking(move || {
        let mut cards = storage::load_cards()?;
        match cards.iter_mut().find(|c| c.id == card.id) {
            Some(existing) => *existing = card,
            None => cards.push(card),
        }
        storage::save_cards(&cards)?;
        Ok(cards)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("upsert_command_card: {e}")))?
}

#[tauri::command]
pub async fn delete_command_card(id: String) -> AppResult<Vec<CommandCard>> {
    tokio::task::spawn_blocking(move || {
        let mut cards = storage::load_cards()?;
        cards.retain(|c| c.id != id);
        storage::save_cards(&cards)?;
        Ok(cards)
    })
    .await
    .map_err(|e| AppError::task_failed(format!("delete_command_card: {e}")))?
}

#[tauri::command]
pub async fn run_command_card<R: Runtime>(
    app: AppHandle<R>,
    kind: CardKind,
    command: String,
    flag: tauri::State<'_, RunAbortFlag>,
) -> AppResult<RunResult> {
    // 每次运行使用独立的取消标志，仅本次运行可被终止。
    let abort = Arc::new(AtomicBool::new(false));
    *flag.0.lock().unwrap() = Arc::clone(&abort);
    match kind {
        CardKind::Shell => tokio::task::spawn_blocking(move || exec::run_shell(&command, abort))
            .await
            .map_err(|e| AppError::task_failed(format!("run_command_card: {e}")))?,
        CardKind::ShellAdmin => {
            tokio::task::spawn_blocking(move || exec::run_admin(&command, abort))
                .await
                .map_err(|e| AppError::task_failed(format!("run_command_card: {e}")))?
        }
        CardKind::Open => {
            tokio::task::spawn_blocking(move || exec::open_target(&command))
                .await
                .map_err(|e| AppError::task_failed(format!("run_command_card: {e}")))??;
            Ok(RunResult {
                success: true,
                exit_code: Some(0),
                stdout: String::new(),
                stderr: String::new(),
            })
        }
        CardKind::Copy => {
            app.clipboard()
                .write_text(command)
                .map_err(|e| AppError::new("CLIPBOARD_FAILED", e.to_string()))?;
            Ok(RunResult {
                success: true,
                exit_code: Some(0),
                stdout: String::new(),
                stderr: String::new(),
            })
        }
    }
}

#[tauri::command]
pub fn cancel_command_card(flag: tauri::State<'_, RunAbortFlag>) {
    flag.0
        .lock()
        .unwrap()
        .store(true, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
pub async fn export_command_cards(path: String, cards: Vec<CommandCard>) -> AppResult<usize> {
    let target = std::path::PathBuf::from(path);
    tokio::task::spawn_blocking(move || storage::export_cards_to_path(&target, &cards))
        .await
        .map_err(|e| AppError::task_failed(format!("export_command_cards: {e}")))?
}

#[tauri::command]
pub async fn import_command_cards(path: String) -> AppResult<Vec<CommandCard>> {
    let target = std::path::PathBuf::from(path);
    tokio::task::spawn_blocking(move || storage::import_cards_from_path(&target))
        .await
        .map_err(|e| AppError::task_failed(format!("import_command_cards: {e}")))?
}
