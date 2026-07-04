use super::helpers::*;

// ---------------------------------------------------------------------------
// Autohide Dock
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn set_autohide_dock_state(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enabled { "true" } else { "false" };
        defaults_write("com.apple.dock", "autohide", val)?;
        restart_dock();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Autohide Menu Bar (四态控制)
// ---------------------------------------------------------------------------
//
// macOS 系统设置中 "Automatically hide and show the menu bar" 实际上是四态选项
// (位置:System Settings > Menu Bar (Tahoe) / Control Center (旧版)):
//   - Never             永不隐藏
//   - In Full Screen Only  仅全屏时隐藏 (默认)
//   - On Desktop Only   仅桌面时隐藏 (macOS Sierra+ 新增)
//   - Always            始终隐藏
//
// 控制机制:由 NSGlobalDomain (.GlobalPreferences) 中两个 bool 键组合实现,
// 以及 com.apple.controlcenter 中一个 int 键控制设置 UI 显示:
//
//   | 模式                 | AppleMenuBarVisibleInFullscreen | _HIHideMenuBar | AutoHideMenuBarOption |
//   |----------------------|---------------------------------|-----------------|-----------------------|
//   | never                | true                            | false           | 3                     |
//   | in_full_screen_only  | false                           | false           | 2                     |
//   | on_desktop_only      | true                            | true            | 1                     |
//   | always               | false                           | true            | 0                     |
//
// 实现要求:写入时必须同时写入全部三个键,只改部分会导致设置 UI 与实际行为不一致。
//
// 历史根因:旧实现错误地写入 `com.apple.dock autohide-menubar` 键,
// 该键并非 macOS 系统设置 "Automatically hide and show the menu bar" 的真实控制键,
// 系统不会读取,因此设置无效。正确做法是写入 NSGlobalDomain 的上述两个键组合。
//
// 参考:
//   - Apple Support: Change Menu Bar settings on Mac
//     https://support.apple.com/guide/mac-help/change-menu-bar-settings-mchlad96d366/26/mac/26
//   - .GlobalPreferences MDM payload: AppleMenuBarVisibleInFullscreen + _HIHideMenuBar

/// 菜单栏自动隐藏模式
const MENU_BAR_MODE_NEVER: &str = "never";
const MENU_BAR_MODE_IN_FULL_SCREEN_ONLY: &str = "in_full_screen_only";
const MENU_BAR_MODE_ON_DESKTOP_ONLY: &str = "on_desktop_only";
const MENU_BAR_MODE_ALWAYS: &str = "always";

#[tauri::command]
pub async fn set_autohide_menu_bar_state(mode: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 根据目标模式计算三个键的取值（功能键 + UI 键）
        let (_in_full, hide, ui_option) = match mode.as_str() {
            MENU_BAR_MODE_ALWAYS => ("false", "true", "0"),
            MENU_BAR_MODE_NEVER => ("true", "false", "3"),
            MENU_BAR_MODE_ON_DESKTOP_ONLY => ("true", "true", "1"),
            MENU_BAR_MODE_IN_FULL_SCREEN_ONLY => ("false", "false", "2"),
            other => return Err(format!("Invalid menu bar autohide mode: {}", other)),
        };

        // 写入功能键（NSGlobalDomain）+ UI 键（com.apple.controlcenter）
        // 三键必须同时写入,只改部分会导致设置 UI 与实际行为不一致
        //
        // macOS Tahoe 上 `defaults write` 写入的值只是状态记录键,不触发系统行为变更。
        // System Settings 使用 System Events API 来实际切换菜单栏隐藏行为。
        // 参考 OnlySwitch: 通过 `tell application "System Events" to tell dock preferences
        // to set autohide menu bar` 来控制。
        //
        // 注意:此方案需要 TCC Automation 权限(System Events)。

        // 方案一: 通过 System Events AppleScript 控制（与 System Settings 相同路径）
        let autohide = if hide == "true" { "true" } else { "false" };
        let script = format!(
            "tell application \"System Events\"\n\
             \ttell dock preferences to set autohide menu bar to {}\n\
             end tell",
            autohide
        );
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("osascript: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("System Events failed: {}", stderr));
        }

        // 同步更新 com.apple.controlcenter AutoHideMenuBarOption（UI 键）
        // 确保系统设置 UI 显示正确
        defaults_write("com.apple.controlcenter", "AutoHideMenuBarOption", ui_option)?;

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Show Recent Apps on Dock
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn set_dock_show_recents_state(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let val = if enabled { "true" } else { "false" };
        defaults_write("com.apple.dock", "show-recents", val)?;
        restart_dock();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Hide Desktop Icons
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn set_hide_desktop_icons_state(hide: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // CreateDesktop 是布尔键:隐藏时 false,显示时 true
        // (规范 C-6:布尔值须用 "true"/"false" 走 -bool 分支)
        let val = if hide { "false" } else { "true" };
        defaults_write("com.apple.finder", "CreateDesktop", val)?;
        restart_finder();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Low Power Mode
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn set_low_power_mode_state(mode: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        match mode.as_str() {
            "never" => {
                sudo_cmd("pmset -a lowpowermode 0")?;
            }
            "always" => {
                sudo_cmd("pmset -a lowpowermode 1")?;
            }
            "on_battery_only" => {
                sudo_cmd("pmset -b lowpowermode 1")?;
                sudo_cmd("pmset -c lowpowermode 0")?;
            }
            "on_ac_only" => {
                sudo_cmd("pmset -b lowpowermode 0")?;
                sudo_cmd("pmset -c lowpowermode 1")?;
            }
            other => return Err(format!("Invalid low power mode: {}", other)),
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Screen Saver
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn set_screen_saver_state(enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if enabled {
            let script = r#"tell application "System Events" to tell screen saver preferences to set delay interval to 300"#;
            run_cmd_err("osascript", &["-e", script])?;
        } else {
            let script = r#"tell application "System Events" to tell screen saver preferences to set delay interval to 0"#;
            run_cmd_err("osascript", &["-e", script])?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
