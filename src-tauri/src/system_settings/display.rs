use super::helpers::*;

/// 读取电池百分比显示开关状态。
///
/// 兼容性说明 (跨版本):
/// - macOS 26 (Tahoe) 及更新:由 `ByHost/com.apple.controlcenter` 域中的 `Battery` 键控制
///   (值 2 = 显示在菜单栏带百分比,值 8 = 仅在控制中心不显示在菜单栏)
///   —— 通过 diff 两次 defaults 快照 + 实证写入测试发现的真实控制键,
///   而非旧文档所称的 `BatteryShowPercentage` 或 `NSStatusItem VisibleCC Battery`
///   (这些键在 Tahoe 上系统不读取,旧版本应用曾错误写入造成"开关已开但实际未生效"的误导)
/// - macOS 25 及更早:由 `com.apple.menuextra.battery ShowPercent` 控制
/// - NSGlobalDomain BatteryShowPercent 作为部分版本的备选
///
/// 读取顺序:按版本分发,Tahoe+ 读 ByHost 域 Battery 键,旧版本读旧键 + 备选键。
#[tauri::command]
pub async fn get_display_battery_percent() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ver = macos_major_version();

        // macOS 26 (Tahoe)+ :真实控制键 (实证发现)
        // ByHost/com.apple.controlcenter Battery:2 = 显示,8 = 隐藏
        if ver >= 26 {
            if let Ok(val) = defaults_read_current_host("com.apple.controlcenter", "Battery") {
                return Ok(val.trim() == "2");
            }
            return Ok(false);
        }

        // macOS 25 及更早:旧键
        if let Ok(val) = defaults_read("com.apple.menuextra.battery", "ShowPercent") {
            let v = val.trim().to_lowercase();
            if v == "yes" || v == "true" || v == "1" {
                return Ok(true);
            }
            if v == "no" || v == "false" || v == "0" {
                return Ok(false);
            }
        }
        // 备选:NSGlobalDomain
        if let Ok(val) = defaults_read("NSGlobalDomain", "BatteryShowPercent") {
            let v = val.trim().to_lowercase();
            if v == "yes" || v == "true" || v == "1" {
                return Ok(true);
            }
            if v == "no" || v == "false" || v == "0" {
                return Ok(false);
            }
        }
        Ok(false)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 设置电池百分比显示开关 (直接控制,不弹出系统设置)。
///
/// 实现原理 (跨版本兼容):
/// - macOS 26 (Tahoe) 及更新:写入 `ByHost/com.apple.controlcenter` 域中的 `Battery` 键
///   (值 2 = 显示在菜单栏,8 = 仅在控制中心),然后 killall ControlCenter 刷新,立即生效。
///   (实证发现:旧文档的 `BatteryShowPercentage` / `NSStatusItem VisibleCC Battery` 键
///   在 Tahoe 上系统不读取,只有 ByHost 域的 `Battery` 键是真实控制源)
/// - macOS 25 (Sequoia) 及更早:写入 `com.apple.menuextra.battery ShowPercent` 等
///   defaults 键 + killall 刷新菜单栏进程,立即生效
#[tauri::command]
pub async fn set_display_battery_percent(show: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ver = macos_major_version();

        // macOS 26 (Tahoe)+ :真实控制键
        // ByHost/com.apple.controlcenter Battery:2 = 显示,8 = 隐藏
        if ver >= 26 {
            let val = if show { "2" } else { "8" };
            defaults_write_current_host("com.apple.controlcenter", "Battery", val)?;
            restart_controlcenter();
            return Ok(());
        }

        let val = if show { "true" } else { "false" };

        // macOS 25 (Sequoia) 及更早:写入新旧两个 defaults 键 + 刷新菜单栏进程
        // 1. 写入新键 (Ventura 13+ 使用 com.apple.controlcenter 域)
        defaults_write("com.apple.controlcenter", "BatteryShowPercentage", val)?;
        // 2. 写入旧键 (Monterey 及更早使用 com.apple.menuextra.battery 域,写入无害)
        defaults_write("com.apple.menuextra.battery", "ShowPercent", val)?;
        // 3. 刷新菜单栏:同时重启 SystemUIServer (旧版) 和 ControlCenter (新版)
        //    覆盖 macOS 各版本的菜单栏刷新机制,确保设置立即生效
        restart_system_ui_server();
        restart_controlcenter();

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
