use std::io::Read;
use std::process::{Command, ExitStatus, Output, Stdio};
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubprocessErrorKind {
    Spawn,
    Exit,
    Timeout,
    Wait,
}

#[derive(Debug)]
pub struct SubprocessError {
    pub kind: SubprocessErrorKind,
    pub exit_code: Option<i32>,
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
) -> Result<Output, SubprocessError> {
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
    let stdout_reader = child.stdout.take().map(|mut stdout| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stdout.read_to_end(&mut bytes).map(|_| bytes)
        })
    });
    let stderr_reader = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stderr.read_to_end(&mut bytes).map(|_| bytes)
        })
    });
    let started_at = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started_at.elapsed() >= timeout => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                join_reader(stdout_reader);
                join_reader(stderr_reader);
                return Err(SubprocessError {
                    kind: SubprocessErrorKind::Timeout,
                    exit_code: None,
                });
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
    Ok(Output {
        status,
        stdout,
        stderr,
    })
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
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(unix)]
    {
        let process_group = format!("-{}", child.id());
        let _ = Command::new("kill")
            .args(["-TERM", &process_group])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    let _ = child.kill();
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

        let output = run_output_with_timeout(&mut command, Duration::from_secs(1)).unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "ready");
    }
}
