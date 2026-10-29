//! Host-managed downloads of the two private, ad-hoc-signed Swift toolbox apps.
//!
//! The renderer can submit only a fixed catalog ID. The host accepts an app
//! only from a successful macOS CI run for the current private main commit,
//! verifies GitHub's artifact digest, then validates the app bundle before
//! installing it. No local Xcode build or paid Developer ID is needed.

#[cfg(target_os = "macos")]
use super::installer::{codesign, extractor};
use super::operations::operation_result;
use super::types::OperationResult;
#[cfg(target_os = "macos")]
use serde::Deserialize;
use serde::Serialize;
#[cfg(target_os = "macos")]
use std::io::Read;
#[cfg(target_os = "macos")]
use std::path::Path;
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::{Command, Output, Stdio};
#[cfg(target_os = "macos")]
use std::time::Duration;
#[cfg(target_os = "macos")]
use std::time::Instant;
#[cfg(target_os = "macos")]
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAppMarketItem {
    pub id: String,
    pub supported: bool,
    pub installed: bool,
    pub conflict: bool,
}

#[cfg(target_os = "macos")]
const PRIVATE_REPOSITORY: &str = "indredK/bench-native-apps";
#[cfg(target_os = "macos")]
const VERIFY_WORKFLOW: &str = "verify.yml";
#[cfg(target_os = "macos")]
const DEVELOPMENT_ARTIFACT: &str = "native-toolbox-macos-arm64-development";
#[cfg(target_os = "macos")]
const MAX_ARTIFACT_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
#[cfg(target_os = "macos")]
const MAX_ARTIFACT_EXTRACTED_BYTES: u64 = 1024 * 1024 * 1024;
#[cfg(target_os = "macos")]
const GH_COMMAND_TIMEOUT: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Copy)]
struct NativeAppSpec {
    id: &'static str,
    #[cfg(target_os = "macos")]
    bundle_id: &'static str,
    #[cfg(target_os = "macos")]
    display_name: &'static str,
    #[cfg(target_os = "macos")]
    bundle_name: &'static str,
}

const NATIVE_APPS: [NativeAppSpec; 2] = [
    NativeAppSpec {
        id: "local-toolbox",
        #[cfg(target_os = "macos")]
        bundle_id: "com.local.dailycheckin.helper",
        #[cfg(target_os = "macos")]
        display_name: "本地工具箱",
        #[cfg(target_os = "macos")]
        bundle_name: "本地工具箱.app",
    },
    NativeAppSpec {
        id: "abb-dev-toolbox",
        #[cfg(target_os = "macos")]
        bundle_id: "com.local.devservicemanager",
        #[cfg(target_os = "macos")]
        display_name: "ABB 开发工具箱",
        #[cfg(target_os = "macos")]
        bundle_name: "ABB开发工具箱.app",
    },
];

/// User-owned install location reserved for the plugin-center native app cards.
#[cfg(target_os = "macos")]
pub fn managed_apps_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join("Applications").join("Bench Apps"))
}

/// App Manager deliberately skips this dedicated directory.
#[cfg(target_os = "macos")]
pub fn is_managed_apps_dir(path: &Path) -> bool {
    managed_apps_dir().is_some_and(|managed| {
        let managed = std::fs::canonicalize(&managed).unwrap_or(managed);
        let path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        managed == path
    })
}

/// Local catalog state is independent of the extension registry/network.
pub fn market_list() -> Vec<NativeAppMarketItem> {
    NATIVE_APPS.iter().map(market_item).collect()
}

#[cfg(target_os = "macos")]
fn market_item(spec: &NativeAppSpec) -> NativeAppMarketItem {
    let mut item = NativeAppMarketItem {
        id: spec.id.to_string(),
        supported: true,
        installed: false,
        conflict: false,
    };
    let Some(target) = managed_apps_dir().map(|dir| dir.join(spec.bundle_name)) else {
        item.conflict = true;
        return item;
    };
    let Some(managed_dir) = target.parent() else {
        item.conflict = true;
        return item;
    };
    let Some(applications_dir) = managed_dir.parent() else {
        item.conflict = true;
        return item;
    };
    if !directory_is_safe_or_missing(applications_dir) || !directory_is_safe_or_missing(managed_dir)
    {
        item.conflict = true;
        return item;
    }
    match std::fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            match read_bundle_identifier(&target) {
                Some(bundle_id) if bundle_id == spec.bundle_id => item.installed = true,
                _ => item.conflict = true,
            }
        }
        Ok(_) => item.conflict = true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => item.conflict = true,
    }
    item
}

