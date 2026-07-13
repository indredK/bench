use super::types::{
    AllowedActions, AppInfo, LaunchTarget, PlatformCapabilities, ProviderStatus, ScanResult,
    SourceEvidence, SourceType,
};
use super::utils::name_match_confidence;
use std::collections::HashMap;
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
    pub source_evidence: SourceEvidence,
    pub can_upgrade: bool,
    pub can_uninstall: bool,
    pub upgrade_available: bool,
    pub last_modified: u64,
    pub is_system_app: bool,
    pub launchable: bool,
    pub revealable: bool,
    pub launch_target: Option<LaunchTarget>,
}

#[derive(Debug, Clone)]
pub struct SourceResolution {
    pub source_type: SourceType,
    pub source_id: String,
    pub source_confidence: f64,
    pub source_evidence: SourceEvidence,
    pub can_upgrade: bool,
    pub can_uninstall: bool,
    pub upgrade_available: bool,
}

impl SourceResolution {
    fn managed(
        source_type: SourceType,
        source_id: String,
        source_confidence: f64,
        source_evidence: SourceEvidence,
        can_upgrade: bool,
        can_uninstall: bool,
        upgrade_available: bool,
    ) -> Self {
        Self {
            source_type,
            source_id,
            source_confidence,
            source_evidence,
            can_upgrade: can_upgrade && source_evidence.authorizes_destructive_action(),
            can_uninstall: can_uninstall && source_evidence.authorizes_destructive_action(),
            upgrade_available,
        }
    }

    fn unmanaged(source_type: SourceType) -> Self {
        Self::managed(
            source_type,
            String::new(),
            1.0,
            SourceEvidence::None,
            false,
            false,
            false,
        )
    }
}

