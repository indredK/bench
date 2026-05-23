use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
#[cfg(debug_assertions)]
use tauri::Manager;
use tauri::Emitter;

pub fn setup_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let about = MenuItemBuilder::with_id("about", "About Bench").build(app)?;
    let check_updates =
        MenuItemBuilder::with_id("check_updates", "Check for Updates...").build(app)?;
    let preferences = MenuItemBuilder::with_id("preferences", "Preferences...")
        .accelerator("Cmd+,")
        .build(app)?;
    let services = PredefinedMenuItem::services(app, None)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all = PredefinedMenuItem::show_all(app, None)?;
    let quit = PredefinedMenuItem::quit(app, None)?;

    let app_submenu = SubmenuBuilder::new(app, "Bench")
        .item(&about)
        .item(&check_updates)
        .separator()
        .item(&preferences)
        .separator()
        .item(&services)
        .separator()
        .item(&hide)
        .item(&hide_others)
        .item(&show_all)
        .separator()
        .item(&quit)
        .build()?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .separator()
        .item(&select_all)
        .build()?;

    let reload = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("Cmd+R")
        .build(app)?;
    let toggle_devtools = MenuItemBuilder::with_id("toggle_devtools", "Toggle Developer Tools")
        .accelerator("Cmd+Shift+I")
        .build(app)?;

    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&reload)
        .item(&toggle_devtools)
        .build()?;

    let minimize = PredefinedMenuItem::minimize(app, None)?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .item(&minimize)
        .build()?;

    let help_submenu = SubmenuBuilder::new(app, "Help").build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()?;

    app.set_menu(menu)?;

    let handle = app.handle().clone();
    app.on_menu_event(move |_window, event| {
        let id = event.id().as_ref().to_string();
        // Debug-only handler so the View → Toggle Developer Tools menu item
        // actually does something. open_devtools / close_devtools are gated on
        // debug_assertions or the `devtools` feature flag, so this whole branch
        // compiles out of release builds (#066).
        #[cfg(debug_assertions)]
        if id == "toggle_devtools" {
            if let Some(w) = handle.get_webview_window("main") {
                if w.is_devtools_open() {
                    w.close_devtools();
                } else {
                    w.open_devtools();
                }
            }
        }
        let _ = handle.emit("menu-event", id);
    });

    Ok(())
}
