use std::collections::HashSet;
use std::env;
#[cfg(target_os = "macos")]
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

const SHELL_TIMEOUT: Duration = Duration::from_millis(4000);

pub(super) fn collect_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut seen = HashSet::new();

    if let Some(path_var) = env::var_os("PATH") {
        for dir in env::split_paths(&path_var) {
            push_search_dir(&mut dirs, &mut seen, dir);
        }
    }

    #[cfg(target_os = "macos")]
    for dir in macos_login_shell_path_dirs() {
        push_search_dir(&mut dirs, &mut seen, dir);
    }

    for dir in platform_default_dirs() {
        push_search_dir(&mut dirs, &mut seen, dir);
    }

    dirs
}

#[cfg(target_os = "macos")]
fn macos_login_shell_path_dirs() -> Vec<PathBuf> {
    let shell = env::var_os("SHELL")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("/bin/zsh"));

    let print_cmd = shell_print_path_command(&shell);
    let mut child = match Command::new(&shell)
        .args(["-lc", print_cmd])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(_) => return Vec::new(),
    };

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                let output = match child.wait_with_output() {
                    Ok(out) => out,
                    Err(_) => return Vec::new(),
                };
                let path_value = String::from_utf8_lossy(&output.stdout);
                return env::split_paths(OsStr::new(path_value.trim())).collect();
            }
            Ok(Some(_)) => return Vec::new(),
            Ok(None) if start.elapsed() >= SHELL_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Vec::new();
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Vec::new();
            }
        }
    }
}

/// Pick a command compatible with the user's login shell to print PATH.
/// `print -r --` is a zsh builtin and breaks on bash/fish/etc.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(super) fn shell_print_path_command(shell: &Path) -> &'static str {
    let name = shell
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("zsh")
        .to_ascii_lowercase();
    match name.as_str() {
        "zsh" => "print -r -- $PATH",
        "fish" => "printf '%s' $PATH",
        // POSIX-compatible fallback (works in bash/sh/dash/ash/ksh).
        _ => "printf '%s' \"$PATH\"",
    }
}

fn push_search_dir(dirs: &mut Vec<PathBuf>, seen: &mut HashSet<String>, dir: PathBuf) {
    if dir.as_os_str().is_empty() || !dir.is_absolute() {
        return;
    }

    let key = normalize_path_key(&dir);
    if seen.insert(key) {
        dirs.push(dir);
    }
}

pub(super) fn normalize_path_key(path: &Path) -> String {
    let mut value = path.to_string_lossy().replace('\\', "/");
    while value.len() > 1 && value.ends_with('/') {
        value.pop();
    }

    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value
    }
}

fn platform_default_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    push_env_dir(&mut dirs, "PNPM_HOME");

    if let Some(home) = home_dir() {
        dirs.push(home.join(".cargo").join("bin"));
        dirs.push(home.join(".bun").join("bin"));
        dirs.push(home.join(".deno").join("bin"));
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".local").join("share").join("mise").join("shims"));
        dirs.push(home.join(".asdf").join("shims"));
        dirs.push(home.join(".volta").join("bin"));
        dirs.push(home.join("go").join("bin"));

        push_existing_child_bin_dirs(&mut dirs, &home.join(".nvm").join("versions").join("node"));

        #[cfg(target_os = "macos")]
        {
            dirs.push(home.join(".npm-global").join("bin"));
            dirs.push(home.join(".rbenv").join("shims"));
            dirs.push(home.join(".pyenv").join("shims"));
            dirs.push(home.join("Library").join("pnpm"));
        }

        #[cfg(target_os = "windows")]
        {
            dirs.push(home.join("scoop").join("shims"));
            dirs.push(home.join(".pyenv").join("pyenv-win").join("bin"));
            dirs.push(home.join(".pyenv").join("pyenv-win").join("shims"));
            dirs.push(home.join(".local").join("bin"));
            dirs.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("Python")
                    .join("Scripts"),
            );
            push_existing_child_dirs(
                &mut dirs,
                &home
                    .join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("Python"),
                "Scripts",
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/opt/local/bin"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/snap/bin"));
    }

    #[cfg(target_os = "windows")]
    {
        for dir in windows_registry_dirs() {
            dirs.push(dir);
        }

        push_env_child(&mut dirs, "APPDATA", &["npm"]);
        push_env_child(&mut dirs, "APPDATA", &["Python", "Scripts"]);
        push_env_child(&mut dirs, "LOCALAPPDATA", &["pnpm"]);
        push_env_child(&mut dirs, "LOCALAPPDATA", &["Volta", "bin"]);
        push_env_child(
            &mut dirs,
            "LOCALAPPDATA",
            &["Programs", "Microsoft VS Code", "bin"],
        );
        push_env_child(&mut dirs, "ProgramData", &["chocolatey", "bin"]);

        if let Some(pf) = env::var_os("ProgramFiles") {
            dirs.push(PathBuf::from(&pf).join("nodejs"));
            dirs.push(PathBuf::from(&pf).join("Go").join("bin"));
            dirs.push(PathBuf::from(&pf).join("Git").join("cmd"));
            dirs.push(
                PathBuf::from(&pf)
                    .join("Docker")
                    .join("Docker")
                    .join("resources")
                    .join("bin"),
            );
        }
        if let Some(pfx86) = env::var_os("ProgramFiles(x86)") {
            dirs.push(PathBuf::from(&pfx86).join("Microsoft VS Code").join("bin"));
        } else if let Some(pf) = env::var_os("ProgramFiles") {
            dirs.push(PathBuf::from(&pf).join("Microsoft VS Code").join("bin"));
        }
        push_env_child(&mut dirs, "LOCALAPPDATA", &["Programs", "Python", "Launcher"]);
    }

    dirs
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn push_env_dir(dirs: &mut Vec<PathBuf>, key: &str) {
    if let Some(value) = env::var_os(key) {
        dirs.push(PathBuf::from(value));
    }
}

