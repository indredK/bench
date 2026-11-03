//! Command Center Storage / 命令中心持久化: atomic JSON store; 只做卡片读写.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::command_center::types::{CardKind, CommandCard};
use crate::error::{AppError, AppResult};
use crate::persistence::{atomic_write, ensure_file_size};

const SCHEMA_VERSION: u32 = 1;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
struct CardsFile {
    schema_version: u32,
    cards: Vec<CommandCard>,
}

/// 命令库目录不可用时的错误码（前端据此区分「本地存储坏了」与「市场/网络坏了」）。
pub const STORE_UNAVAILABLE_CODE: &str = "COMMAND_STORE_UNAVAILABLE";

fn store_path() -> AppResult<PathBuf> {
    let base =
        dirs::config_dir().ok_or_else(|| AppError::io("Cannot determine config directory"))?;
    let dir = base.join("bench").join("command-center");
    fs::create_dir_all(&dir).map_err(|e| store_unavailable(&base.join("bench"), &dir, &e))?;
    Ok(dir.join("cards.json"))
}

/// 生成带路径与根因的错误：命令库目录常见的失败是 `bench` 目录被做成了指向外接卷的
/// 软链接，卷未挂载时链接悬空，`create_dir_all` 只会得到一句 `No such file or directory`。
fn store_unavailable(
    root: &std::path::Path,
    dir: &std::path::Path,
    cause: &std::io::Error,
) -> AppError {
    let dangling = fs::symlink_metadata(root).is_ok_and(|meta| meta.file_type().is_symlink())
        && !root.exists();
    let reason = if dangling {
        let target = fs::read_link(root)
            .map(|p| p.display().to_string())
            .unwrap_or_default();
        format!(
            "{} is a dangling symlink (target `{target}` is missing; is the volume mounted?)",
            root.display()
        )
    } else {
        format!("{}: {cause}", dir.display())
    };
    AppError::new(
        STORE_UNAVAILABLE_CODE,
        format!("Command store directory is unavailable: {reason}"),
    )
}

/// 内置示例卡片；按 id 合并进用户卡片，用户可自由删除。
fn seed_cards() -> Vec<CommandCard> {
    vec![CommandCard {
        id: "builtin-elevate-app".to_string(),
        title: "以管理员权限打开应用".to_string(),
        description:
            "运行后会弹出选择框，挑选一个应用并以管理员权限打开。类似功能也在「应用管理 → 高级 → 应用隔离授权」中（用于解除 Gatekeeper 隔离），但那里只清除隔离标记，本卡片可直接提权启动应用。"
                .to_string(),
        kind: CardKind::ShellAdmin,
        command: "osascript -e 'set theApp to choose application with prompt \"选择要以管理员权限打开的应用\"\nset appPath to POSIX path of (theApp as alias)\ndo shell script \"open -a \" & quoted form of appPath'".to_string(),
        icon: Some("shield".to_string()),
        created_at: 0,
        updated_at: 0,
        market: None,
    }]
}

/// 读取全部卡片；文件不存在时返回空列表。
pub fn load_cards() -> AppResult<Vec<CommandCard>> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(seed_cards());
    }
    ensure_file_size(&path, MAX_FILE_BYTES)
        .map_err(|_| AppError::new("PERSISTENCE_TOO_LARGE", "cards file exceeds size limit"))?;
    let content = fs::read(&path).map_err(|_| AppError::io("Cannot read cards"))?;
    let value: serde_json::Value = serde_json::from_slice(&content)
        .map_err(|_| AppError::new("PERSISTENCE_CORRUPT", "cards are invalid"))?;
    let schema = value
        .get("schema_version")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| AppError::new("PERSISTENCE_CORRUPT", "schema version missing"))?;
    if schema > u64::from(SCHEMA_VERSION) {
        return Err(AppError::new(
            "PERSISTENCE_SCHEMA_NEWER",
            "cards were written by a newer version",
        ));
    }
    let file: CardsFile = serde_json::from_value(value)
        .map_err(|_| AppError::new("PERSISTENCE_CORRUPT", "cards are invalid"))?;
    Ok(merge_seeds(file.cards))
}

/// 将缺失的内置卡片按 id 合并进现有列表（用户删除过的不会重复出现需单独跟踪，这里以存在性为准）。
fn merge_seeds(mut cards: Vec<CommandCard>) -> Vec<CommandCard> {
    let existing: std::collections::HashSet<String> = cards.iter().map(|c| c.id.clone()).collect();
    for seed in seed_cards() {
        if !existing.contains(&seed.id) {
            cards.push(seed);
        }
    }
    cards
}

