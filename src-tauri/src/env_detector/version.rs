use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

// 3 s is a balance between snappy scans and tools that have a non-trivial
// cold-start (java cold disk, mvn/gradle wrapper, conda activate, asdf shim).
// 1.2 s used to occasionally kill these tools and report them as "missing"
// even though they were correctly installed (#061).
const VERSION_TIMEOUT: Duration = Duration::from_millis(3000);

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
        .map(|line| strip_ansi(line.trim()))
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(120).collect())
}

/// Remove ANSI escape sequences from `line`. Tools such as `npm`, `pnpm` and
/// some `gradle` releases emit colour / cursor-move codes on stdout even when
/// not attached to a TTY, which would otherwise render as mojibake in the
/// version cell (#064). We handle the two common escape forms:
///   * CSI:  ESC `[` 0..* params (digits, ';', ':', '?') terminator (`@`..`~`)
///   * OSC:  ESC `]` ... ST (BEL or ESC `\`)
///
/// plus a generic catch-all that drops the lone ESC + following byte for
/// shorter sequences (e.g. `ESC ( B`).
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '\x1b' {
            out.push(ch);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for next in chars.by_ref() {
                    if matches!(next, '@'..='~') {
                        break;
                    }
                }
            }
            Some(']') => {
                let mut prev = '\0';
                for next in chars.by_ref() {
                    if next == '\x07' || (prev == '\x1b' && next == '\\') {
                        break;
                    }
                    prev = next;
                }
            }
            Some(_) => {}
            None => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_ansi_removes_csi_color_codes() {
        let input = "\x1b[31mv18.0.0\x1b[0m";
        assert_eq!(strip_ansi(input), "v18.0.0");
    }

    #[test]
    fn strip_ansi_removes_sgr_with_multiple_params() {
        let input = "\x1b[1;33;40mwarn\x1b[0m: deprecated";
        assert_eq!(strip_ansi(input), "warn: deprecated");
    }

    #[test]
    fn strip_ansi_removes_osc_terminated_by_bel() {
        let input = "\x1b]0;title here\x07hello";
        assert_eq!(strip_ansi(input), "hello");
    }

    #[test]
    fn strip_ansi_preserves_plain_text() {
        assert_eq!(strip_ansi("v18.0.0"), "v18.0.0");
        assert_eq!(strip_ansi("Python 3.12.4"), "Python 3.12.4");
    }

    #[test]
    fn extract_version_output_strips_ansi_from_first_non_empty_line() {
        let stdout = b"\x1b[1mv18.0.0\x1b[0m\n\x1b[2mwarning\x1b[0m\n";
        let result = extract_version_output(stdout, &[]).unwrap();
        assert_eq!(result, "v18.0.0");
    }

    #[test]
    fn extract_version_output_falls_back_to_stderr_when_stdout_empty() {
        let stderr = b"openjdk 21.0.1 2023-10-17 LTS\n";
        let result = extract_version_output(&[], stderr).unwrap();
        assert_eq!(result, "openjdk 21.0.1 2023-10-17 LTS");
    }
}
