use crate::window_theme::types::{Appearance, WindowTheme};

#[tauri::command]
pub fn set_window_theme(
    window: tauri::WebviewWindow,
    theme: WindowTheme,
    appearance: Appearance,
) -> Result<(), String> {
    // NSVisualEffectView setup mutates AppKit state, which is only safe on
    // the main thread. Tauri commands run on the async runtime by default,
    // so we hop back to the main thread and block on a channel to surface
    // the apply result to the IPC caller.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let win = window.clone();
    window
        .run_on_main_thread(move || {
            let result = apply_theme(&win, theme, appearance);
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[cfg(target_os = "macos")]
fn apply_theme(
    window: &tauri::WebviewWindow,
    theme: WindowTheme,
    appearance: Appearance,
) -> Result<(), String> {
    use window_vibrancy::{
        apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
    };

    match theme {
        // clear_vibrancy returns bool (whether an effect was actually cleared);
        // we don't care, just propagate any error string.
        WindowTheme::Default => clear_vibrancy(window).map(|_| ()).map_err(|e| e.to_string()),
        WindowTheme::Glass => {
            // Light → Sidebar (bright, mildly saturated, akin to Finder /
            // Control Center). Dark → HudWindow (deeper, higher contrast,
            // closer to HUD panels). Both follow the active window state so
            // the material naturally desaturates on blur.
            let material = match appearance {
                Appearance::Light => NSVisualEffectMaterial::Sidebar,
                Appearance::Dark => NSVisualEffectMaterial::HudWindow,
            };
            apply_vibrancy(
                window,
                material,
                Some(NSVisualEffectState::FollowsWindowActiveState),
                None,
            )
            .map_err(|e| e.to_string())
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn apply_theme(
    _window: &tauri::WebviewWindow,
    theme: WindowTheme,
    _appearance: Appearance,
) -> Result<(), String> {
    // Non-macOS platforms only support the default theme. The frontend
    // disables non-default options on these platforms, so reaching this
    // branch with anything other than `Default` is a contract violation.
    match theme {
        WindowTheme::Default => Ok(()),
        _ => Err("window theme not supported on this platform".into()),
    }
}
