use super::types::{
    CleanupCommandDef, CustomCleanupAbortFlag, CustomCleanupFinalResult, CustomCleanupProgress,
    RiskLevel,
};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Runtime};

const EVENT_PROGRESS: &str = "custom-cleanup:progress";
const EVENT_COMPLETED: &str = "custom-cleanup:completed";

fn builtin_commands() -> Vec<CleanupCommandDef> {
    vec![
        CleanupCommandDef {
            id: "npm_cache".into(),
            name: "npm 缓存".into(),
            command: "npm cache clean --force".into(),
            environment: "shell".into(),
            description: "清理 npm 全局缓存，释放包管理器的磁盘空间".into(),
            risk: "低风险。下次安装依赖时需重新下载，但不影响已有项目".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "yarn_cache".into(),
            name: "Yarn 缓存".into(),
            command: "yarn cache clean".into(),
            environment: "shell".into(),
            description: "清理 Yarn 包管理器缓存".into(),
            risk: "低风险。仅删除缓存文件，不影响项目依赖".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "pnpm_cache".into(),
            name: "pnpm Store 清理".into(),
            command: "pnpm store prune".into(),
            environment: "shell".into(),
            description: "清理 pnpm 全局 store 中未被引用的包".into(),
            risk: "低风险。只删除未被任何项目引用的包，安全".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "pip_cache".into(),
            name: "pip 缓存".into(),
            command: "pip cache purge 2>/dev/null || pip3 cache purge 2>/dev/null || true".into(),
            environment: "shell".into(),
            description: "清理 Python pip 包管理器缓存".into(),
            risk: "低风险。仅删除缓存的 wheel 文件，重新安装时需下载".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "brew_cache".into(),
            name: "Homebrew 缓存".into(),
            command: "brew cleanup --prune=all".into(),
            environment: "shell".into(),
            description: "清理 Homebrew 下载的旧版本软件包和缓存".into(),
            risk: "低风险。仅删除旧版本，当前版本不受影响".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "docker_prune".into(),
            name: "Docker 系统清理".into(),
            command: "docker system prune -af".into(),
            environment: "shell".into(),
            description: "清理 Docker 未使用的镜像、容器、网络和构建缓存".into(),
            risk: "⚠️ 高风险。将删除所有未运行容器和未使用镜像，无法恢复".into(),
            risk_level: RiskLevel::High,
        },
        CleanupCommandDef {
            id: "docker_builder".into(),
            name: "Docker 构建缓存".into(),
            command: "docker builder prune -af".into(),
            environment: "shell".into(),
            description: "清理 Docker 构建缓存".into(),
            risk: "中风险。下次构建需重新下载层，但运行中的容器不受影响".into(),
            risk_level: RiskLevel::Medium,
        },
        CleanupCommandDef {
            id: "cargo_cache".into(),
            name: "Cargo 缓存".into(),
            command: "cargo cache -a 2>/dev/null || (rm -rf ~/.cargo/registry/cache && rm -rf ~/.cargo/registry/src && rm -rf ~/.cargo/git/checkouts && echo 'Removed cargo cache directories')".into(),
            environment: "shell".into(),
            description: "清理 Rust Cargo 包管理器缓存".into(),
            risk: "低风险。仅删除缓存的依赖，编译时需重新下载但不会重编译".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "xcode_derived".into(),
            name: "Xcode DerivedData".into(),
            command: "rm -rf ~/Library/Developer/Xcode/DerivedData/* && echo 'Cleared Xcode DerivedData'".into(),
            environment: "shell".into(),
            description: "清理 Xcode 构建产物缓存".into(),
            risk: "中风险。下次打开项目需重新索引和编译".into(),
            risk_level: RiskLevel::Medium,
        },
        CleanupCommandDef {
            id: "ios_simulator".into(),
            name: "iOS 模拟器清理".into(),
            command: "xcrun simctl delete unavailable 2>/dev/null && echo 'Cleared unavailable simulators'".into(),
            environment: "shell".into(),
            description: "删除不可用的 iOS 模拟器镜像".into(),
            risk: "低风险。仅删除旧版本不可用模拟器".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "user_logs".into(),
            name: "用户日志文件".into(),
            command: "find ~/Library/Logs -type f -name '*.log' -mtime +30 -delete 2>/dev/null && echo 'Cleared old log files'".into(),
            environment: "shell".into(),
            description: "删除超过30天的系统日志文件".into(),
            risk: "低风险。仅删除旧日志文件，不影响系统运行".into(),
            risk_level: RiskLevel::Low,
        },
        CleanupCommandDef {
            id: "tmp_files".into(),
            name: "临时文件清理".into(),
            command: "find /tmp -type f -user $(whoami) -mtime +7 2>/dev/null | head -100 | xargs rm -f 2>/dev/null; echo 'Cleared temporary files'".into(),
            environment: "shell".into(),
            description: "清理用户临时目录中超过7天的文件".into(),
            risk: "低风险。仅删除旧临时文件".into(),
            risk_level: RiskLevel::Low,
        },
    ]
}

