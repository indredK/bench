use std::sync::Mutex;

use super::types::{SleepConfig, SleepState};

static CAFFEINATE_PID: Mutex<Option<u32>> = Mutex::new(None);

#[cfg(target_os = "macos")]
fn spawn_caffeinate(config: &SleepConfig) -> Result<(), String> {
    let mut args: Vec<&str> = Vec::new();
    if config.prevent_display {
        args.push("-d");
    }
    if config.prevent_sleep {
        args.push("-i");
        args.push("-s");
    }
    if args.is_empty() {
        return Ok(());
    }

    let child = std::process::Command::new("caffeinate")
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to start caffeinate: {}", e))?;

    let mut pid = CAFFEINATE_PID.lock().map_err(|e| e.to_string())?;
    *pid = Some(child.id());
    Ok(())
}

#[cfg(target_os = "windows")]
fn spawn_caffeinate(config: &SleepConfig) -> Result<(), String> {
    const ES_CONTINUOUS: u32 = 0x80000000;
    const ES_SYSTEM_REQUIRED: u32 = 0x00000001;
    const ES_DISPLAY_REQUIRED: u32 = 0x00000002;

    extern "system" {
        fn SetThreadExecutionState(flags: u32) -> u32;
    }

    let mut flags = ES_CONTINUOUS;
    if config.prevent_sleep {
        flags |= ES_SYSTEM_REQUIRED;
    }
    if config.prevent_display {
        flags |= ES_DISPLAY_REQUIRED;
    }

    unsafe {
        SetThreadExecutionState(flags);
    }

    let mut pid = CAFFEINATE_PID.lock().map_err(|e| e.to_string())?;
    *pid = Some(0);
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn spawn_caffeinate(_config: &SleepConfig) -> Result<(), String> {
    Err("Sleep inhibitor is not supported on this platform".to_string())
}

fn kill_caffeinate() -> Result<(), String> {
    let mut pid = CAFFEINATE_PID.lock().map_err(|e| e.to_string())?;
    if let Some(pid) = pid.take() {
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("kill")
                .arg(pid.to_string())
                .output();
        }
        #[cfg(target_os = "windows")]
        {
            const ES_CONTINUOUS: u32 = 0x80000000;
            extern "system" {
                fn SetThreadExecutionState(flags: u32) -> u32;
            }
            unsafe {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }
    Ok(())
}

/// Set sleep inhibitor to the requested state.
///
/// `enabled` is the desired state for OUR OWN caffeinate process, not the
/// system-wide state. This is important for syncing with other apps (e.g.
/// OnlySwitch, Amphetamine): when they already hold a sleep assertion we
/// must still be able to start our own, and when we turn ours off the
/// system may still report prevention as active because of the other app.
///
/// The returned `SleepState.enabled` always reflects the system-detected
/// state so the UI shows the true picture (incl. other apps' assertions).
#[tauri::command]
pub fn toggle_sleep_inhibitor(config: SleepConfig, enabled: bool) -> Result<SleepState, String> {
    if enabled {
        // Don't spawn a second caffeinate if we already own one.
        let own_pid = CAFFEINATE_PID.lock().map_err(|e| e.to_string())?;
        let we_own = own_pid.is_some();
        drop(own_pid);
        if !we_own {
            spawn_caffeinate(&config)?;
        }
    } else {
        // Only kill OUR own caffeinate; never touch other apps' processes.
        kill_caffeinate()?;
    }

    // Always re-read the system state so the UI reflects other apps too.
    get_current_state_with_config(config)
}

#[tauri::command]
pub fn get_sleep_inhibitor_state() -> Result<SleepState, String> {
    get_current_state()
}

/// Called from the app exit handler. Kills OUR OWN caffeinate so that the
/// system state we report stays accurate after the app quits (otherwise the
/// spawned caffeinate becomes orphaned and keeps holding the assertion,
/// which would confuse other apps like OnlySwitch and our own next launch).
pub fn cleanup_on_exit() {
    let _ = kill_caffeinate();
}

/// Check system-level sleep prevention.
/// Detects caffeinate processes (from any app) and user-initiated sleep assertions.
fn get_current_state() -> Result<SleepState, String> {
    get_current_state_with_config(SleepConfig::default())
}

/// Same as `get_current_state` but lets the caller carry the user-supplied
/// config back to the UI instead of clobbering it with the default.
fn get_current_state_with_config(config: SleepConfig) -> Result<SleepState, String> {
    #[cfg(target_os = "macos")]
    {
        let caffeinate_running = check_caffeinate_processes()?;
        let user_assertions = check_user_sleep_assertions()?;
        let own_pid = CAFFEINATE_PID.lock().map_err(|e| e.to_string())?;
        let own_active = own_pid.is_some();

        Ok(SleepState {
            enabled: caffeinate_running || user_assertions || own_active,
            since: None,
            config,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let pid = CAFFEINATE_PID.lock().map_err(|e| e.to_string())?;
        Ok(SleepState {
            enabled: pid.is_some(),
            since: None,
            config,
        })
    }
}

/// Check if any caffeinate processes are running (from any app).
#[cfg(target_os = "macos")]
fn check_caffeinate_processes() -> Result<bool, String> {
    let output = std::process::Command::new("pgrep")
        .args(["-x", "caffeinate"])
        .output()
        .map_err(|e| format!("pgrep: {}", e))?;

    // pgrep returns 0 if found, 1 if not found
    Ok(output.status.success())
}

/// Check for user-initiated sleep prevention assertions via pmset.
/// Filters out normal system assertions (powerd, WindowServer, coreaudiod)
/// and only reports assertions from user apps.
#[cfg(target_os = "macos")]
fn check_user_sleep_assertions() -> Result<bool, String> {
    let output = std::process::Command::new("pmset")
        .args(["-g", "assertions"])
        .output()
        .map_err(|e| format!("pmset: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // System processes that normally hold sleep assertions
    let system_processes = ["powerd", "WindowServer", "coreaudiod", "kernel"];

    // Look at the "Listed by owning process" section for user apps
    let mut in_process_list = false;
    for line in stdout.lines() {
        if line.contains("Listed by owning process") {
            in_process_list = true;
            continue;
        }
        if in_process_list && line.trim().starts_with("pid") {
            // Extract process name from line like:
            // pid 112(powerd): [0x...] PreventUserIdleSystemSleep named: "..."
            if let Some(start) = line.find('(') {
                if let Some(end) = line[start..].find(')') {
                    let process = &line[start + 1..start + end];
                    if !system_processes.contains(&process) {
                        // Check if this assertion is sleep-related
                        if line.contains("PreventUserIdleSystemSleep")
                            || line.contains("PreventSystemSleep")
                            || line.contains("PreventUserIdleDisplaySleep")
                            || line.contains("PreventDisplaySleep")
                        {
                            return Ok(true);
                        }
                    }
                }
            }
        }
    }

    Ok(false)
}