#[cfg(target_os = "windows")]
fn push_env_child(dirs: &mut Vec<PathBuf>, key: &str, parts: &[&str]) {
    if let Some(value) = env::var_os(key) {
        let mut path = PathBuf::from(value);
        for part in parts {
            path.push(part);
        }
        dirs.push(path);
    }
}

fn push_existing_child_bin_dirs(dirs: &mut Vec<PathBuf>, parent: &Path) {
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let bin_dir = entry.path().join("bin");
        if bin_dir.is_dir() {
            dirs.push(bin_dir);
        }
    }
}

#[cfg(target_os = "windows")]
fn push_existing_child_dirs(dirs: &mut Vec<PathBuf>, parent: &Path, child: &str) {
    let entries = match fs::read_dir(parent) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let child_dir = entry.path().join(child);
        if child_dir.is_dir() {
            dirs.push(child_dir);
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_registry_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for key in [
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\git.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\git.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\node.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\node.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\python.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\python.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\python3.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\python3.exe",
    ] {
        if let Some(dir) = query_windows_app_path_dir(key) {
            dirs.push(dir);
        }
    }
    dirs
}

#[cfg(target_os = "windows")]
fn query_windows_app_path_dir(key: &str) -> Option<PathBuf> {
    let output = Command::new("reg")
        .args(["query", key, "/ve"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(parse_windows_registry_value_line)
        .and_then(|path| path.parent().map(Path::to_path_buf))
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(super) fn parse_windows_registry_value_line(line: &str) -> Option<PathBuf> {
    let trimmed = line.trim();
    if trimmed.is_empty() || !trimmed.contains("REG_") {
        return None;
    }

    let value = trimmed
        .split_whitespace()
        .skip_while(|part| !part.starts_with("REG_"))
        .skip(1)
        .collect::<Vec<_>>()
        .join(" ");
    if value.is_empty() {
        None
    } else {
        Some(PathBuf::from(value))
    }
}

pub(super) fn is_scannable_dir(path: &Path) -> bool {
    path.is_dir() && !is_os_system_dir(path) && !is_project_local_bin_dir(path)
}

fn is_os_system_dir(path: &Path) -> bool {
    let normalized = normalize_path_key(path);

    if cfg!(windows) {
        return normalized == "c:/windows";
    }

    matches!(
        normalized.as_str(),
        "/usr/lib" | "/lib" | "/library/apple/usr/bin"
    ) || normalized.starts_with("/system/")
}

fn is_project_local_bin_dir(path: &Path) -> bool {
    has_component_suffix(path, &["node_modules", ".bin"])
        || has_component_suffix(path, &[".venv", "bin"])
        || has_component_suffix(path, &["venv", "bin"])
        || has_component_suffix(path, &["env", "bin"])
        || has_component_suffix(path, &["target", "debug"])
        || has_component_suffix(path, &["target", "release"])
        || has_component_suffix(path, &[".git", "hooks"])
        || (cfg!(windows)
            && (has_component_suffix(path, &[".venv", "scripts"])
                || has_component_suffix(path, &["venv", "scripts"])
                || has_component_suffix(path, &["env", "scripts"])))
}

pub(super) fn path_has_component(path: &Path, needle: &str) -> bool {
    path_components(path).iter().any(|part| part == needle)
}

fn has_component_suffix(path: &Path, suffix: &[&str]) -> bool {
    let components = path_components(path);
    components.len() >= suffix.len()
        && components[components.len() - suffix.len()..]
            .iter()
            .zip(suffix.iter())
            .all(|(left, right)| left == right)
}

fn path_components(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| component.as_os_str().to_str())
        .map(|component| {
            if cfg!(windows) {
                component.to_ascii_lowercase()
            } else {
                component.to_string()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_print_path_command_uses_zsh_builtin_for_zsh() {
        assert_eq!(
            shell_print_path_command(Path::new("/bin/zsh")),
            "print -r -- $PATH"
        );
    }

    #[test]
    fn shell_print_path_command_uses_fish_syntax_for_fish() {
        assert_eq!(
            shell_print_path_command(Path::new("/usr/local/bin/fish")),
            "printf '%s' $PATH"
        );
    }

    #[test]
    fn shell_print_path_command_falls_back_to_posix_for_bash_and_others() {
        let posix = "printf '%s' \"$PATH\"";
        assert_eq!(shell_print_path_command(Path::new("/bin/bash")), posix);
        assert_eq!(shell_print_path_command(Path::new("/bin/sh")), posix);
        assert_eq!(shell_print_path_command(Path::new("/bin/dash")), posix);
        assert_eq!(shell_print_path_command(Path::new("/usr/bin/ksh")), posix);
        // Unknown shell — must not break with `print -r`.
        assert_eq!(shell_print_path_command(Path::new("/opt/weird/shell")), posix);
    }
}
