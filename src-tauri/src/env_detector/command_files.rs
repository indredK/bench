use chrono::{DateTime, Local};
use std::ffi::OsStr;
use std::fs;
use std::path::Path;

pub(super) fn command_name_from_file_name(
    file_name: &OsStr,
    windows_extensions: &[String],
) -> Option<(String, usize)> {
    let file_name = file_name.to_string_lossy();
    if is_ignored_file_name(&file_name) {
        return None;
    }

    if cfg!(windows) {
        windows_command_name_from_file_name(&file_name, windows_extensions)
    } else if is_reasonable_command_name(&file_name) {
        Some((file_name.to_string(), 0))
    } else {
        None
    }
}

fn windows_command_name_from_file_name(
    file_name: &str,
    windows_extensions: &[String],
) -> Option<(String, usize)> {
    let extension = Path::new(file_name)
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy().to_lowercase()))?;

    let extension_rank = windows_extensions
        .iter()
        .position(|candidate| candidate == &extension)?;

    let stem = Path::new(file_name)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())?;

    if is_reasonable_command_name(&stem) {
        Some((stem, extension_rank))
    } else {
        None
    }
}

pub(super) fn windows_executable_extensions(path_ext: Option<&OsStr>) -> Vec<String> {
    const FALLBACK_EXTENSIONS: &[&str] = &[".exe", ".cmd", ".bat", ".com", ".ps1"];
    const ALLOWED_EXTENSIONS: &[&str] = &[".exe", ".cmd", ".bat", ".com", ".ps1"];

    let mut extensions = Vec::new();
    let source = path_ext
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| FALLBACK_EXTENSIONS.join(";"));

    for raw in source.split(';') {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }

        let normalized = if trimmed.starts_with('.') {
            trimmed.to_lowercase()
        } else {
            format!(".{}", trimmed.to_lowercase())
        };

        if ALLOWED_EXTENSIONS.contains(&normalized.as_str())
            && !extensions.iter().any(|ext| ext == &normalized)
        {
            extensions.push(normalized);
        }
    }

    for fallback in FALLBACK_EXTENSIONS {
        let fallback = (*fallback).to_string();
        if !extensions.iter().any(|ext| ext == &fallback) {
            extensions.push(fallback);
        }
    }

    extensions
}

pub(super) fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    if cfg!(windows) {
        true
    } else {
        is_executable(path)
    }
}

fn is_ignored_file_name(name: &str) -> bool {
    name.is_empty()
        || name.starts_with('.')
        || name.eq_ignore_ascii_case("desktop.ini")
        || name.eq_ignore_ascii_case("thumbs.db")
}

fn is_reasonable_command_name(name: &str) -> bool {
    !name.is_empty()
        && name.chars().count() <= 120
        && !name.contains(std::path::MAIN_SEPARATOR)
        && !name.chars().any(char::is_control)
}

pub(super) fn command_key(name: &str) -> String {
    if cfg!(windows) {
        name.to_lowercase()
    } else {
        name.to_string()
    }
}

pub(super) fn get_file_size(path: &Path) -> (u64, String) {
    match fs::metadata(path) {
        Ok(meta) => {
            let bytes = meta.len();
            (bytes, format_bytes(bytes))
        }
        Err(_) => (0, String::new()),
    }
}

pub(super) fn get_file_time(path: &Path) -> String {
    match fs::metadata(path) {
        Ok(meta) => {
            let timestamp = if cfg!(target_os = "windows") {
                meta.created().or_else(|_| meta.modified())
            } else {
                meta.modified().or_else(|_| meta.created())
            };

            match timestamp {
                Ok(time) => {
                    let duration = time
                        .duration_since(std::time::SystemTime::UNIX_EPOCH)
                        .unwrap_or_default();
                    let secs = duration.as_secs() as i64;
                    let nsecs = duration.subsec_nanos();
                    match DateTime::from_timestamp(secs, nsecs) {
                        Some(dt) => {
                            let local: DateTime<Local> = dt.with_timezone(&Local);
                            local.format("%Y-%m-%d %H:%M:%S").to_string()
                        }
                        None => String::new(),
                    }
                }
                Err(_) => String::new(),
            }
        }
        Err(_) => String::new(),
    }
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_path: &Path) -> bool {
    true
}

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }

    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let bytes_f = bytes as f64;
    let i = (bytes_f.log10() / 3.0).floor() as usize;
    let i = i.min(UNITS.len() - 1);
    let value = bytes_f / 1000_f64.powi(i as i32);
    format!("{:.2} {}", value, UNITS[i])
}