/// 原子写入全部卡片。
pub fn save_cards(cards: &[CommandCard]) -> AppResult<()> {
    let path = store_path()?;
    let file = CardsFile {
        schema_version: SCHEMA_VERSION,
        cards: cards.to_vec(),
    };
    let json =
        serde_json::to_vec_pretty(&file).map_err(|_| AppError::io("Cannot serialize cards"))?;
    if json.len() as u64 > MAX_FILE_BYTES {
        return Err(AppError::new(
            "PERSISTENCE_TOO_LARGE",
            "cards file exceeds size limit",
        ));
    }
    atomic_write(&path, &json).map_err(|_| AppError::io("Cannot persist cards"))
}

/// 将给定卡片导出（合并内置示例）为 JSON 文件，返回导出条数。
pub fn export_cards_to_path(path: &std::path::Path, cards: &[CommandCard]) -> AppResult<usize> {
    let file = CardsFile {
        schema_version: SCHEMA_VERSION,
        cards: cards.to_vec(),
    };
    let json =
        serde_json::to_vec_pretty(&file).map_err(|_| AppError::io("Cannot serialize cards"))?;
    if json.len() as u64 > MAX_FILE_BYTES {
        return Err(AppError::new(
            "PERSISTENCE_TOO_LARGE",
            "cards file exceeds size limit",
        ));
    }
    fs::write(path, json).map_err(|_| AppError::io("Cannot write export file"))?;
    Ok(file.cards.len())
}

/// 从 JSON 文件导入卡片，按 id 合并进现有持久化集合（导入覆盖同 id），返回合并后的完整列表。
pub fn import_cards_from_path(path: &std::path::Path) -> AppResult<Vec<CommandCard>> {
    let file_size = fs::metadata(path)
        .map_err(|_| AppError::io("Cannot read import file"))?
        .len();
    if file_size > MAX_FILE_BYTES {
        return Err(AppError::new(
            "PERSISTENCE_TOO_LARGE",
            "import file exceeds size limit",
        ));
    }
    let content = fs::read(path).map_err(|_| AppError::io("Cannot read import file"))?;
    let value: serde_json::Value = serde_json::from_slice(&content)
        .map_err(|_| AppError::new("PERSISTENCE_CORRUPT", "import file is invalid JSON"))?;
    let schema = value
        .get("schema_version")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| AppError::new("PERSISTENCE_CORRUPT", "schema version missing"))?;
    if schema > u64::from(SCHEMA_VERSION) {
        return Err(AppError::new(
            "PERSISTENCE_SCHEMA_NEWER",
            "import file was written by a newer version",
        ));
    }
    let imported: CardsFile = serde_json::from_value(value)
        .map_err(|_| AppError::new("PERSISTENCE_CORRUPT", "import file is invalid"))?;

    let mut existing = load_cards()?;
    let index: std::collections::HashMap<String, usize> = existing
        .iter()
        .enumerate()
        .map(|(i, c)| (c.id.clone(), i))
        .collect();
    for card in imported.cards {
        if let Some(pos) = index.get(&card.id) {
            existing[*pos] = card;
        } else {
            existing.push(card);
        }
    }
    save_cards(&existing)?;
    Ok(existing)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bench-cc-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn dangling_symlink_root_is_reported_with_target() {
        let sandbox = scratch("dangling");
        let root = sandbox.join("bench");
        std::os::unix::fs::symlink(sandbox.join("missing-volume"), &root).expect("symlink");
        let dir = root.join("command-center");
        let cause = fs::create_dir_all(&dir).expect_err("must fail through dangling link");

        let err = store_unavailable(&root, &dir, &cause);

        assert_eq!(err.code, STORE_UNAVAILABLE_CODE);
        assert!(err.message.contains("dangling symlink"), "{}", err.message);
        assert!(err.message.contains("missing-volume"), "{}", err.message);
        let _ = fs::remove_dir_all(&sandbox);
    }

    #[test]
    fn plain_failure_keeps_path_and_cause() {
        let sandbox = scratch("plain");
        let root = sandbox.join("bench");
        let dir = root.join("command-center");
        let cause = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");

        let err = store_unavailable(&root, &dir, &cause);

        assert_eq!(err.code, STORE_UNAVAILABLE_CODE);
        assert!(err.message.contains("command-center"), "{}", err.message);
        assert!(err.message.contains("denied"), "{}", err.message);
        let _ = fs::remove_dir_all(&sandbox);
    }
}