fn measure_disk_free() -> u64 {
    // `df -k /` works on both macOS and Linux and avoids pulling in a
    // platform-specific crate (nix/statfs) that isn't declared in Cargo.toml.
    // The 4th column of `df -k` output is "Available" in 1K-blocks.
    let output = Command::new("df").args(["-k", "/"]).output().ok();
    if let Some(out) = output {
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                if let Ok(kb) = parts[3].parse::<u64>() {
                    return kb * 1024;
                }
            }
        }
    }
    0
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, progress: &CustomCleanupProgress) {
    let _ = app.emit(EVENT_PROGRESS, progress);
}

fn emit_completed<R: Runtime>(app: &AppHandle<R>, result: &CustomCleanupFinalResult) {
    let _ = app.emit(EVENT_COMPLETED, result);
}

fn run_shell_command(command: &str, _abort_flag: &Arc<AtomicBool>) -> (bool, String) {
    let mut child = match Command::new("sh")
        .args(["-c", command])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return (false, format!("Failed to spawn: {e}")),
    };

    let start = Instant::now();
    // Poll loop: check abort flag periodically, but don't kill the process
    // once it's running — the contract says stop only prevents the next command.
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = child
                    .stdout
                    .take()
                    .and_then(|mut p| {
                        use std::io::Read;
                        let mut buf = String::new();
                        p.read_to_string(&mut buf).ok().map(|_| buf)
                    })
                    .unwrap_or_default();
                let stderr = child
                    .stderr
                    .take()
                    .and_then(|mut p| {
                        use std::io::Read;
                        let mut buf = String::new();
                        p.read_to_string(&mut buf).ok().map(|_| buf)
                    })
                    .unwrap_or_default();

                let mut output = stdout;
                if !stderr.is_empty() {
                    if !output.is_empty() {
                        output.push('\n');
                    }
                    output.push_str(&stderr);
                }

                let success = status.success();
                if !success && output.is_empty() {
                    output = format!("Exit code: {}", status.code().unwrap_or(-1));
                }
                return (success, output);
            }
            Ok(None) if start.elapsed().as_secs() > 300 => {
                // 5-minute timeout per command
                let _ = child.kill();
                let _ = child.wait();
                return (false, "Command timed out after 5 minutes".into());
            }
            Ok(None) => {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return (false, format!("Process error: {e}"));
            }
        }
    }
}

#[tauri::command]
pub fn get_custom_cleanup_commands() -> Vec<CleanupCommandDef> {
    builtin_commands()
}

#[tauri::command]
pub fn stop_custom_cleanup(flag: tauri::State<CustomCleanupAbortFlag>) {
    flag.0.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub async fn execute_custom_cleanup<R: Runtime>(
    app: AppHandle<R>,
    command_ids: Vec<String>,
    flag: tauri::State<'_, CustomCleanupAbortFlag>,
) -> Result<CustomCleanupFinalResult, String> {
    flag.0.store(false, Ordering::SeqCst);

    let all_commands = builtin_commands();
    let selected: Vec<&CleanupCommandDef> = command_ids
        .iter()
        .filter_map(|id| all_commands.iter().find(|c| c.id == *id))
        .collect();

    if selected.is_empty() {
        return Err("No valid commands selected".into());
    }

    let mut details: Vec<CustomCleanupProgress> = Vec::new();
    let mut total_freed: u64 = 0;
    let mut commands_executed: u32 = 0;
    let mut commands_failed: u32 = 0;
    let mut aborted = false;

    let before_all = measure_disk_free();

    for cmd in &selected {
        // Check if user requested stop
        if flag.0.load(Ordering::SeqCst) {
            aborted = true;
            break;
        }

        // Emit "running" progress
        let mut progress = CustomCleanupProgress {
            command_id: cmd.id.clone(),
            command_name: cmd.name.clone(),
            status: "running".into(),
            output: String::new(),
            freed_bytes: 0,
            error: None,
        };
        emit_progress(&app, &progress);

        let before = measure_disk_free();
        let (success, output) = run_shell_command(&cmd.command, &flag.0);
        let after = measure_disk_free();

        // Estimate freed space (guard against negative values from other
        // processes writing to disk during the command)
        let freed = if before > after && before_all > 0 {
            before.saturating_sub(after)
        } else {
            0
        };

        total_freed += freed;
        progress.status = if success {
            commands_executed += 1;
            "completed".into()
        } else {
            commands_failed += 1;
            "failed".into()
        };
        progress.output = output;
        progress.freed_bytes = freed;
        progress.error = if success {
            None
        } else {
            Some("Command exited with non-zero status".into())
        };

        emit_progress(&app, &progress);
        details.push(progress);
    }

    let final_result = CustomCleanupFinalResult {
        success: commands_failed == 0 && !aborted,
        total_freed_bytes: total_freed,
        commands_executed,
        commands_failed,
        details,
        aborted,
    };

    emit_completed(&app, &final_result);
    Ok(final_result)
}