pub fn resolve_macos_source_with_artifacts(
    name: &str,
    bundle_id: &str,
    is_system_app: bool,
    installed_casks: &HashSet<String>,
    outdated_casks: &HashSet<String>,
    artifact_casks: &HashMap<String, String>,
) -> SourceResolution {
    if is_system_app {
        return SourceResolution::unmanaged(SourceType::MacBundle);
    }

    let app_key = name
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    if let Some(cask) = artifact_casks.get(&app_key) {
        return SourceResolution::managed(
            SourceType::HomebrewCask,
            cask.clone(),
            1.0,
            SourceEvidence::ExactReceipt,
            true,
            true,
            outdated_casks.contains(cask),
        );
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
                SourceEvidence::Heuristic,
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
    _bundle_id: &str,
    install_path: &str,
    winget_packages: &[(String, String, Option<String>)],
    upgradable_ids: &HashSet<String>,
) -> SourceResolution {
    let normalize = |value: &str| {
        value
            .chars()
            .filter(|character| character.is_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect::<String>()
    };
    let normalized_name = normalize(name);
    if let Some((_, package_id, _)) =
        winget_packages
            .iter()
            .find(|(package_name, _, package_install_path)| {
                normalize(package_name) == normalized_name
                    && package_install_path
                        .as_deref()
                        .is_some_and(|path| paths_equivalent(path, install_path))
            })
    {
        return SourceResolution::managed(
            SourceType::Winget,
            package_id.clone(),
            1.0,
            SourceEvidence::ExactPackageId,
            true,
            true,
            upgradable_ids.contains(&package_id.to_lowercase()),
        );
    }

    // A localized display-name match is useful for showing a source badge, but
    // it is not proof that winget owns this installation. Keep it explicitly
    // heuristic so destructive actions remain disabled.
    if let Some((_, package_id, _)) = winget_packages
        .iter()
        .find(|(package_name, _, _)| normalize(package_name) == normalized_name)
    {
        return SourceResolution::managed(
            SourceType::Winget,
            package_id.clone(),
            0.6,
            SourceEvidence::Heuristic,
            false,
            false,
            false,
        );
    }

    SourceResolution::unmanaged(SourceType::MsiInstaller)
}

/// An MSI ProductCode is an exact uninstall identity. It is safe to expose as
/// a destructive capability only after the registry provider has validated the
/// value as a GUID and supplied matching MSI metadata.
pub fn resolve_windows_product_code(product_code: String) -> SourceResolution {
    SourceResolution::managed(
        SourceType::MsiInstaller,
        product_code,
        1.0,
        SourceEvidence::ExactProductCode,
        false,
        true,
        false,
    )
}

fn paths_equivalent(left: &str, right: &str) -> bool {
    if left.trim().is_empty() || right.trim().is_empty() {
        return false;
    }
    let left = std::fs::canonicalize(left).unwrap_or_else(|_| std::path::PathBuf::from(left));
    let right = std::fs::canonicalize(right).unwrap_or_else(|_| std::path::PathBuf::from(right));
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
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
            SourceEvidence::ExactPackageId,
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
            SourceEvidence::ExactPackageId,
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
                SourceEvidence::Heuristic,
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
        source_evidence: input.source_evidence,
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
        launch_target: input.launch_target,
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
        revision: 0,
        complete: false,
        providers: Vec::new(),
        warnings: Vec::new(),
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
        revision: 0,
        complete: true,
        providers: Vec::<ProviderStatus>::new(),
        warnings: Vec::new(),
    }
}

fn current_unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heuristic_source_evidence_never_authorizes_destructive_actions() {
        let resolution = SourceResolution::managed(
            SourceType::Winget,
            "Example.App".to_string(),
            0.95,
            SourceEvidence::Heuristic,
            true,
            true,
            true,
        );
        assert!(!resolution.can_upgrade);
        assert!(!resolution.can_uninstall);
    }

    #[test]
    fn exact_winget_name_match_authorizes_exact_package_id() {
        let resolution = resolve_windows_source(
            "Visual Studio Code",
            "windows:registry:code",
            r"C:\Apps\VSCode\Code.exe",
            &[(
                "Visual Studio Code".to_string(),
                "Microsoft.VisualStudioCode".to_string(),
                Some(r"C:\Apps\VSCode\Code.exe".to_string()),
            )],
            &HashSet::from(["microsoft.visualstudiocode".to_string()]),
        );
        assert_eq!(resolution.source_evidence, SourceEvidence::ExactPackageId);
        assert!(resolution.can_upgrade);
        assert!(resolution.can_uninstall);
        assert!(resolution.upgrade_available);
    }

    #[test]
    fn fuzzy_winget_name_match_is_not_managed() {
        let resolution = resolve_windows_source(
            "Code Helper",
            "windows:registry:helper",
            r"C:\Apps\Helper\Helper.exe",
            &[(
                "Visual Studio Code".to_string(),
                "Microsoft.VisualStudioCode".to_string(),
                Some(r"C:\Apps\VSCode\Code.exe".to_string()),
            )],
            &HashSet::new(),
        );
        assert_eq!(resolution.source_evidence, SourceEvidence::None);
        assert!(!resolution.can_uninstall);
    }

    #[test]
    fn same_name_without_install_path_evidence_is_heuristic_only() {
        let resolution = resolve_windows_source(
            "Example App",
            "windows:registry:example",
            r"C:\Apps\Example",
            &[(
                "Example App".to_string(),
                "Vendor.Example".to_string(),
                None,
            )],
            &HashSet::from(["vendor.example".to_string()]),
        );
        assert_eq!(resolution.source_evidence, SourceEvidence::Heuristic);
        assert!(!resolution.can_upgrade);
        assert!(!resolution.can_uninstall);
    }

    #[test]
    fn validated_product_code_authorizes_only_uninstall() {
        let resolution =
            resolve_windows_product_code("{12345678-1234-ABCD-9876-1234567890AB}".to_string());
        assert_eq!(resolution.source_evidence, SourceEvidence::ExactProductCode);
        assert!(!resolution.can_upgrade);
        assert!(resolution.can_uninstall);
    }
}
