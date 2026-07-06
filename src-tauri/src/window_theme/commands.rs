use crate::error::{AppError, AppResult};
use crate::window_theme::types::{Appearance, WindowTheme};

#[tauri::command]
pub fn set_window_theme(
    window: tauri::WebviewWindow,
    theme: WindowTheme,
    appearance: Appearance,
) -> AppResult<()> {
    let (tx, rx) = std::sync::mpsc::channel::<AppResult<()>>();
    let win = window.clone();
    window
        .run_on_main_thread(move || {
            let result = apply_theme(&win, theme, appearance);
            let _ = tx.send(result);
        })
        .map_err(|e| AppError::internal(format!("{e}")))?;
    rx.recv().map_err(|e| AppError::internal(format!("channel recv: {e}")))?
}

#[cfg(target_os = "macos")]
fn apply_theme(
    window: &tauri::WebviewWindow,
    theme: WindowTheme,
    appearance: Appearance,
) -> AppResult<()> {
    use window_vibrancy::{
        apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
    };

    match theme {
        WindowTheme::Default => clear_vibrancy(window).map(|_| ()).map_err(|e| AppError::internal(format!("{e}"))),
        WindowTheme::Glass => {
            let material = match appearance {
                Appearance::Light => NSVisualEffectMaterial::Sidebar,
                Appearance::Dark => NSVisualEffectMaterial::HudWindow,
            };
            apply_vibrancy(window, material, Some(NSVisualEffectState::FollowsWindowActiveState), None)
                .map_err(|e| AppError::internal(format!("{e}")))
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn apply_theme(
    _window: &tauri::WebviewWindow,
    theme: WindowTheme,
    _appearance: Appearance,
) -> AppResult<()> {
    match theme {
        WindowTheme::Default => Ok(()),
        _ => Err(AppError::unsupported("window theme not supported on this platform")),
    }
}
