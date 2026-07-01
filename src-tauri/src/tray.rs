//! System tray / 菜单栏托盘: quick show-window, sleep inhibitor toggle, quit (P4).

#[cfg(desktop)]
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;
#[cfg(desktop)]
use tauri::Manager;

#[cfg(desktop)]
const TRAY_ID: &str = "bench-tray";

#[cfg(desktop)]
fn sync_sleep_check(_app: &tauri::AppHandle, sleep_item: &CheckMenuItem<tauri::Wry>) {
    let checked = crate::sleep_inhibitor::commands::get_sleep_inhibitor_state()
        .map(|state| state.enabled)
        .unwrap_or(false);
    let _ = sleep_item.set_checked(checked);
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
    let quit = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &sleep, &quit])?;

    sync_sleep_check(app.handle(), &sleep);

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon()
                .ok_or("missing default window icon")?
                .clone(),
        )
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "tray_show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "tray_sleep" => {
                    let desired = sleep.is_checked().unwrap_or(false);
                    let config = crate::sleep_inhibitor::types::SleepConfig::default();
                    let _ = crate::sleep_inhibitor::commands::toggle_sleep_inhibitor(config, desired);
                    sync_sleep_check(app, &sleep);
                }
                "tray_quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg(not(desktop))]
pub fn setup_tray(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
