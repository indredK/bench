use super::types::{AllowedActions, AppInfo, PlatformCapabilities, ScanResult, SourceType};
use super::utils::name_match_confidence;
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct AppInfoInput {
    pub app_id: String,
    pub name: String,
    pub version: String,
    pub bundle_id: String,
    pub install_path: String,
    pub source_type: SourceType,
    pub source_id: String,
    pub source_confidence: f64,
    pub can_upgrade: bool,
    pub can_uninstall: bool,
    pub upgrade_available: bool,
    pub last_modified: u64,
    pub is_system_app: bool,
    pub launchable: bool,
    pub revealable: bool,
}

#[derive(Debug, Clone)]
pub struct SourceResolution {
    pub source_type: SourceType,
    pub source_id: String,
    pub source_confidence: f64,
    pub can_upgrade: bool,
    pub can_uninstall: bool,
    pub upgrade_available: bool,
}

impl SourceResolution {
    fn managed(
        source_type: SourceType,
        source_id: String,
        source_confidence: f64,
        can_upgrade: bool,
        can_uninstall: bool,
        upgrade_available: bool,
    ) -> Self {
        Self {
            source_type,
            source_id,
            source_confidence,
            can_upgrade,
            can_uninstall,
            upgrade_available,
        }
    }

    fn unmanaged(source_type: SourceType) -> Self {
        Self::managed(source_type, String::new(), 1.0, false, false, false)
    }
}

pub fn resolve_macos_source(
    name: &str,
    bundle_id: &str,
    is_system_app: bool,
    installed_casks: &HashSet<String>,
    outdated_casks: &HashSet<String>,
) -> SourceResolution {
    if is_system_app {
        return SourceResolution::unmanaged(SourceType::MacBundle);
    }

    let best_cask = installed_casks
        .iter()
        .map(|cask| (cask, name_match_confidence(name, bundle_id, cask)))
        .max_by(|(_, a), (_, b)| a.total_cmp(b));

    if let Some((cask, confidence)) = best_cask {
        if confidence >= 0.5 {
            return SourceResolution::managed(
                SourceType::HomebrewCask,
                cask.clone(),
                confidence,
                true,
                true,
                outdated_casks.contains(cask),
            );
        }
    }

    SourceResolution::unmanaged(SourceType::MacBundle)
}

pub fn resolve_windows_source(
    name: &str,
    bundle_id: &str,
    winget_packages: &[(String, String)],
    upgradable_ids: &HashSet<String>,
) -> SourceResolution {
    let best_package = winget_packages
        .iter()
        .map(|package| (package, name_match_confidence(name, bundle_id, &package.0)))
        .max_by(|(_, a), (_, b)| a.total_cmp(b));

    if let Some(((_, package_id), confidence)) = best_package {
        if confidence >= 0.5 {
            return SourceResolution::managed(
                SourceType::Winget,
                package_id.clone(),
                confidence,
                true,
                true,
                upgradable_ids.contains(&package_id.to_lowercase()),
            );
        }
    }

    SourceResolution::unmanaged(SourceType::MsiInstaller)
}

#[allow(clippy::too_many_arguments)]
pub fn resolve_linux_source(
    name: &str,
    bundle_id: &str,
    flatpak_apps: &[(String, String, String)],
    snap_apps: &[(String, String, String)],
    apt_packages: &[(String, String, String)],
    flatpak_available: bool,
    snap_available: bool,
    apt_available: bool,
) -> SourceResolution {
    let name_lower = name.to_lowercase();

    if let Some((_, app_id, _)) = flatpak_apps
        .iter()
        .find(|(app_name, _, _)| app_name.to_lowercase() == name_lower)
    {
        return SourceResolution::managed(
            SourceType::Flatpak,
            app_id.clone(),
            0.9,
            flatpak_available,
            flatpak_available,
            false,
        );
    }

    if let Some((_, snap_name, _)) = snap_apps
        .iter()
        .find(|(app_name, _, _)| app_name.to_lowercase() == name_lower)
    {
        return SourceResolution::managed(
            SourceType::Snap,
            snap_name.clone(),
            0.9,
            snap_available,
            snap_available,
            false,
        );
    }

    if apt_available {
        let apt_match = apt_packages.iter().find(|(package_name, _, _)| {
            name_match_confidence(name, bundle_id, package_name) >= 0.5
        });

        if let Some((package_name, _, _)) = apt_match {
            return SourceResolution::managed(
                SourceType::Apt,
                package_name.clone(),
                0.7,
                true,
                true,
                false,
            );
        }
    }

    SourceResolution::unmanaged(SourceType::Unknown)
}

pub fn source_label(source_type: &SourceType) -> String {
    match source_type {
        SourceType::MacBundle => "Bundle".into(),
        SourceType::HomebrewCask => "Homebrew".into(),
        SourceType::AppStore => "App Store".into(),
        SourceType::Winget => "winget".into(),
        SourceType::WindowsStore => "Windows Store".into(),
        SourceType::MsiInstaller => "Registry".into(),
        SourceType::Flatpak => "Flatpak".into(),
        SourceType::Snap => "Snap".into(),
        SourceType::Apt => "APT".into(),
        SourceType::Unknown => "Unknown".into(),
    }
}

pub fn build_app_info(input: AppInfoInput) -> AppInfo {
    AppInfo {
        app_id: input.app_id,
        name: input.name,
        version: input.version,
        bundle_id: input.bundle_id,
        install_path: input.install_path,
        source: source_label(&input.source_type),
        source_type: input.source_type.to_string(),
        source_id: input.source_id,
        source_confidence: input.source_confidence,
        can_upgrade: input.can_upgrade,
        can_uninstall: input.can_uninstall && !input.is_system_app,
        upgrade_available: input.upgrade_available,
        last_operation_result: None,
        last_modified: input.last_modified,
        is_system_app: input.is_system_app,
        allowed_actions: AllowedActions {
            launch: input.launchable,
            reveal: input.revealable,
            upgrade: input.can_upgrade,
            uninstall: input.can_uninstall && !input.is_system_app,
        },
        icon_base64: None,
    }
}

pub fn platform_capabilities(
    brew_available: bool,
    winget_available: bool,
    flatpak_available: bool,
    snap_available: bool,
    apt_available: bool,
) -> PlatformCapabilities {
    PlatformCapabilities {
        brew_available,
        winget_available,
        flatpak_available,
        snap_available,
        apt_available,
    }
}

pub fn empty_scan_result() -> ScanResult {
    ScanResult {
        apps: vec![],
        total_count: 0,
        user_count: 0,
        system_count: 0,
        scan_time_ms: 0,
        managed_count: 0,
        platform_capabilities: platform_capabilities(false, false, false, false, false),
        last_scan_time: 0,
        last_update_check: 0,
    }
}

pub fn build_scan_result(
    mut apps: Vec<AppInfo>,
    platform_capabilities: PlatformCapabilities,
    scan_time_ms: u64,
    last_update_check: u64,
) -> ScanResult {
    apps.sort_by_key(|a| a.name.to_lowercase());

    let total_count = apps.len();
    let system_count = apps.iter().filter(|app| app.is_system_app).count();
    let managed_count = apps
        .iter()
        .filter(|app| app.can_upgrade || app.can_uninstall)
        .count();

    ScanResult {
        apps,
        total_count,
        user_count: total_count - system_count,
        system_count,
        scan_time_ms,
        managed_count,
        platform_capabilities,
        last_scan_time: current_unix_millis(),
        last_update_check,
    }
}

fn current_unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
