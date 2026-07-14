use crate::error::{AppError, AppResult};

#[cfg(not(target_os = "macos"))]
use super::types::SystemSettingsSnapshot;
#[cfg(target_os = "macos")]
use super::types::{
    FinderSettingsSnapshot, NetworkSettingsSnapshot, ScreenshotSettingsSnapshot,
    SystemSettingsSnapshot, SystemToggleSnapshot,
};

#[cfg(target_os = "macos")]
fn read_snapshot() -> SystemSettingsSnapshot {
    SystemSettingsSnapshot {
        finder: FinderSettingsSnapshot {
            show_hidden_files: super::finder::read_finder_show_hidden_files().ok(),
            show_pathbar: super::finder::read_finder_show_pathbar().ok(),
            show_statusbar: super::finder::read_finder_show_statusbar().ok(),
            show_library_dir: super::finder::read_finder_show_library_dir().ok(),
            show_file_extensions: super::finder::read_finder_show_file_extensions().ok(),
            no_ds_store: super::finder::read_finder_no_ds_store().ok(),
        },
        screenshot: ScreenshotSettingsSnapshot {
            format: super::screenshot::read_screenshot_format().ok(),
            disable_shadow: super::screenshot::read_screenshot_disable_shadow().ok(),
            show_thumbnail: super::screenshot::read_screenshot_show_thumbnail().ok(),
            save_location: super::screenshot::read_screenshot_save_location().ok(),
        },
        network: NetworkSettingsSnapshot {
            firewall: super::network::read_network_firewall_state().ok(),
            ssh: super::network::read_network_ssh_state().ok(),
            screen_sharing: super::network::read_network_screen_sharing_state().ok(),
            airdrop_disabled: super::network::read_network_airdrop_disabled().ok(),
        },
        toggles: SystemToggleSnapshot {
            autohide_dock: super::system_toggles::read_autohide_dock_state().ok(),
            autohide_menu_bar: super::system_toggles::read_autohide_menu_bar_state().ok(),
            dock_show_recents: super::system_toggles::read_dock_show_recents_state().ok(),
            hide_desktop_icons: super::system_toggles::read_hide_desktop_icons_state().ok(),
            low_power_mode: super::system_toggles::read_low_power_mode_state().ok(),
            screen_saver: super::system_toggles::read_screen_saver_state().ok(),
        },
    }
}

#[tauri::command]
pub async fn get_system_settings_snapshot() -> AppResult<SystemSettingsSnapshot> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            Ok(read_snapshot())
        }

        #[cfg(not(target_os = "macos"))]
        {
            Err(AppError::unsupported(
                "System settings snapshots are only supported on macOS",
            ))
        }
    })
    .await
    .map_err(|error| AppError::task_failed(format!("get_system_settings_snapshot: {error}")))?
}
