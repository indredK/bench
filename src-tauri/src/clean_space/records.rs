//! Cleanup record persistence with schema migration and atomic replacement.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::types::CleanupRecord;
use crate::error::{AppError, AppResult};
use crate::persistence::{atomic_write, backup_file, ensure_file_size};

const RECORDS_SCHEMA_VERSION: u32 = 1;
const MAX_RECORDS: usize = 200;
const MAX_RECORDS_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_BACKUPS: usize = 3;

#[derive(Debug, Serialize, Deserialize)]
struct RecordsFile {
    schema_version: u32,
    records: Vec<CleanupRecord>,
}

struct LoadedRecords {
    records: Vec<CleanupRecord>,
    needs_migration: bool,
}

fn records_path() -> AppResult<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    let dir = config_dir.join("bench").join("clean-space");
    fs::create_dir_all(&dir).map_err(|_| AppError::io("Cannot create records directory"))?;
    Ok(dir.join("records.json"))
}

pub fn get_records() -> AppResult<Vec<CleanupRecord>> {
    let path = records_path()?;
    let loaded = load_records(&path)?;
    if loaded.needs_migration {
        backup_file(&path, "pre-v1", MAX_BACKUPS)
            .map_err(|_| AppError::io("Cannot back up legacy cleanup records"))?;
        write_records(&path, &loaded.records)?;
    }
    Ok(loaded.records)
}

pub fn add_record(record: CleanupRecord) -> AppResult<()> {
    add_record_at_path(&records_path()?, record)
}

fn add_record_at_path(path: &Path, record: CleanupRecord) -> AppResult<()> {
    let mut records = match load_records(path) {
        Ok(loaded) => loaded.records,
        Err(error) if error.code == "PERSISTENCE_SCHEMA_NEWER" => return Err(error),
        Err(_) => {
            backup_file(path, "corrupt", MAX_BACKUPS)
                .map_err(|_| AppError::io("Cannot back up unreadable cleanup records"))?;
            Vec::new()
        }
    };
    records.insert(0, record);
    records.truncate(MAX_RECORDS);
    write_records(path, &records)
}

fn load_records(path: &Path) -> AppResult<LoadedRecords> {
    if !path.exists() {
        return Ok(LoadedRecords {
            records: Vec::new(),
            needs_migration: false,
        });
    }
    ensure_file_size(path, MAX_RECORDS_FILE_BYTES)
        .map_err(|_| AppError::new("PERSISTENCE_TOO_LARGE", "Cleanup record file is too large"))?;
    let content = fs::read(path).map_err(|_| AppError::io("Cannot read cleanup records"))?;
    if content.iter().all(u8::is_ascii_whitespace) {
        return Ok(LoadedRecords {
            records: Vec::new(),
            needs_migration: true,
        });
    }

    let value: serde_json::Value = serde_json::from_slice(&content)
        .map_err(|_| AppError::new("PERSISTENCE_CORRUPT", "Cleanup records are invalid"))?;
    if value.is_array() {
        let mut records: Vec<CleanupRecord> = serde_json::from_value(value)
            .map_err(|_| AppError::new("PERSISTENCE_CORRUPT", "Cleanup records are invalid"))?;
        records.truncate(MAX_RECORDS);
        return Ok(LoadedRecords {
            records,
            needs_migration: true,
        });
    }

    let schema = value
        .get("schema_version")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| AppError::new("PERSISTENCE_CORRUPT", "Cleanup record schema is missing"))?;
    if schema > u64::from(RECORDS_SCHEMA_VERSION) {
        return Err(AppError::new(
            "PERSISTENCE_SCHEMA_NEWER",
            "Cleanup records were created by a newer Bench version",
        ));
    }
    if schema != u64::from(RECORDS_SCHEMA_VERSION) {
        return Err(AppError::new(
            "PERSISTENCE_SCHEMA_UNSUPPORTED",
            "Cleanup record schema is unsupported",
        ));
    }

    let mut file: RecordsFile = serde_json::from_value(value)
        .map_err(|_| AppError::new("PERSISTENCE_CORRUPT", "Cleanup records are invalid"))?;
    let needs_migration = file.records.len() > MAX_RECORDS;
    file.records.truncate(MAX_RECORDS);
    Ok(LoadedRecords {
        records: file.records,
        needs_migration,
    })
}

fn write_records(path: &Path, records: &[CleanupRecord]) -> AppResult<()> {
    let file = RecordsFile {
        schema_version: RECORDS_SCHEMA_VERSION,
        records: records.to_vec(),
    };
    let json = serde_json::to_vec_pretty(&file)
        .map_err(|_| AppError::io("Cannot serialize cleanup records"))?;
    if json.len() as u64 > MAX_RECORDS_FILE_BYTES {
        return Err(AppError::new(
            "PERSISTENCE_TOO_LARGE",
            "Cleanup record file exceeds the size limit",
        ));
    }
    atomic_write(path, &json).map_err(|_| AppError::io("Cannot persist cleanup records"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn record(id: &str) -> CleanupRecord {
        CleanupRecord {
            id: id.into(),
            timestamp: 1,
            title: "Cleanup".into(),
            scope: "test".into(),
            items: 1,
            freed_bytes: 10,
            high_risk_count: 0,
            status: "ok".into(),
        }
    }

    fn temp_path(label: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "bench-clean-records-{label}-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir.join("records.json")
    }

    #[test]
    fn migrates_legacy_array_without_losing_records() {
        let path = temp_path("legacy");
        fs::write(&path, serde_json::to_vec(&vec![record("old")]).unwrap()).unwrap();
        let loaded = load_records(&path).unwrap();
        assert!(loaded.needs_migration);
        assert_eq!(loaded.records[0].id, "old");
        write_records(&path, &loaded.records).unwrap();
        let migrated = load_records(&path).unwrap();
        assert!(!migrated.needs_migration);
        assert_eq!(migrated.records[0].id, "old");
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn future_schema_is_fail_closed_and_not_overwritten() {
        let path = temp_path("future");
        let future = br#"{"schema_version":99,"records":[]}"#;
        fs::write(&path, future).unwrap();
        let error = add_record_at_path(&path, record("new")).unwrap_err();
        assert_eq!(error.code, "PERSISTENCE_SCHEMA_NEWER");
        assert_eq!(fs::read(&path).unwrap(), future);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn corrupt_file_is_backed_up_before_recovery() {
        let path = temp_path("corrupt");
        fs::write(&path, b"not-json").unwrap();
        add_record_at_path(&path, record("new")).unwrap();
        assert_eq!(load_records(&path).unwrap().records[0].id, "new");
        let backup_count = fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"))
            .count();
        assert_eq!(backup_count, 1);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
