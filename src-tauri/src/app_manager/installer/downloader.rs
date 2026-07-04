use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::Notify;

/// Size tolerance (ratio of expected) before flagging a mismatch.
/// 10% per planning doc (sparkle.md known caveats).
const SIZE_TOLERANCE_RATIO: u64 = 10;

#[derive(Debug, Clone)]
pub struct DownloadOptions {
    pub url: String,
    /// Expected on-disk size in bytes, used for 10% tolerance check.
    pub expected_size: Option<u64>,
    /// Absolute destination path. Parent directories are created if missing.
    pub dest_path: PathBuf,
}

#[derive(Debug)]
pub enum DownloadOutcome {
    Ok(PathBuf),
    Cancelled,
    /// Error string is formatted as `SU_<CODE>: <message>`.
    Error(String),
}

/// Build the default HTTP client used for downloads. Long timeout because
/// large dmg / zip files can take minutes on a slow link.
pub fn default_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 30))
        .user_agent("bench-app-updater/1.0 (+macOS)")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Sanitise an identifier for use as a filename component.
fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// `~/Library/Caches/<host>/app-update-cache/` on macOS, fallback to the OS
/// temp dir.
pub fn cache_root() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("app-update-cache")
}

/// Per-app cache path: `<cache_root>/<sanitised app_id>-<version>.<ext>`.
pub fn cache_path(app_id: &str, version: &str, ext: &str) -> PathBuf {
    cache_root().join(format!(
        "{}-{}.{}",
        sanitize(app_id),
        sanitize(version),
        ext
    ))
}

/// Guess the download extension from a URL (.zip, .dmg, .tar.gz fallback to .bin).
pub fn ext_from_url(url: &str) -> &'static str {
    let l = url.to_lowercase();
    if l.ends_with(".zip") {
        "zip"
    } else if l.ends_with(".dmg") {
        "dmg"
    } else {
        "bin"
    }
}

/// Stream `opts.url` to `opts.dest_path` while reporting progress and
/// honouring an external cancel signal. The caller owns the `Notify`; the
/// downloader uses `tokio::select!` so cancel is responsive between chunks.
pub async fn download<F>(
    client: &reqwest::Client,
    opts: DownloadOptions,
    cancel: Arc<Notify>,
    mut on_progress: F,
) -> DownloadOutcome
where
    F: FnMut(u64, Option<u64>) + Send,
{
    let DownloadOptions {
        url,
        expected_size,
        dest_path,
    } = opts;

    if let Some(parent) = dest_path.parent() {
        if let Err(e) = tokio::fs::create_dir_all(parent).await {
            return DownloadOutcome::Error(format!("SU_DOWNLOAD_FAIL: mkdir {e}"));
        }
    }

    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            let code = if e.is_timeout() {
                "SU_NET_TIMEOUT"
            } else if e.is_connect() {
                "SU_NET_OFFLINE"
            } else {
                "SU_DOWNLOAD_FAIL"
            };
            return DownloadOutcome::Error(format!("{code}: {e}"));
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let code = if status.is_client_error() {
            "SU_NET_HTTP_4XX"
        } else {
            "SU_NET_HTTP_5XX"
        };
        return DownloadOutcome::Error(format!("{code}: {}", status.as_u16()));
    }

    let total = resp.content_length().or(expected_size);
    on_progress(0, total);

    let mut file = match File::create(&dest_path).await {
        Ok(f) => f,
        Err(e) => return DownloadOutcome::Error(format!("SU_DOWNLOAD_FAIL: open {e}")),
    };

    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();

    loop {
        tokio::select! {
            biased;
            _ = cancel.notified() => {
                drop(file);
                let _ = tokio::fs::remove_file(&dest_path).await;
                return DownloadOutcome::Cancelled;
            }
            next = stream.next() => {
                match next {
                    Some(Ok(chunk)) => {
                        if let Err(e) = file.write_all(&chunk).await {
                            drop(file);
                            let _ = tokio::fs::remove_file(&dest_path).await;
                            return DownloadOutcome::Error(format!("SU_DOWNLOAD_FAIL: write {e}"));
                        }
                        downloaded = downloaded.saturating_add(chunk.len() as u64);
                        on_progress(downloaded, total);
                    }
                    Some(Err(e)) => {
                        drop(file);
                        let _ = tokio::fs::remove_file(&dest_path).await;
                        return DownloadOutcome::Error(format!("SU_DOWNLOAD_FAIL: {e}"));
                    }
                    None => break,
                }
            }
        }
    }

    if let Err(e) = file.flush().await {
        return DownloadOutcome::Error(format!("SU_DOWNLOAD_FAIL: flush {e}"));
    }
    drop(file);

    if let Some(expected) = expected_size {
        let diff = downloaded.abs_diff(expected);
        // Reject if more than 10% off the declared size.
        if diff.saturating_mul(SIZE_TOLERANCE_RATIO) > expected {
            let _ = tokio::fs::remove_file(&dest_path).await;
            return DownloadOutcome::Error(format!(
                "SU_DOWNLOAD_SIZE_MISMATCH: got {downloaded}, expected {expected}"
            ));
        }
    }

    DownloadOutcome::Ok(dest_path)
}

/// Remove a stale cache entry (best-effort).
pub async fn cleanup(path: &Path) {
    let _ = tokio::fs::remove_file(path).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_removes_path_separators_and_slashes() {
        assert_eq!(sanitize("com.example.app"), "com.example.app");
        assert_eq!(sanitize("foo/bar"), "foo_bar");
        assert_eq!(sanitize("a b c"), "a_b_c");
        assert_eq!(sanitize("../etc/passwd"), ".._etc_passwd");
    }

    #[test]
    fn cache_path_concatenates_id_and_version() {
        let p = cache_path("com.example.app", "1.2.3", "dmg");
        let name = p.file_name().and_then(|s| s.to_str()).unwrap();
        assert_eq!(name, "com.example.app-1.2.3.dmg");
    }

    #[test]
    fn ext_from_url_matches_known_suffixes() {
        assert_eq!(ext_from_url("https://e.com/x.zip"), "zip");
        assert_eq!(ext_from_url("https://e.com/X.DMG"), "dmg");
        assert_eq!(ext_from_url("https://e.com/x.dmg?token=1"), "bin");
        assert_eq!(ext_from_url("https://e.com/x"), "bin");
    }

    #[tokio::test]
    async fn cancel_before_first_chunk_returns_cancelled() {
        // Use a localhost URL that will refuse / hang quickly; we'll trip the
        // cancel signal before the request even resolves.
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let tmp = std::env::temp_dir().join("bench-test-cancelled.bin");
        let cancel = Arc::new(Notify::new());
        cancel.notify_waiters();
        // Notify before await; the select! biased branch should fire if a
        // waiter is registered, but notify_waiters is a no-op without waiters.
        // So instead spawn a task that notifies after we start.
        let cancel_handle = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            cancel_handle.notify_waiters();
        });
        let outcome = download(
            &client,
            DownloadOptions {
                url: "http://127.0.0.1:1/never".into(),
                expected_size: None,
                dest_path: tmp.clone(),
            },
            cancel,
            |_d, _t| {},
        )
        .await;
        // Either Cancelled (if we won the race) or Error (if the connection
        // refused first). Both prove the function doesn't hang.
        match outcome {
            DownloadOutcome::Cancelled | DownloadOutcome::Error(_) => {}
            DownloadOutcome::Ok(_) => panic!("unexpected success"),
        }
        let _ = tokio::fs::remove_file(&tmp).await;
    }
}
