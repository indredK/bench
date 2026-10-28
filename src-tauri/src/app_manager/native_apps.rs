//! Host-managed installation for the two private, notarized Swift toolbox apps.
//!
//! The renderer can submit only a fixed catalog ID. GitHub repository, asset
//! names, bundle identifiers and Apple Team ID are pinned here; the manifest
//! supplies only the release tag, version and digest, all of which are
//! validated before an app bundle is installed.

#[cfg(target_os = "macos")]
use super::installer::{codesign, extractor};
use super::operations::operation_result;
use super::types::OperationResult;
use serde::Deserialize;
use std::collections::HashSet;
#[cfg(target_os = "macos")]
use std::io::Read;
#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::time::Duration;

#[cfg(target_os = "macos")]
const PRIVATE_REPOSITORY: &str = "indredK/bench-native-apps";
const TRUSTED_TEAM_ID: &str = "78KG7YW724";
#[cfg(target_os = "macos")]
const MANIFEST_FILE: &str = "native-apps-manifest.json";
#[cfg(target_os = "macos")]
const MAX_NATIVE_ASSET_BYTES: u64 = 1024 * 1024 * 1024;
#[cfg(target_os = "macos")]
const GH_COMMAND_TIMEOUT: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Copy)]
struct NativeAppSpec {
    id: &'static str,
    bundle_id: &'static str,
    display_name: &'static str,
    bundle_name: &'static str,
    asset_name: &'static str,
}

const NATIVE_APPS: [NativeAppSpec; 2] = [
    NativeAppSpec {
        id: "local-toolbox",
        bundle_id: "com.local.dailycheckin.helper",
        display_name: "本地工具箱",
        bundle_name: "本地工具箱.app",
        asset_name: "LocalToolbox-arm64.zip",
    },
    NativeAppSpec {
        id: "abb-dev-toolbox",
        bundle_id: "com.local.devservicemanager",
        display_name: "ABB 开发工具箱",
        bundle_name: "ABB开发工具箱.app",
        asset_name: "ABBDevelopmentToolbox-arm64.zip",
    },
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReleaseManifest {
    schema_version: u32,
    release_tag: String,
    team_id: String,
    apps: Vec<ReleaseApp>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReleaseApp {
    id: String,
    bundle_id: String,
    display_name: String,
    version: String,
    asset_name: String,
    sha256: String,
}

fn app_spec(id: &str) -> Option<&'static NativeAppSpec> {
    NATIVE_APPS.iter().find(|spec| spec.id == id)
}

fn is_semver(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

fn is_release_tag(value: &str) -> bool {
    value.strip_prefix("native-apps-v").is_some_and(is_semver)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn validate_manifest<'a>(
    manifest: &'a ReleaseManifest,
    selected_id: &str,
) -> Result<&'a ReleaseApp, String> {
    if manifest.schema_version != 1
        || manifest.team_id != TRUSTED_TEAM_ID
        || !is_release_tag(&manifest.release_tag)
        || manifest.apps.len() != NATIVE_APPS.len()
    {
        return Err("私有应用发布清单不符合 Bench 的信任策略".into());
    }

    let mut seen = HashSet::with_capacity(manifest.apps.len());
    for app in &manifest.apps {
        let Some(spec) = app_spec(&app.id) else {
            return Err("发布清单包含未登记的应用".into());
        };
        if !seen.insert(app.id.as_str())
            || app.bundle_id != spec.bundle_id
            || app.asset_name != spec.asset_name
            || app.display_name != spec.display_name
            || !is_semver(&app.version)
            || !is_sha256(&app.sha256)
        {
            return Err("私有应用发布清单的应用信息无效".into());
        }
    }

    if seen.len() != NATIVE_APPS.len() {
        return Err("私有应用发布清单缺少已登记的应用".into());
    }
    manifest
        .apps
        .iter()
        .find(|app| app.id == selected_id)
        .ok_or_else(|| "私有应用发布清单中没有请求的应用".into())
}

#[cfg(target_os = "macos")]
fn find_gh_cli() -> Option<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/gh"),
        PathBuf::from("/usr/local/bin/gh"),
        PathBuf::from("/usr/bin/gh"),
    ];
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join("gh")));
    }
    candidates.into_iter().find(|path| {
        path.is_file()
            && std::fs::metadata(path).ok().is_some_and(|metadata| {
                use std::os::unix::fs::PermissionsExt;
                metadata.permissions().mode() & 0o111 != 0
            })
    })
}