#[cfg(not(target_os = "macos"))]
fn market_item(spec: &NativeAppSpec) -> NativeAppMarketItem {
    NativeAppMarketItem {
        id: spec.id.to_string(),
        supported: false,
        installed: false,
        conflict: false,
    }
}

#[cfg(target_os = "macos")]
fn directory_is_safe_or_missing(path: &Path) -> bool {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata.is_dir() && !metadata.file_type().is_symlink(),
        Err(error) => error.kind() == std::io::ErrorKind::NotFound,
    }
}

#[cfg(target_os = "macos")]
fn managed_bundle_path(spec: &NativeAppSpec) -> Result<PathBuf, String> {
    let managed_dir = managed_apps_dir().ok_or("无法定位当前用户目录")?;
    let applications_dir = managed_dir
        .parent()
        .ok_or_else(|| "无法定位用户应用程序目录".to_string())?;
    if !directory_is_safe_or_missing(applications_dir)
        || !directory_is_safe_or_missing(&managed_dir)
    {
        return Err("Bench 原生应用目录不是安全的普通目录。".into());
    }
    Ok(managed_dir.join(spec.bundle_name))
}

#[cfg(target_os = "macos")]
fn read_bundle_identifier(app_bundle: &Path) -> Option<String> {
    plist::Value::from_file(app_bundle.join("Contents/Info.plist"))
        .ok()?
        .into_dictionary()?
        .get("CFBundleIdentifier")?
        .as_string()
        .map(ToString::to_string)
}

#[cfg(target_os = "macos")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowRun {
    database_id: u64,
    status: String,
    conclusion: Option<String>,
    event: String,
    head_branch: String,
    head_sha: String,
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, PartialEq, Eq)]
struct VerifiedRun {
    id: u64,
    head_sha: String,
}

#[cfg(target_os = "macos")]
#[derive(Debug, Deserialize)]
struct WorkflowArtifacts {
    artifacts: Vec<WorkflowArtifact>,
}

#[cfg(target_os = "macos")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct WorkflowArtifact {
    id: u64,
    name: String,
    digest: String,
    expired: bool,
    size_in_bytes: u64,
    workflow_run: ArtifactRun,
}

#[cfg(target_os = "macos")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ArtifactRun {
    id: u64,
    head_branch: String,
    head_sha: String,
}

#[cfg(target_os = "macos")]
fn app_spec(id: &str) -> Option<&'static NativeAppSpec> {
    NATIVE_APPS.iter().find(|spec| spec.id == id)
}

#[cfg(target_os = "macos")]
fn is_commit_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(target_os = "macos")]
fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(target_os = "macos")]
fn verified_main_run(runs_json: &str, current_main_sha: &str) -> Result<VerifiedRun, String> {
    if !is_commit_sha(current_main_sha) {
        return Err("无法确认私有应用仓库的 main 提交。".into());
    }
    let runs: Vec<WorkflowRun> = serde_json::from_str(runs_json)
        .map_err(|_| "无法读取私有应用仓库的 CI 状态。".to_string())?;
    let Some(run) = runs.into_iter().find(|run| {
        matches!(run.event.as_str(), "push" | "workflow_dispatch")
            && run.head_branch == "main"
            && is_commit_sha(&run.head_sha)
            && run.head_sha == current_main_sha
    }) else {
        return Err("私有应用仓库还没有可用的 macOS CI 结果。".into());
    };
    if run.status != "completed" || run.conclusion.as_deref() != Some("success") {
        return Err("当前 main 提交尚未通过 macOS CI；请稍后重试。".into());
    }
    Ok(VerifiedRun {
        id: run.database_id,
        head_sha: run.head_sha.clone(),
    })
}

