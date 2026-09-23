use super::helpers::*;
use crate::error::{AppError, AppResult};

/// macOS 26 (Tahoe) 把电池百分比存在 ByHost `com.apple.controlcenter/Battery`：`2` 显示，
/// 其余（含键不存在）为隐藏。
fn battery_percent_from_current_host(raw: Option<&str>) -> bool {
    raw.map(str::trim) == Some("2")
}

/// 旧版分散在两个域里，取第一个能解析成布尔的（`menuextra.battery` 优先，其次
/// `NSGlobalDomain`）；都缺失或都不可解析 → `None`，由调用方回落隐藏。
fn battery_percent_from_legacy(menu_extra: Option<&str>, global: Option<&str>) -> Option<bool> {
    [menu_extra, global]
        .into_iter()
        .flatten()
        .find_map(|value| parse_defaults_bool(value).ok())
}

#[tauri::command]
pub async fn get_display_battery_percent() -> AppResult<bool> {
    tauri::async_runtime::spawn_blocking(|| {
        let ver = macos_major_version();

        if ver >= 26 {
            let raw = defaults_read_current_host_optional("com.apple.controlcenter", "Battery")
                .map_err(AppError::internal)?;
            return Ok(battery_percent_from_current_host(raw.as_deref()));
        }

        let menu_extra = defaults_read_optional("com.apple.menuextra.battery", "ShowPercent")
            .map_err(AppError::internal)?;
        let global = defaults_read_optional("NSGlobalDomain", "BatteryShowPercent")
            .map_err(AppError::internal)?;
        Ok(battery_percent_from_legacy(menu_extra.as_deref(), global.as_deref()).unwrap_or(false))
    })
    .await
    .map_err(|e| AppError::internal(format!("get_display_battery_percent: {e}")))?
}

#[tauri::command]
pub async fn set_display_battery_percent(show: bool) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let ver = macos_major_version();

        if ver >= 26 {
            let val = if show { "2" } else { "8" };
            defaults_write_current_host("com.apple.controlcenter", "Battery", val)?;
            restart_controlcenter();
            return Ok(());
        }

        let val = if show { "true" } else { "false" };

        defaults_write("com.apple.controlcenter", "BatteryShowPercentage", val)?;
        defaults_write("com.apple.menuextra.battery", "ShowPercent", val)?;
        restart_system_ui_server();
        restart_controlcenter();

        Ok(())
    })
    .await
    .map_err(|e| AppError::internal(format!("set_display_battery_percent: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::{battery_percent_from_current_host, battery_percent_from_legacy};

    #[test]
    fn current_host_treats_only_two_as_shown() {
        assert!(battery_percent_from_current_host(Some("2")));
        assert!(battery_percent_from_current_host(Some(" 2 ")));
        assert!(!battery_percent_from_current_host(Some("8")));
        // Key absent → hidden (benign default), NOT an error.
        assert!(!battery_percent_from_current_host(None));
    }

    #[test]
    fn legacy_prefers_first_parseable_domain() {
        assert_eq!(battery_percent_from_legacy(Some("yes"), None), Some(true));
        assert_eq!(
            battery_percent_from_legacy(Some("0"), Some("yes")),
            Some(false)
        );
        // First domain unparseable → fall through to the second.
        assert_eq!(
            battery_percent_from_legacy(Some("garbage"), Some("true")),
            Some(true)
        );
    }

    // Reliability guard (design §2): a genuinely absent/unreadable value falls back to
    // `None` so the caller reports the documented default; a real subprocess error is
    // surfaced by the caller before ever reaching this pure function.
    #[test]
    fn legacy_returns_none_when_neither_domain_has_a_boolean() {
        assert_eq!(battery_percent_from_legacy(None, None), None);
        assert_eq!(battery_percent_from_legacy(None, Some("garbage")), None);
    }
}
