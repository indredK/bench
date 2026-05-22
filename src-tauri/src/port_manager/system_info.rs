use super::types::SystemInfo;
use std::process::Command;
use sysinfo::System;

pub(super) fn collect_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_memory = sys.total_memory();
    let available_memory = sys.available_memory();
    let used_memory = total_memory.saturating_sub(available_memory);
    let memory_usage_percent = if total_memory > 0 {
        ((used_memory as f64 / total_memory as f64) * 100.0).clamp(0.0, 100.0) as f32
    } else {
        0.0
    };

    SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::long_os_version().unwrap_or_else(|| "Unknown".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "Unknown".to_string()),
        hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
        cpu_brand: sys
            .cpus()
            .first()
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        cpu_cores: sys.cpus().len() as u32,
        total_memory,
        available_memory,
        used_memory,
        memory_usage_percent,
        uptime_seconds: System::uptime(),
        arch: std::env::consts::ARCH.to_string(),
        model_name: detect_model_name(),
        distribution: detect_distribution(),
    }
}

#[cfg(target_os = "macos")]
fn detect_model_name() -> String {
    Command::new("sysctl")
        .args(["-n", "hw.model"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

#[cfg(not(target_os = "macos"))]
fn detect_model_name() -> String {
    String::new()
}

#[cfg(target_os = "linux")]
fn detect_distribution() -> String {
    let id = sysinfo::System::distribution_id();
    let version = sysinfo::System::long_os_version().unwrap_or_default();
    format!("{} {}", id, version)
}

#[cfg(not(target_os = "linux"))]
fn detect_distribution() -> String {
    String::new()
}