#[cfg(target_os = "macos")]
fn verified_artifact(artifacts_json: &str, run: &VerifiedRun) -> Result<WorkflowArtifact, String> {
    let response: WorkflowArtifacts =
        serde_json::from_str(artifacts_json).map_err(|_| "无法读取 CI 应用包信息。".to_string())?;
    let mut matches = response
        .artifacts
        .into_iter()
        .filter(|artifact| artifact.name == DEVELOPMENT_ARTIFACT);
    let Some(artifact) = matches.next() else {
        return Err("CI 没有上传可安装的 macOS 应用包；请重新运行验证工作流。".into());
    };
    if matches.next().is_some()
        || artifact.expired
        || artifact.size_in_bytes == 0
        || artifact.size_in_bytes > MAX_ARTIFACT_ARCHIVE_BYTES
        || !artifact
            .digest
            .strip_prefix("sha256:")
            .is_some_and(is_sha256)
        || artifact.workflow_run.id != run.id
        || artifact.workflow_run.head_branch != "main"
        || artifact.workflow_run.head_sha != run.head_sha
    {
        return Err("CI 应用包的来源、状态或摘要无效；已拒绝安装。".into());
    }
    Ok(artifact)
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
    candidates.into_iter().find(|path| is_executable_file(path))
}

#[cfg(target_os = "macos")]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
        && std::fs::metadata(path).ok().is_some_and(|metadata| {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode() & 0o111 != 0
        })
}

#[cfg(target_os = "macos")]
fn gh_output(gh: &Path, args: &[String], cwd: &Path) -> Result<Output, String> {
    super::run_command_with_timeout(
        Command::new(gh)
            .args(args)
            .current_dir(cwd)
            .env("GH_PROMPT_DISABLED", "1")
            .env("GH_PAGER", "cat")
            .env("GIT_TERMINAL_PROMPT", "0"),
        GH_COMMAND_TIMEOUT,
    )
    .map_err(|_| "访问 GitHub 超时或无法启动 GitHub CLI。".to_string())
}

#[cfg(target_os = "macos")]
fn gh_text(gh: &Path, args: &[String], cwd: &Path, error: &str) -> Result<String, String> {
    let output = gh_output(gh, args, cwd)?;
    if !output.status.success() {
        return Err(error.to_string());
    }
    String::from_utf8(output.stdout).map_err(|_| error.to_string())
}

#[cfg(target_os = "macos")]
fn git_main_commit(gh: &Path, cwd: &Path) -> Result<String, String> {
    let output = gh_text(
        gh,
        &[
            "api".into(),
            format!("repos/{PRIVATE_REPOSITORY}/commits/main"),
            "--jq".into(),
            ".sha".into(),
        ],
        cwd,
        "无法访问私有应用仓库。请确认 gh 已登录且当前账号有仓库读取权限。",
    )?;
    Ok(output.trim().to_string())
}

#[cfg(target_os = "macos")]
fn latest_ci_run_json(gh: &Path, cwd: &Path) -> Result<String, String> {
    gh_text(
        gh,
        &[
            "run".into(),
            "list".into(),
            "--repo".into(),
            PRIVATE_REPOSITORY.into(),
            "--workflow".into(),
            VERIFY_WORKFLOW.into(),
            "--branch".into(),
            "main".into(),
            "--limit".into(),
            "100".into(),
            "--json".into(),
            "databaseId,status,conclusion,event,headBranch,headSha".into(),
        ],
        cwd,
        "无法读取私有应用仓库的 macOS CI 状态。",
    )
}

#[cfg(target_os = "macos")]
fn artifact_list_json(gh: &Path, run_id: u64, cwd: &Path) -> Result<String, String> {
    gh_text(
        gh,
        &[
            "api".into(),
            format!("repos/{PRIVATE_REPOSITORY}/actions/runs/{run_id}/artifacts"),
        ],
        cwd,
        "无法读取 CI 应用包清单；请确认 gh 有 Actions 读取权限。",
    )
}

