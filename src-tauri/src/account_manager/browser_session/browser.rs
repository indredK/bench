//! 受支持的浏览器发现（互通 I1/I2）。
//!
//! 只暴露 **Chromium 系** 且确认尊重 `--user-data-dir` 隔离语义的浏览器：
//!
//! | id       | macOS                                                    | Windows                                                        |
//! | -------- | -------------------------------------------------------- | -------------------------------------------------------------- |
//! | chrome   | `/Applications/Google Chrome.app/Contents/MacOS/...`     | `%ProgramFiles%\Google\Chrome\Application\chrome.exe` 等        |
//! | edge     | `/Applications/Microsoft Edge.app/Contents/MacOS/...`    | `%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`     |
//! | brave    | `/Applications/Brave Browser.app/Contents/MacOS/...`     | `%ProgramFiles%\BraveSoftware\Brave-Browser\Application\...`    |
//! | chromium | `/Applications/Chromium.app/Contents/MacOS/Chromium`     | `%LOCALAPPDATA%\Chromium\Application\chrome.exe`                |
//!
//! **有意排除**：
//! - **Arc** —— 虽为 Chromium 系，但其档案模型会与用户日常档案合流，破坏
//!   「每账号独立 data directory」红线（design.md §3），故 v1 不支持。
//! - **Safari / Firefox** —— 无 CDP（Safari 无调试协议且无 `--user-data-dir`；
//!   Firefox 的 CDP 兼容层已弃用，转向 WebDriver BiDi）。
//!
//! 实现要点：**平台差异只门控「候选路径数据」，不门控函数本身** ——
//! `crate::range` 式的 `#[cfg]` 函数会导致另一边平台出现 dead code 而触发
//! `-D warnings`（见 `scripts/quality/check-rust-cfg-hygiene.mjs` Rule A）。

use std::path::PathBuf;

use serde::Serialize;

/// 一个可用的浏览器安装。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInstallation {
    /// 稳定 id（前端偏好持久化用），如 `chrome`。
    pub id: String,
    /// 展示名，如 `Google Chrome`。
    pub name: String,
    /// 可执行文件绝对路径。**不暴露给前端**（见 [`browser_list_dto`]）。
    pub path: PathBuf,
}

/// 前端可见的浏览器条目（不含本机绝对路径，避免泄露用户目录结构）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOptionDto {
    pub id: String,
    pub name: String,
}

/// 候选三元组：(id, 展示名, 可执行文件相对/绝对位置)。
struct Candidate {
    id: &'static str,
    name: &'static str,
    path: PathBuf,
}

