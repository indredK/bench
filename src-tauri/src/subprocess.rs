use std::io::Read;
use std::process::{Command, ExitStatus, Output, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// 单路输出捕获上限（1 MiB）。命令中心可执行任意用户命令，无上限捕获会因
/// 巨量输出膨胀内存，并在 IPC 序列化时进一步放大；超出部分直接截断。
const MAX_CAPTURE_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubprocessErrorKind {
    Spawn,
    Exit,
    Timeout,
    Wait,
    Aborted,
}

#[derive(Debug)]
pub struct SubprocessError {
    pub kind: SubprocessErrorKind,
    pub exit_code: Option<i32>,
}

pub struct CapturedOutput {
    pub output: Output,
    pub reached_time_limit: bool,
}

pub fn run_status_with_timeout(
    command: &mut Command,
    timeout: Duration,
) -> Result<ExitStatus, SubprocessError> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = command.spawn().map_err(|_| SubprocessError {
        kind: SubprocessErrorKind::Spawn,
        exit_code: None,
    })?;
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(status),
            Ok(Some(status)) => {
                return Err(SubprocessError {
                    kind: SubprocessErrorKind::Exit,
                    exit_code: status.code(),
                })
            }
            Ok(None) if started_at.elapsed() >= timeout => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                return Err(SubprocessError {
                    kind: SubprocessErrorKind::Timeout,
                    exit_code: None,
                });
            }
            Ok(None) => std::thread::sleep(POLL_INTERVAL),
            Err(_) => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                return Err(SubprocessError {
                    kind: SubprocessErrorKind::Wait,
                    exit_code: None,
                });
            }
        }
    }
}

pub fn run_output_with_timeout(
    command: &mut Command,
    timeout: Duration,
    abort: Option<Arc<AtomicBool>>,
) -> Result<Output, SubprocessError> {
    let captured = run_output_for_window(command, timeout, abort)?;
    if captured.reached_time_limit {
        return Err(SubprocessError {
            kind: SubprocessErrorKind::Timeout,
            exit_code: None,
        });
    }
    Ok(captured.output)
}

/// Capture for at most `window`, returning the bounded output available when the window ends.
/// This is for sampling workflows where a quiet interval is a valid, possibly empty result.
pub fn run_output_for_window(
    command: &mut Command,
    window: Duration,
    abort: Option<Arc<AtomicBool>>,
) -> Result<CapturedOutput, SubprocessError> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = command.spawn().map_err(|_| SubprocessError {
        kind: SubprocessErrorKind::Spawn,
        exit_code: None,
    })?;
    let stdout_reader = child
        .stdout
        .take()
        .map(|mut stdout| std::thread::spawn(move || read_capped(&mut stdout)));
    let stderr_reader = child
        .stderr
        .take()
        .map(|mut stderr| std::thread::spawn(move || read_capped(&mut stderr)));
    let started_at = Instant::now();

    let (status, reached_time_limit) = loop {
        if let Some(flag) = &abort {
            if flag.load(Ordering::SeqCst) {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                join_reader(stdout_reader);
                join_reader(stderr_reader);
                return Err(SubprocessError {
                    kind: SubprocessErrorKind::Aborted,
                    exit_code: None,
                });
            }
        }
        match child.try_wait() {
            Ok(Some(status)) => break (status, false),
            Ok(None) if started_at.elapsed() >= window => {
                terminate_process_tree(&mut child);
                let status = child.wait().map_err(|_| SubprocessError {
                    kind: SubprocessErrorKind::Wait,
                    exit_code: None,
                })?;
                break (status, true);
            }
            Ok(None) => std::thread::sleep(POLL_INTERVAL),
            Err(_) => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                join_reader(stdout_reader);
                join_reader(stderr_reader);
                return Err(SubprocessError {
                    kind: SubprocessErrorKind::Wait,
                    exit_code: None,
                });
            }
        }
    };

    let _ = child.wait();
    let stdout = collect_reader(stdout_reader)?;
    let stderr = collect_reader(stderr_reader)?;
    Ok(CapturedOutput {
        output: Output {
            status,
            stdout,
            stderr,
        },
        reached_time_limit,
    })
}

/// Output capped at this length may be truncated; parsers must fail closed instead of
/// treating an incomplete system snapshot as a complete empty/partial result.
pub fn output_may_be_truncated(output: &Output) -> bool {
    output.stdout.len() >= MAX_CAPTURE_BYTES as usize
        || output.stderr.len() >= MAX_CAPTURE_BYTES as usize
}

/// 只保留前 `MAX_CAPTURE_BYTES`，但持续排空剩余输出：
/// 若截断后停止读取，子进程会阻塞在管道写入上直至超时。
fn read_capped(reader: &mut impl Read) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut limited = reader.by_ref().take(MAX_CAPTURE_BYTES);
    std::io::copy(&mut limited, &mut bytes)?;
    std::io::copy(reader, &mut std::io::sink())?;
    Ok(bytes)
}

fn join_reader(reader: Option<std::thread::JoinHandle<std::io::Result<Vec<u8>>>>) {
    if let Some(reader) = reader {
        let _ = reader.join();
    }
}

