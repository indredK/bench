/// File operations / 文件操作
///
/// 通用文件读写命令，供前端通过 Tauri IPC 调用。
/// 在 Tauri webview 中，浏览器的 `a.click()` 下载被拦截，
/// 需要通过 Rust 后端写文件。
use std::fs;
use std::io;

/// 将文本内容写入指定路径。用于前端导出 JSON 等文件。
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("write {path}: {e}"))
}

/// 从指定路径读取文本内容。
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

/// 确保目录存在（递归创建）。
#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("create_dir {path}: {e}"))
}

/// 判断文件是否存在。
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    fs::metadata(&path).is_ok()
}

/// 返回系统临时目录路径。
#[tauri::command]
pub fn temp_dir() -> String {
    std::env::temp_dir().to_string_lossy().into_owned()
}

// 以下函数仅供模块内部或测试使用，不导出为 Tauri 命令
#[allow(dead_code)]
fn _list_dir(path: &str) -> io::Result<Vec<String>> {
    let mut entries: Vec<String> = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        entries.push(entry.file_name().to_string_lossy().into_owned());
    }
    Ok(entries)
}
