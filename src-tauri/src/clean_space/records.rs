//! Cleanup Records / 清理记录持久化
//!
//! Stores records as JSON lines in the app config directory.

use std::fs;
use std::path::PathBuf;

use super::types::CleanupRecord;
use crate::error::{AppError, AppResult};

/// Get the records file path.
fn records_path() -> AppResult<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    let dir = config_dir.join("bench").join("clean-space");
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::io(format!("Cannot create records dir: {}", e)))?;
    Ok(dir.join("records.json"))
}

/// Read all cleanup records from disk.
pub fn get_records() -> AppResult<Vec<CleanupRecord>> {
    let path = records_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::io(format!("Cannot read records: {}", e)))?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    let records: Vec<CleanupRecord> = serde_json::from_str(&content)
        .map_err(|e| AppError::io(format!("Cannot parse records: {}", e)))?;
    Ok(records)
}

/// Upper bound on retained records to prevent `records.json` from growing
/// without limit. Older entries beyond this cap are dropped on each write.
const MAX_RECORDS: usize = 200;

/// Append a new cleanup record to disk.
///
/// If the existing records file is corrupt or unreadable, back it up to
/// `records.json.corrupt-<timestamp>` and start fresh — never silently wipe.
pub fn add_record(record: CleanupRecord) -> AppResult<()> {
    let path = records_path()?;
    let records = match get_records() {
        Ok(r) => r,
        Err(e) => {
            // Back up corrupt file before starting fresh
            if path.exists() {
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let backup_name = format!("records.json.corrupt-{}", timestamp);
                let backup = path.with_file_name(backup_name);
                let _ = fs::rename(&path, &backup);
            }
            eprintln!(
                "[clean-space] records file unreadable, starting fresh: {}",
                e
            );
            Vec::new()
        }
    };
    let mut records = records;
    records.insert(0, record);
    // Trim to MAX_RECORDS, dropping the oldest entries at the tail.
    if records.len() > MAX_RECORDS {
        records.truncate(MAX_RECORDS);
    }
    let json = serde_json::to_string_pretty(&records)
        .map_err(|e| AppError::io(format!("Cannot serialize records: {}", e)))?;
    fs::write(&path, json).map_err(|e| AppError::io(format!("Cannot write records: {}", e)))?;
    Ok(())
}