#[cfg(target_os = "macos")]
fn download_artifact_archive(
    gh: &Path,
    artifact_id: u64,
    archive: &Path,
    cwd: &Path,
) -> Result<(), String> {
    let archive_file =
        std::fs::File::create(archive).map_err(|_| "无法创建应用包下载文件。".to_string())?;
    let endpoint = format!("repos/{PRIVATE_REPOSITORY}/actions/artifacts/{artifact_id}/zip");
    let mut child = Command::new(gh)
        .args(["api", endpoint.as_str()])
        .current_dir(cwd)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdout(Stdio::from(archive_file))
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "无法启动 GitHub CLI 下载应用包。".to_string())?;
    let started = Instant::now();
    loop {
        if std::fs::metadata(archive)
            .is_ok_and(|metadata| metadata.len() > MAX_ARTIFACT_ARCHIVE_BYTES)
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("CI 应用包大小超出安全限制。".into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return Err("无法下载 CI 应用包；请确认 Actions 读取权限。".into()),
            Ok(None) if started.elapsed() < GH_COMMAND_TIMEOUT => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("CI 应用包下载超时；请检查网络后重试。".into());
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("无法检查 CI 应用包下载进度。".into());
            }
        }
    }
    let size = std::fs::metadata(archive)
        .map_err(|_| "GitHub 未返回有效的 CI 应用包。".to_string())?
        .len();
    if size == 0 || size > MAX_ARTIFACT_ARCHIVE_BYTES {
        return Err("CI 应用包大小超出安全限制。".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let metadata = std::fs::metadata(path).map_err(|_| "无法读取下载的 CI 应用包。".to_string())?;
    if metadata.len() == 0 || metadata.len() > MAX_ARTIFACT_ARCHIVE_BYTES {
        return Err("CI 应用包大小超出安全限制。".into());
    }
    let mut file =
        std::fs::File::open(path).map_err(|_| "无法打开下载的 CI 应用包。".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let bytes = file
            .read(&mut buffer)
            .map_err(|_| "读取 CI 应用包失败。".to_string())?;
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
fn extract_app_bundle(
    archive: &Path,
    extraction_dir: &Path,
    spec: &NativeAppSpec,
) -> Result<PathBuf, String> {
    std::fs::create_dir(extraction_dir).map_err(|_| "无法创建 CI 应用包解压目录。".to_string())?;
    extractor::extract_zip_contents_with_limit(
        archive,
        extraction_dir,
        None,
        MAX_ARTIFACT_EXTRACTED_BYTES,
    )
    .map_err(|_| "CI 应用包结构无效，已拒绝解压。".to_string())?;

    let expected = NATIVE_APPS
        .iter()
        .map(|app| app.bundle_name)
        .collect::<std::collections::HashSet<_>>();
    let entries = std::fs::read_dir(extraction_dir)
        .map_err(|_| "无法读取解压后的 CI 应用包。".to_string())?;
    let mut seen = std::collections::HashSet::with_capacity(NATIVE_APPS.len());
    for entry in entries {
        let entry = entry.map_err(|_| "无法读取解压后的 CI 应用包。".to_string())?;
        let name = entry
            .file_name()
            .to_str()
            .map(str::to_owned)
            .ok_or_else(|| "CI 应用包含有无效文件名。".to_string())?;
        let metadata = std::fs::symlink_metadata(entry.path())
            .map_err(|_| "无法检查解压后的 CI 应用包。".to_string())?;
        if !expected.contains(name.as_str())
            || !seen.insert(name)
            || !metadata.is_dir()
            || metadata.file_type().is_symlink()
        {
            return Err("CI 应用包目录不符合 Bench 的固定目录。".into());
        }
    }
    if seen.len() != NATIVE_APPS.len() {
        return Err("CI 应用包缺少已登记的应用。".into());
    }
    Ok(extraction_dir.join(spec.bundle_name))
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
fn verify_native_bundle(app_bundle: &Path, spec: &NativeAppSpec) -> Result<(), String> {
    if read_bundle_id(app_bundle)? != spec.bundle_id {
        return Err("应用包 Bundle ID 与 Bench 目录不一致".into());
    }
    codesign::verify_signature(app_bundle).map_err(|_| "应用代码签名校验失败".to_string())?;
    let signature =
        codesign::read_codesign_info(app_bundle).map_err(|_| "无法读取应用代码签名".to_string())?;
    if signature.bundle_id.as_deref() != Some(spec.bundle_id)
        || signature.signature.as_deref() != Some("adhoc")
        || signature.team_id.is_some()
        || signature.authority.is_some()
    {
        return Err("CI 应用必须是 Bench 允许的 ad-hoc 签名包。".into());
    }
    codesign::verify_platform_compatibility(app_bundle)
        .map_err(|_| "应用不兼容当前 macOS 或 Apple 芯片。".to_string())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn ensure_managed_apps_dir() -> Result<PathBuf, String> {
    let managed_dir = managed_apps_dir().ok_or("无法定位当前用户目录")?;
    let applications_dir = managed_dir
        .parent()
        .ok_or_else(|| "无法定位用户应用程序目录".to_string())?;
    for directory in [applications_dir, managed_dir.as_path()] {
        match std::fs::symlink_metadata(directory) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Ok(_) => return Err("Bench 原生应用目录不是安全的普通目录。".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                std::fs::create_dir(directory)
                    .map_err(|_| "无法创建 Bench 原生应用目录。".to_string())?;
                let metadata = std::fs::symlink_metadata(directory)
                    .map_err(|_| "无法检查 Bench 原生应用目录。".to_string())?;
                if !metadata.is_dir() || metadata.file_type().is_symlink() {
                    return Err("Bench 原生应用目录不是安全的普通目录。".into());
                }
            }
            Err(_) => return Err("无法安全检查 Bench 原生应用目录。".into()),
        }
    }
    Ok(managed_dir)
}

#[cfg(target_os = "macos")]
fn install_macos(id: &str) -> Result<String, String> {
    if std::env::consts::ARCH != "aarch64" {
        return Err("这两款 CI 预编译应用目前只支持 Apple Silicon Mac。".into());
    }
    let spec = app_spec(id).ok_or_else(|| "未登记的原生工具箱应用".to_string())?;
    let gh = find_gh_cli().ok_or_else(|| {
        "未找到 GitHub CLI。请先安装 gh，并登录可访问私有应用仓库的 GitHub 账号。".to_string()
    })?;
    let auth = super::run_command_with_timeout(
        Command::new(&gh).args(["auth", "status", "--hostname", "github.com"]),
        Duration::from_secs(15),
    );
    if !auth.is_ok_and(|output| output.status.success()) {
        return Err("GitHub CLI 尚未登录。请先在终端运行 `gh auth login`。".into());
    }

    let work_dir = extractor::make_work_dir(&format!("native-artifact-{}", spec.id))?;
    let result = (|| {
        let current_main_sha = git_main_commit(&gh, &work_dir)?;
        let run_json = latest_ci_run_json(&gh, &work_dir)?;
        let run = verified_main_run(&run_json, &current_main_sha)?;
        let artifacts_json = artifact_list_json(&gh, run.id, &work_dir)?;
        let artifact = verified_artifact(&artifacts_json, &run)?;

        let archive = work_dir.join("apps.zip");
        download_artifact_archive(&gh, artifact.id, &archive, &work_dir)?;
        let actual_digest = sha256_file(&archive)?;
        let expected_digest = artifact
            .digest
            .strip_prefix("sha256:")
            .ok_or_else(|| "CI 应用包缺少 SHA-256 摘要。".to_string())?;
        if actual_digest != expected_digest {
            return Err("CI 应用包 SHA-256 不匹配，已拒绝安装。".into());
        }

        let extraction_dir = work_dir.join("extracted");
        let app_bundle = extract_app_bundle(&archive, &extraction_dir, spec)?;
        verify_native_bundle(&app_bundle, spec)?;

        if git_main_commit(&gh, &work_dir)? != run.head_sha {
            return Err("下载期间 main 已更新；请等待新提交通过 CI 后重试。".into());
        }

        let applications = ensure_managed_apps_dir()?;
        let target = applications.join(spec.bundle_name);
        match std::fs::symlink_metadata(&target) {
            Ok(_) => {
                return Err(format!(
                    "{} 的 Bench 安装位置已被占用；为避免覆盖，已停止安装。",
                    spec.display_name
                ));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("无法安全检查目标应用路径；已停止安装。".into()),
        }
        std::fs::rename(&app_bundle, &target)
            .map_err(|_| "无法将应用安全移动到 Bench 原生应用目录。".to_string())?;
        Ok(format!(
            "{} 下载并安装完成：{}（CI main@{}，ad-hoc 签名）。若 macOS 拦截，请在系统设置中手动确认。",
            spec.display_name,
            target.display(),
            &run.head_sha[..12]
        ))
    })();
    extractor::cleanup_work_dir(&work_dir);
    result
}

#[cfg(target_os = "macos")]
fn unique_trash_destination(trash_dir: &Path, bundle_name: &str) -> Result<PathBuf, String> {
    let original = trash_dir.join(bundle_name);
    if std::fs::symlink_metadata(&original).is_err() {
        return Ok(original);
    }
    let stem = bundle_name
        .strip_suffix(".app")
        .ok_or_else(|| "原生应用包名称无效。".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let process_id = std::process::id();
    for suffix in 0..1000_u16 {
        let candidate = trash_dir.join(format!("{stem} (Bench {process_id}-{nonce}-{suffix}).app"));
        if std::fs::symlink_metadata(&candidate)
            .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
        {
            return Ok(candidate);
        }
    }
    Err("无法为卸载的应用找到安全的废纸篓名称。".into())
}

#[cfg(target_os = "macos")]
fn uninstall_macos(id: &str) -> Result<String, String> {
    let spec = app_spec(id).ok_or_else(|| "未登记的原生工具箱应用。".to_string())?;
    let home = dirs::home_dir().ok_or("无法定位当前用户目录")?;
    let target = managed_bundle_path(spec)?;
    let metadata = std::fs::symlink_metadata(&target)
        .map_err(|_| "Bench 管理的原生应用不存在。".to_string())?;
    if !metadata.is_dir()
        || metadata.file_type().is_symlink()
        || read_bundle_identifier(&target).as_deref() != Some(spec.bundle_id)
    {
        return Err("应用身份与 Bench 原生应用目录不匹配；为保护其他文件，已停止卸载。".into());
    }

    let trash_dir = home.join(".Trash");
    match std::fs::symlink_metadata(&trash_dir) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        Ok(_) => return Err("废纸篓目录不安全；已停止卸载。".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(&trash_dir).map_err(|_| "无法访问用户废纸篓。".to_string())?;
        }
        Err(_) => return Err("无法安全检查用户废纸篓。".into()),
    }
    let destination = unique_trash_destination(&trash_dir, spec.bundle_name)?;
    std::fs::rename(&target, &destination)
        .map_err(|_| "无法将应用移入废纸篓；应用和数据均已保留。".to_string())?;
    Ok(format!(
        "{} 已移入废纸篓；应用数据未删除。",
        spec.display_name
    ))
}

#[cfg(target_os = "macos")]
fn open_macos(id: &str) -> Result<String, String> {
    let spec = app_spec(id).ok_or_else(|| "未登记的原生工具箱应用。".to_string())?;
    let target = managed_bundle_path(spec)?;
    let metadata = std::fs::symlink_metadata(&target)
        .map_err(|_| "Bench 管理的原生应用不存在。".to_string())?;
    if !metadata.is_dir()
        || metadata.file_type().is_symlink()
        || read_bundle_identifier(&target).as_deref() != Some(spec.bundle_id)
    {
        return Err("应用身份与 Bench 原生应用目录不匹配；已停止启动。".into());
    }
    let status = Command::new("open")
        .arg(&target)
        .status()
        .map_err(|_| "无法启动原生应用。".to_string())?;
    if !status.success() {
        return Err("macOS 未能启动原生应用。".into());
    }
    Ok(format!("{} 已启动。", spec.display_name))
}

pub fn uninstall(id: &str) -> OperationResult {
    #[cfg(target_os = "macos")]
    let result = uninstall_macos(id);
    #[cfg(not(target_os = "macos"))]
    let result: Result<String, String> = {
        let _ = id;
        Err("Bench 原生工具箱目前仅支持 macOS。".into())
    };
    result_to_operation_result(result, "NATIVE_TOOL_UNINSTALL_FAILED")
}

pub fn open(id: &str) -> OperationResult {
    #[cfg(target_os = "macos")]
    let result = open_macos(id);
    #[cfg(not(target_os = "macos"))]
    let result: Result<String, String> = {
        let _ = id;
        Err("Bench 原生工具箱目前仅支持 macOS。".into())
    };
    result_to_operation_result(result, "NATIVE_TOOL_OPEN_FAILED")
}

fn result_to_operation_result(result: Result<String, String>, error_code: &str) -> OperationResult {
    match result {
        Ok(message) => operation_result(true, message, Some(0), None, false),
        Err(message) => operation_result(false, message, None, Some(error_code.into()), false),
    }
}

pub fn install(id: &str) -> OperationResult {
    #[cfg(target_os = "macos")]
    let result = install_macos(id);
    #[cfg(not(target_os = "macos"))]
    let result: Result<String, String> = {
        let _ = id;
        Err("Bench 原生工具箱目前仅支持 macOS。".into())
    };

    result_to_operation_result(result, "NATIVE_TOOL_INSTALL_FAILED")
}

/// Serialize install/open/uninstall operations for one catalog ID.
pub fn run_market_operation(
    id: &str,
    operation: fn(&str) -> OperationResult,
    state: &super::state::AppManagerState,
) -> OperationResult {
    let operation_key = format!("bench-native-app:{id}");
    let Some(_guard) = state.try_lock_operation(&operation_key) else {
        return super::locked_operation_result();
    };
    operation(id)
}

#[cfg(test)]
mod market_catalog_tests {
    use super::*;

    #[test]
    fn exposes_only_the_two_fixed_native_app_ids() {
        let mut ids = market_list()
            .into_iter()
            .map(|item| item.id)
            .collect::<Vec<_>>();
        ids.sort();
        assert_eq!(ids, vec!["abb-dev-toolbox", "local-toolbox"]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn marks_native_apps_supported_and_excludes_the_managed_directory_from_inventory() {
        assert!(market_list().iter().all(|item| item.supported));
        let managed_dir = managed_apps_dir().expect("home directory");
        assert!(is_managed_apps_dir(&managed_dir));
        assert!(!is_managed_apps_dir(&managed_dir.join("nested")));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn marks_macos_native_apps_unsupported_on_other_platforms() {
        assert!(market_list().iter().all(|item| !item.supported));
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    fn run(status: &str, conclusion: &str, event: &str, branch: &str, sha: &str) -> String {
        serde_json::json!([{
            "databaseId": 42,
            "status": status,
            "conclusion": conclusion,
            "event": event,
            "headBranch": branch,
            "headSha": sha,
        }])
        .to_string()
    }

    fn artifacts(run_id: u64, head_branch: &str, head_sha: &str) -> String {
        serde_json::json!({
            "artifacts": [{
                "id": 99,
                "name": DEVELOPMENT_ARTIFACT,
                "digest": format!("sha256:{}", "b".repeat(64)),
                "expired": false,
                "size_in_bytes": 100,
                "workflow_run": {
                    "id": run_id,
                    "head_branch": head_branch,
                    "head_sha": head_sha,
                }
            }]
        })
        .to_string()
    }

    #[test]
    fn accepts_only_current_main_sha_with_successful_push_ci() {
        let sha = "a".repeat(40);
        let verified =
            verified_main_run(&run("completed", "success", "push", "main", &sha), &sha).unwrap();
        assert_eq!(verified.id, 42);
        assert_eq!(verified.head_sha, sha);
    }

    #[test]
    fn accepts_manual_main_workflow_dispatch_for_artifact_renewal() {
        let sha = "a".repeat(40);
        let verified = verified_main_run(
            &run("completed", "success", "workflow_dispatch", "main", &sha),
            &sha,
        )
        .unwrap();
        assert_eq!(verified.id, 42);
        assert_eq!(verified.head_sha, sha);
    }

    #[test]
    fn skips_other_events_when_selecting_current_main_ci_run() {
        let sha = "a".repeat(40);
        let runs = serde_json::json!([
            {
                "databaseId": 41,
                "status": "completed",
                "conclusion": "success",
                "event": "pull_request",
                "headBranch": "main",
                "headSha": sha,
            },
            {
                "databaseId": 42,
                "status": "completed",
                "conclusion": "success",
                "event": "push",
                "headBranch": "main",
                "headSha": sha,
            },
        ])
        .to_string();
        let verified = verified_main_run(&runs, &sha).unwrap();
        assert_eq!(verified.id, 42);
    }

    #[test]
    fn rejects_pending_failed_stale_and_non_main_ci_runs() {
        let sha = "a".repeat(40);
        let stale = "b".repeat(40);
        assert!(verified_main_run(&run("in_progress", "", "push", "main", &sha), &sha).is_err());
        assert!(
            verified_main_run(&run("completed", "failure", "push", "main", &sha), &sha).is_err()
        );
        assert!(
            verified_main_run(&run("completed", "success", "push", "main", &stale), &sha).is_err()
        );
        assert!(verified_main_run(
            &run("completed", "success", "pull_request", "main", &sha),
            &sha
        )
        .is_err());
        assert!(
            verified_main_run(&run("completed", "success", "schedule", "main", &sha), &sha)
                .is_err()
        );
    }

    #[test]
    fn accepts_only_live_artifact_pinned_to_the_verified_run() {
        let sha = "a".repeat(40);
        let run = VerifiedRun {
            id: 42,
            head_sha: sha.clone(),
        };
        let artifact = verified_artifact(&artifacts(42, "main", &sha), &run).unwrap();
        assert_eq!(artifact.id, 99);
        assert!(verified_artifact(&artifacts(41, "main", &sha), &run).is_err());
        assert!(verified_artifact(&artifacts(42, "feature", &sha), &run).is_err());
        assert!(verified_artifact(&artifacts(42, "main", &"b".repeat(40)), &run).is_err());
    }

    #[test]
    fn rejects_expired_oversized_and_malformed_artifact_metadata() {
        let sha = "a".repeat(40);
        let run = VerifiedRun {
            id: 42,
            head_sha: sha.clone(),
        };
        let mut value: serde_json::Value =
            serde_json::from_str(&artifacts(42, "main", &sha)).unwrap();
        value["artifacts"][0]["expired"] = serde_json::Value::Bool(true);
        assert!(verified_artifact(&value.to_string(), &run).is_err());

        let mut value: serde_json::Value =
            serde_json::from_str(&artifacts(42, "main", &sha)).unwrap();
        value["artifacts"][0]["size_in_bytes"] = serde_json::json!(MAX_ARTIFACT_ARCHIVE_BYTES + 1);
        assert!(verified_artifact(&value.to_string(), &run).is_err());

        let mut value: serde_json::Value =
            serde_json::from_str(&artifacts(42, "main", &sha)).unwrap();
        value["artifacts"][0]["digest"] = serde_json::json!("sha256:bad");
        assert!(verified_artifact(&value.to_string(), &run).is_err());
    }

    #[test]
    fn rejects_unregistered_app_ids_and_invalid_commit_hashes() {
        assert!(app_spec("../../local-toolbox").is_none());
        assert!(verified_main_run("[]", &"a".repeat(40)).is_err());
        assert!(verified_main_run("[]", "not-a-commit").is_err());
    }

    #[test]
    fn catalog_pins_bundle_ids_and_app_names() {
        let local = app_spec("local-toolbox").unwrap();
        assert_eq!(local.bundle_id, "com.local.dailycheckin.helper");
        assert_eq!(local.bundle_name, "本地工具箱.app");
        let abb = app_spec("abb-dev-toolbox").unwrap();
        assert_eq!(abb.bundle_id, "com.local.devservicemanager");
        assert_eq!(abb.bundle_name, "ABB开发工具箱.app");
    }
}
