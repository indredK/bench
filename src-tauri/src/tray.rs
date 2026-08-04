//! System tray / 菜单栏托盘: quick show-window, sleep inhibitor toggle, quit (P4).
use crate::error::AppResult;

#[cfg(desktop)]
use std::sync::Mutex;
#[cfg(desktop)]
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;
#[cfg(desktop)]
use tauri::Manager;

#[cfg(desktop)]
const TRAY_ID: &str = "bench-tray";

/// 显示并聚焦主窗口。
///
/// - 窗口存在但隐藏/最小化: 先恢复最小化, 再 show + set_focus。
/// - 窗口已被销毁(例如关闭行为为「退出」时窗口被关闭但进程仍在):
///   按 tauri.conf.json 的 main 窗口配置重建, 避免出现托盘点击无响应的僵尸状态。
#[cfg(desktop)]
pub fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
        .title("Bench - DevTools")
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 600.0)
        .center()
        .resizable(true)
        .visible(true)
        .decorations(false)
        .transparent(true);
    // `title_bar_style` 是 macOS 专有 builder API（Windows 上不存在该方法），
    // 必须用 cfg 包裹，否则 Windows CI 编译失败（coding-standards §7.4 平台适配）。
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
    let rebuilt = builder.build();
    match rebuilt {
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(error) => eprintln!("[tray] rebuild main window failed: {error}"),
    }
}

#[cfg(desktop)]
pub struct TrayMenuItems {
    pub show: MenuItem<tauri::Wry>,
    pub sleep: CheckMenuItem<tauri::Wry>,
    pub autostart: CheckMenuItem<tauri::Wry>,
    pub quit: MenuItem<tauri::Wry>,
}

#[cfg(desktop)]
fn sync_sleep_check(_app: &tauri::AppHandle, sleep_item: &CheckMenuItem<tauri::Wry>) {
    let checked = crate::sleep_inhibitor::commands::get_sleep_inhibitor_state()
        .map(|state| state.enabled)
        .unwrap_or(false);
    let _ = sleep_item.set_checked(checked);
}

#[cfg(desktop)]
fn sync_autostart_check(_app: &tauri::AppHandle, item: &CheckMenuItem<tauri::Wry>) {
    let item = item.clone();
    tauri::async_runtime::spawn(async move {
        let checked = crate::system_settings::login_items::get_autostart_status()
            .await
            .unwrap_or(false);
        let _ = item.set_checked(checked);
    });
}

#[cfg(desktop)]
pub fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "tray_show", "Show Bench", true, None::<&str>)?;
    let sleep = CheckMenuItem::with_id(
        app,
        "tray_sleep",
        "Prevent Sleep",
        true,
        false,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(
        app,
        "tray_autostart",
        "Launch at Login",
        true,
        false,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &sleep, &autostart, &quit])?;

    // 克隆菜单项句柄存入 managed state,供 set_tray_labels 在运行时更新文案
    app.manage(Mutex::new(TrayMenuItems {
        show: show.clone(),
        sleep: sleep.clone(),
        autostart: autostart.clone(),
        quit: quit.clone(),
    }));

    sync_sleep_check(app.handle(), &sleep);
    sync_autostart_check(app.handle(), &autostart);

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/tray-icon.png"
        ))?)
        .icon_as_template(true)
        .menu(&menu)
        // 左键单击显示主窗口, 右键单击弹出菜单 (macOS/Windows 原生右键菜单行为)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "tray_show" => {
                show_main_window(app);
            }
            "tray_sleep" => {
                let desired = sleep.is_checked().unwrap_or(false);
                let config = crate::sleep_inhibitor::types::SleepConfig::default();
                let _ = crate::sleep_inhibitor::commands::toggle_sleep_inhibitor(config, desired);
                sync_sleep_check(app, &sleep);
            }
            "tray_autostart" => {
                let desired = autostart.is_checked().unwrap_or(false);
                let app_handle = app.clone();
                let autostart_clone = autostart.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::system_settings::login_items::set_autostart(desired).await;
                    sync_autostart_check(&app_handle, &autostart_clone);
                });
            }
            "tray_quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg(not(desktop))]
pub fn setup_tray(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

/// 更新托盘菜单文案; 由前端在启动与语言切换时调用,使托盘跟随应用主语言。
#[tauri::command]
#[allow(unused_variables)]
pub fn set_tray_labels(
    app: tauri::AppHandle,
    show: String,
    sleep: String,
    autostart: String,
    quit: String,
) -> AppResult<()> {
    #[cfg(desktop)]
    {
        let state = app.state::<Mutex<TrayMenuItems>>();
        let items = state.lock().map_err(|e| e.to_string())?;
        items.show.set_text(&show).map_err(|e| e.to_string())?;
        items.sleep.set_text(&sleep).map_err(|e| e.to_string())?;
        items
            .autostart
            .set_text(&autostart)
            .map_err(|e| e.to_string())?;
        items.quit.set_text(&quit).map_err(|e| e.to_string())?;
    }
    Ok(())
}
