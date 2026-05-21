use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

const VERSION_TIMEOUT: Duration = Duration::from_millis(1200);

pub(super) fn detect_tool_version(path: &Path, args: &[&str]) -> Option<String> {
    if args.is_empty() {
        return None;
    }

    let mut child = Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output().ok()?;
                return extract_version_output(&output.stdout, &output.stderr);
            }
            Ok(None) if start.elapsed() >= VERSION_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn extract_version_output(stdout: &[u8], stderr: &[u8]) -> Option<String> {
    let stdout = String::from_utf8_lossy(stdout);
    let stderr = String::from_utf8_lossy(stderr);
    let output = if stdout.trim().is_empty() {
        stderr.trim()
    } else {
        stdout.trim()
    };

    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(120).collect())
}