/// macOS 候选路径（仅本平台编译）。
#[cfg(target_os = "macos")]
fn candidate_paths() -> Vec<Candidate> {
    let apps = PathBuf::from("/Applications");
    let mut out = vec![
        Candidate {
            id: "chrome",
            name: "Google Chrome",
            path: apps.join("Google Chrome.app/Contents/MacOS/Google Chrome"),
        },
        Candidate {
            id: "edge",
            name: "Microsoft Edge",
            path: apps.join("Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        },
        Candidate {
            id: "brave",
            name: "Brave Browser",
            path: apps.join("Brave Browser.app/Contents/MacOS/Brave Browser"),
        },
        Candidate {
            id: "chromium",
            name: "Chromium",
            path: apps.join("Chromium.app/Contents/MacOS/Chromium"),
        },
    ];
    // 用户级安装（无需管理员权限）也纳入探测。
    if let Ok(home) = std::env::var("HOME") {
        let user_apps = PathBuf::from(home).join("Applications");
        for (id, name, rel) in [
            (
                "chrome",
                "Google Chrome",
                "Google Chrome.app/Contents/MacOS/Google Chrome",
            ),
            (
                "edge",
                "Microsoft Edge",
                "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            ),
            (
                "brave",
                "Brave Browser",
                "Brave Browser.app/Contents/MacOS/Brave Browser",
            ),
            (
                "chromium",
                "Chromium",
                "Chromium.app/Contents/MacOS/Chromium",
            ),
        ] {
            out.push(Candidate {
                id,
                name,
                path: user_apps.join(rel),
            });
        }
    }
    out
}

/// Windows 候选路径（仅本平台编译）。
#[cfg(target_os = "windows")]
fn candidate_paths() -> Vec<Candidate> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(value) = std::env::var(key) {
            if !value.trim().is_empty() {
                roots.push(PathBuf::from(value));
            }
        }
    }

    let layouts: &[(&str, &str, &str)] = &[
        (
            "chrome",
            "Google Chrome",
            "Google/Chrome/Application/chrome.exe",
        ),
        (
            "edge",
            "Microsoft Edge",
            "Microsoft/Edge/Application/msedge.exe",
        ),
        (
            "brave",
            "Brave Browser",
            "BraveSoftware/Brave-Browser/Application/brave.exe",
        ),
        ("chromium", "Chromium", "Chromium/Application/chrome.exe"),
    ];

    let mut out = Vec::new();
    for (id, name, rel) in layouts {
        for root in &roots {
            out.push(Candidate {
                id,
                name,
                path: root.join(rel),
            });
        }
    }
    out
}

/// 其它平台：无受支持浏览器（Linux 不在发布目标内）。
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn candidate_paths() -> Vec<Candidate> {
    Vec::new()
}

/// 探测本机已安装的受支持浏览器（按 id 去重，保留首个命中的路径）。
pub fn supported_installations() -> Vec<BrowserInstallation> {
    let mut found: Vec<BrowserInstallation> = Vec::new();
    for candidate in candidate_paths() {
        if !candidate.path.is_file() {
            continue;
        }
        if found.iter().any(|existing| existing.id == candidate.id) {
            continue;
        }
        found.push(BrowserInstallation {
            id: candidate.id.to_string(),
            name: candidate.name.to_string(),
            path: candidate.path,
        });
    }
    found
}

/// 按 id 取一个已安装浏览器；id 为空时回退到首个可用项。
pub fn find(id: Option<&str>) -> Option<BrowserInstallation> {
    let installations = supported_installations();
    let Some(id) = id.filter(|value| !value.trim().is_empty()) else {
        return installations.into_iter().next();
    };
    installations.into_iter().find(|item| item.id == id)
}

/// 前端选择器数据源（不含本机路径）。
pub fn browser_list_dto() -> Vec<BrowserOptionDto> {
    supported_installations()
        .into_iter()
        .map(|item| BrowserOptionDto {
            id: item.id,
            name: item.name,
        })
        .collect()
}

/// 校验一个浏览器 id 是否受支持（不要求当前已安装）。
pub fn is_supported_id(id: &str) -> bool {
    matches!(id, "chrome" | "edge" | "brave" | "chromium")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arc_is_not_advertised() {
        // Arc 会与日常档案合流，破坏每账号独立 data dir 红线。
        assert!(!is_supported_id("arc"));
    }

    #[test]
    fn safari_and_firefox_are_not_advertised() {
        assert!(!is_supported_id("safari"));
        assert!(!is_supported_id("firefox"));
    }

    #[test]
    fn supported_ids_are_chromium_family() {
        for id in ["chrome", "edge", "brave", "chromium"] {
            assert!(is_supported_id(id), "{id} should be supported");
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_candidates_point_into_app_bundles() {
        let paths: Vec<String> = candidate_paths()
            .iter()
            .map(|c| c.path.display().to_string())
            .collect();
        assert!(paths
            .iter()
            .any(|p| p.contains("Google Chrome.app/Contents/MacOS")));
        assert!(paths
            .iter()
            .any(|p| p.contains("Microsoft Edge.app/Contents/MacOS")));
    }

    #[test]
    fn browser_list_dto_hides_absolute_paths() {
        // DTO 只含 id/name：序列化结果不得出现路径分隔符。
        let json = serde_json::to_string(&browser_list_dto()).expect("serialize dto");
        assert!(!json.contains('/'), "dto must not leak paths: {json}");
        assert!(!json.contains('\\'), "dto must not leak paths: {json}");
    }
}