#[cfg(target_os = "macos")]
fn run_gh(gh: &Path, args: &[&str], cwd: &Path) -> Result<(), String> {
    let output = super::run_command_with_timeout(
        Command::new(gh).args(args).current_dir(cwd),
        GH_COMMAND_TIMEOUT,
    )
    .map_err(|_| "GitHub 下载超时或无法启动；请检查网络和 GitHub CLI。".to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        // Do not echo CLI diagnostics into the UI or logs: they can contain
        // private repository metadata and vary by authentication failure.
        Err("无法读取私有 Release。请确认 `gh auth login` 已完成，且当前账号能访问该仓库。".into())
    }
}

#[cfg(target_os = "macos")]
fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let metadata = std::fs::metadata(path).map_err(|_| "无法读取下载的应用包".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_NATIVE_ASSET_BYTES {
        return Err("应用包大小超出允许范围".into());
    }
    let mut file = std::fs::File::open(path).map_err(|_| "无法打开下载的应用包".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let bytes = file
            .read(&mut buffer)
            .map_err(|_| "读取应用包失败".to_string())?;
        if bytes == 0 {
            break;
        }
        hasher.update(&buffer[..bytes]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(target_os = "macos")]
fn read_bundle_id(app_bundle: &Path) -> Result<String, String> {
    let info = plist::Value::from_file(app_bundle.join("Contents/Info.plist"))
        .map_err(|_| "应用包缺少有效的 Info.plist".to_string())?;
    info.as_dictionary()
        .and_then(|dictionary| dictionary.get("CFBundleIdentifier"))
        .and_then(plist::Value::as_string)
        .map(str::to_owned)
        .ok_or_else(|| "应用包未声明 Bundle ID".into())
}

#[cfg(target_os = "macos")]
fn verify_native_bundle(
    app_bundle: &Path,
    app: &ReleaseApp,
    spec: &NativeAppSpec,
) -> Result<(), String> {
    if read_bundle_id(app_bundle)? != spec.bundle_id {
        return Err("应用包 Bundle ID 与 Bench 目录不一致".into());
    }
    codesign::verify_signature(app_bundle).map_err(|_| "应用代码签名校验失败".to_string())?;
    let signature =
        codesign::read_codesign_info(app_bundle).map_err(|_| "无法读取应用代码签名".to_string())?;
    if signature.bundle_id.as_deref() != Some(spec.bundle_id)
        || signature.team_id.as_deref() != Some(TRUSTED_TEAM_ID)
        || !signature
            .authority
            .as_deref()
            .is_some_and(|authority| authority.starts_with("Developer ID Application:"))
    {
        return Err("应用必须由已登记的 Developer ID 团队签名".into());
    }
    if app.bundle_id != spec.bundle_id {
        return Err("Release 清单与应用包 Bundle ID 不一致".into());
    }
    codesign::verify_platform_compatibility(app_bundle)
        .map_err(|_| "应用不兼容当前 macOS 或 Apple 芯片".to_string())?;

    let assessment = super::run_command_with_timeout(
        Command::new("spctl")
            .args(["--assess", "--type", "execute", "--verbose=2"])
            .arg(app_bundle),
        Duration::from_secs(30),
    )
    .map_err(|_| "Gatekeeper 无法验证应用".to_string())?;
    if !assessment.status.success() {
        return Err("Gatekeeper 未认可应用；该 Release 可能没有完成 Apple notarization".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn install_macos(id: &str) -> Result<String, String> {
    let spec = app_spec(id).ok_or_else(|| "未登记的原生工具箱应用".to_string())?;
    let gh = find_gh_cli().ok_or_else(|| {
        "未找到 GitHub CLI。请先安装 gh，并登录可访问此私有仓库的 GitHub 账号。".to_string()
    })?;
    let auth = super::run_command_with_timeout(
        Command::new(&gh).args(["auth", "status", "--hostname", "github.com"]),
        Duration::from_secs(15),
    );
    if !auth.is_ok_and(|output| output.status.success()) {
        return Err("GitHub CLI 尚未登录。请先在终端运行 `gh auth login`。".into());
    }

    let work_dir = extractor::make_work_dir(&format!("native-{}", spec.id))?;
    let result = (|| {
        run_gh(
            &gh,
            &[
                "release",
                "download",
                "--repo",
                PRIVATE_REPOSITORY,
                "--pattern",
                MANIFEST_FILE,
                "--dir",
                work_dir.to_str().ok_or("无法解析缓存目录")?,
            ],
            &work_dir,
        )?;
        let manifest_text = std::fs::read_to_string(work_dir.join(MANIFEST_FILE))
            .map_err(|_| "无法读取私有应用发布清单".to_string())?;
        let manifest: ReleaseManifest = serde_json::from_str(&manifest_text)
            .map_err(|_| "私有应用发布清单格式无效".to_string())?;
        let release_app = validate_manifest(&manifest, spec.id)?;
        let release_tag = manifest.release_tag.clone();
        let asset_name = release_app.asset_name.clone();
        let expected_hash = release_app.sha256.clone();

        run_gh(
            &gh,
            &[
                "release",
                "download",
                &release_tag,
                "--repo",
                PRIVATE_REPOSITORY,
                "--pattern",
                &asset_name,
                "--dir",
                work_dir.to_str().ok_or("无法解析缓存目录")?,
            ],
            &work_dir,
        )?;
        let archive = work_dir.join(&asset_name);
        if sha256_file(&archive)? != expected_hash {
            return Err("应用包 SHA-256 不匹配，已拒绝安装".into());
        }

        let extracted = work_dir.join("extracted");
        std::fs::create_dir(&extracted).map_err(|_| "无法创建安全解压目录".to_string())?;
        let app_bundle = extractor::extract_zip_with_cancel(&archive, &extracted, None)?;
        if app_bundle.file_name().and_then(|name| name.to_str()) != Some(spec.bundle_name) {
            return Err("Release 中的应用包名称无效".into());
        }
        let release_app = validate_manifest(&manifest, spec.id)?;
        verify_native_bundle(&app_bundle, release_app, spec)?;

        let home = dirs::home_dir().ok_or("无法定位当前用户目录")?;
        let applications = home.join("Applications");
        std::fs::create_dir_all(&applications)
            .map_err(|_| "无法创建用户应用程序目录".to_string())?;
        let metadata = std::fs::symlink_metadata(&applications)
            .map_err(|_| "无法检查用户应用程序目录".to_string())?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("用户应用程序目录不是安全的普通目录".into());
        }
        let target = applications.join(spec.bundle_name);
        if std::fs::symlink_metadata(&target).is_ok() {
            return Err(format!(
                "{} 已安装在 ~/Applications；为避免覆盖，已停止安装。",
                spec.display_name
            ));
        }
        std::fs::rename(&app_bundle, &target)
            .map_err(|_| "无法将应用安全移动到 ~/Applications".to_string())?;
        Ok(target.display().to_string())
    })();
    extractor::cleanup_work_dir(&work_dir);
    result
}

pub fn install(id: &str) -> OperationResult {
    #[cfg(target_os = "macos")]
    let result = install_macos(id);
    #[cfg(not(target_os = "macos"))]
    let result: Result<String, String> = {
        let _ = id;
        Err("Bench 原生工具箱目前仅支持 macOS。".into())
    };

    match result {
        Ok(path) => operation_result(true, format!("安装完成：{path}"), Some(0), None, false),
        Err(message) => operation_result(
            false,
            message,
            None,
            Some("NATIVE_TOOL_INSTALL_FAILED".into()),
            false,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> ReleaseManifest {
        ReleaseManifest {
            schema_version: 1,
            release_tag: "native-apps-v1.2.3".into(),
            team_id: TRUSTED_TEAM_ID.into(),
            apps: vec![
                ReleaseApp {
                    id: "local-toolbox".into(),
                    bundle_id: "com.local.dailycheckin.helper".into(),
                    display_name: "本地工具箱".into(),
                    version: "0.1.0".into(),
                    asset_name: "LocalToolbox-arm64.zip".into(),
                    sha256: "a".repeat(64),
                },
                ReleaseApp {
                    id: "abb-dev-toolbox".into(),
                    bundle_id: "com.local.devservicemanager".into(),
                    display_name: "ABB 开发工具箱".into(),
                    version: "2.0.0".into(),
                    asset_name: "ABBDevelopmentToolbox-arm64.zip".into(),
                    sha256: "b".repeat(64),
                },
            ],
        }
    }

    #[test]
    fn accepts_only_the_exact_catalog_entry_and_release_contract() {
        let manifest = valid_manifest();
        let app = validate_manifest(&manifest, "local-toolbox").unwrap();
        assert_eq!(app.bundle_id, "com.local.dailycheckin.helper");
        assert!(validate_manifest(&manifest, "unknown-tool").is_err());
    }

    #[test]
    fn rejects_wrong_signing_team_and_untrusted_asset_names() {
        let mut manifest = valid_manifest();
        manifest.team_id = "OTHERTEAM1".into();
        assert!(validate_manifest(&manifest, "local-toolbox").is_err());

        let mut manifest = valid_manifest();
        manifest.apps[0].asset_name = "../../unsafe.zip".into();
        assert!(validate_manifest(&manifest, "local-toolbox").is_err());
    }

    #[test]
    fn rejects_duplicate_apps_and_malformed_digest() {
        let mut manifest = valid_manifest();
        manifest.apps[1].id = manifest.apps[0].id.clone();
        assert!(validate_manifest(&manifest, "local-toolbox").is_err());

        let mut manifest = valid_manifest();
        manifest.apps[0].sha256 = "g".repeat(64);
        assert!(validate_manifest(&manifest, "local-toolbox").is_err());
    }
}
