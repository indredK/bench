use super::types::HostsOverride;
use crate::error::{AppError, AppResult};
use std::fs;
use std::net::IpAddr;

const SUSPICIOUS_NAMES: &[&str] = &[
    "localhost",
    "broadcasthost",
    "cloudflare.com",
    "www.cloudflare.com",
    "google.com",
    "www.google.com",
    "github.com",
    "www.github.com",
];

pub fn check_hosts_overrides() -> AppResult<Vec<HostsOverride>> {
    let path = if cfg!(windows) {
        r"C:\Windows\System32\drivers\etc\hosts"
    } else {
        "/etc/hosts"
    };
    let content = fs::read_to_string(path).map_err(|e| AppError::io(format!("hosts: {e}")))?;
    let mut out = Vec::new();
    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let without_comment = trimmed.split('#').next().unwrap_or("").trim();
        let mut parts = without_comment.split_whitespace();
        let Some(address) = parts.next() else {
            continue;
        };
        if address.parse::<IpAddr>().is_err() {
            continue;
        }
        let names: Vec<String> = parts.map(str::to_string).collect();
        if names.is_empty() {
            continue;
        }
        let suspicious = is_suspicious(address, &names);
        out.push(HostsOverride {
            address: address.to_string(),
            names,
            line: idx + 1,
            suspicious,
        });
    }
    Ok(out)
}

fn is_suspicious(address: &str, names: &[String]) -> bool {
    let points_loopback = matches!(address, "127.0.0.1" | "::1" | "0.0.0.0");
    let has_interesting = names.iter().any(|n| {
        let lower = n.to_ascii_lowercase();
        SUSPICIOUS_NAMES
            .iter()
            .any(|s| lower == *s || lower.ends_with(&format!(".{s}")))
            && lower != "localhost"
            && lower != "broadcasthost"
    });
    points_loopback && has_interesting
}