fn collect_reader(
    reader: Option<std::thread::JoinHandle<std::io::Result<Vec<u8>>>>,
) -> Result<Vec<u8>, SubprocessError> {
    match reader {
        Some(reader) => reader
            .join()
            .ok()
            .and_then(Result::ok)
            .ok_or(SubprocessError {
                kind: SubprocessErrorKind::Wait,
                exit_code: None,
            }),
        None => Ok(Vec::new()),
    }
}

fn terminate_process_tree(child: &mut std::process::Child) {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        command.args(["/PID", &child.id().to_string(), "/T", "/F"]);
        let _ = run_termination_command(&mut command, Duration::from_secs(1));
    }

    #[cfg(unix)]
    {
        if let Ok(process_group) = i32::try_from(child.id()) {
            // SAFETY: every Unix child is launched in its own process group above;
            // a negative PID targets only that group and SIGKILL carries no pointer.
            // Timeout/cancel cleanup must not leave a descendant holding a pipe open.
            let _ = unsafe { libc::kill(-process_group, libc::SIGKILL) };
        }
    }

    let _ = child.kill();
}

#[cfg(any(target_os = "windows", test))]
fn run_termination_command(command: &mut Command, timeout: Duration) -> bool {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let Ok(mut child) = command.spawn() else {
        return false;
    };
    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if started_at.elapsed() < timeout => std::thread::sleep(POLL_INTERVAL),
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn kills_and_reaps_a_timed_out_process() {
        let started_at = Instant::now();
        let error = run_status_with_timeout(
            Command::new("sh").args(["-c", "sleep 30"]),
            Duration::from_millis(25),
        )
        .expect_err("command should time out");

        assert_eq!(error.kind, SubprocessErrorKind::Timeout);
        assert!(started_at.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[test]
    fn termination_utility_wait_is_bounded() {
        let started_at = Instant::now();
        let completed = run_termination_command(
            Command::new("sh").args(["-c", "exec sleep 60"]),
            Duration::from_millis(100),
        );
        assert!(!completed);
        assert!(started_at.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[test]
    fn output_capture_kills_a_timed_out_process() {
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 30"]);

        let started_at = Instant::now();
        let error = run_output_with_timeout(&mut command, Duration::from_millis(25), None)
            .expect_err("output command should time out");

        assert_eq!(error.kind, SubprocessErrorKind::Timeout);
        assert!(started_at.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[test]
    fn output_window_returns_flushed_partial_output_when_the_window_ends() {
        let mut command = Command::new("sh");
        command.args(["-c", "printf partial; sleep 30"]);

        let started_at = Instant::now();
        let captured = run_output_for_window(&mut command, Duration::from_millis(25), None)
            .expect("window end should return the available sample output");

        assert!(captured.reached_time_limit);
        assert_eq!(captured.output.stdout, b"partial");
        assert!(started_at.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[test]
    fn output_timeout_kills_descendants_that_ignore_soft_termination() {
        let mut command = Command::new("sh");
        command.args(["-c", "trap '' TERM; (trap '' TERM; exec sleep 30) & wait"]);

        let started_at = Instant::now();
        let error = run_output_with_timeout(&mut command, Duration::from_millis(25), None)
            .expect_err("output command should time out");

        assert_eq!(error.kind, SubprocessErrorKind::Timeout);
        assert!(started_at.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn reports_non_zero_exit_status() {
        #[cfg(unix)]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "exit 7"]);
            command
        };
        #[cfg(windows)]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/C", "exit 7"]);
            command
        };

        let error = run_status_with_timeout(&mut command, Duration::from_secs(1))
            .expect_err("command should fail");
        assert_eq!(error.kind, SubprocessErrorKind::Exit);
        assert_eq!(error.exit_code, Some(7));
    }

    #[test]
    fn drains_captured_output_without_blocking() {
        #[cfg(unix)]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "printf 'ready'; printf 'warning' >&2"]);
            command
        };
        #[cfg(windows)]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/C", "echo ready"]);
            command
        };

        let output = run_output_with_timeout(&mut command, Duration::from_secs(1), None).unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "ready");
    }

    #[test]
    fn abort_terminates_and_reaps_a_running_process() {
        #[cfg(unix)]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 30"]);
            command
        };
        #[cfg(windows)]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/C", "ping -n 30 127.0.0.1 >NUL"]);
            command
        };

        let abort = Arc::new(AtomicBool::new(false));
        let abort_after_start = abort.clone();
        let cancel = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(150));
            abort_after_start.store(true, Ordering::SeqCst);
        });
        let started_at = Instant::now();
        let error = run_output_with_timeout(&mut command, Duration::from_secs(10), Some(abort))
            .expect_err("aborting should stop the running process");
        cancel.join().unwrap();

        assert_eq!(error.kind, SubprocessErrorKind::Aborted);
        assert!(started_at.elapsed() < Duration::from_secs(3));
    }

    #[cfg(unix)]
    #[test]
    fn caps_captured_output_at_the_per_stream_limit() {
        let mut command = Command::new("sh");
        // 2 MiB 输出，应被截断到 MAX_CAPTURE_BYTES。
        command.args(["-c", "yes a | head -c 2097152"]);

        let output = run_output_with_timeout(&mut command, Duration::from_secs(10), None)
            .expect("capture should succeed");
        assert!(output.status.success());
        assert_eq!(output.stdout.len(), MAX_CAPTURE_BYTES as usize);
        assert!(output_may_be_truncated(&output));
    }
}
