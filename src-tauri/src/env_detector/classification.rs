use super::types::{ToolClassification, ToolDetector};
use std::path::Path;

pub(super) fn classify_env_tool(
    command_name: &str,
    path: &Path,
    detector: Option<&ToolDetector>,
    all_paths: &[String],
    version_probe_attempted: bool,
    version_found: bool,
) -> ToolClassification {
    let source = classify_source(path);
    let kind = classify_kind(path);
    let category = detector
        .map(|detector| detector.category.to_string())
        .unwrap_or_else(|| classify_category(command_name, &source));
    let detector_name = detector
        .map(|detector| detector.name.to_string())
        .unwrap_or_else(|| "path-scan".to_string());
    let issue = if all_paths.len() > 1 {
        "multipleVersions".to_string()
    } else if detector.is_some() && version_probe_attempted && !version_found {
        "versionUnknown".to_string()
    } else {
        String::new()
    };
    let status = if all_paths.len() > 1 {
        "multipleVersions"
    } else if detector.is_some() && version_probe_attempted && !version_found {
        "versionUnknown"
    } else {
        "ok"
    };

    ToolClassification {
        category,
        source,
        kind,
        status: status.to_string(),
        detector: detector_name,
        issue,
    }
}

fn classify_category(command_name: &str, source: &str) -> String {
    let command = command_name.to_ascii_lowercase();

    if matches!(
        command.as_str(),
        "claude" | "codex" | "cursor" | "gemini" | "ollama" | "opencode" | "windsurf"
    ) {
        return "ai".to_string();
    }
    if matches!(
        command.as_str(),
        "bun" | "corepack" | "deno" | "node" | "npm" | "npx" | "pnpm" | "yarn"
    ) || source == "node"
        || source == "volta"
    {
        return "javascript".to_string();
    }
    if matches!(
        command.as_str(),
        "cargo" | "clippy-driver" | "cross" | "rustc" | "rustfmt" | "rustup"
    ) || command.starts_with("cargo-")
        || source == "cargo"
    {
        return "rust".to_string();
    }
    if matches!(
        command.as_str(),
        "conda"
            | "ipython"
            | "jupyter"
            | "pip"
            | "pip3"
            | "pipx"
            | "poetry"
            | "py"
            | "pyenv"
            | "python"
            | "python3"
            | "uv"
            | "virtualenv"
    ) || source == "python"
        || source == "pyenv"
    {
        return "python".to_string();
    }
    if matches!(
        command.as_str(),
        "docker" | "docker-compose" | "helm" | "k9s" | "kind" | "kubectl" | "minikube" | "podman"
    ) {
        return "container".to_string();
    }
    if matches!(
        command.as_str(),
        "ansible"
            | "aws"
            | "az"
            | "doctl"
            | "fly"
            | "gcloud"
            | "gh"
            | "netlify"
            | "pulumi"
            | "terraform"
            | "vercel"
            | "wrangler"
    ) {
        return "cloud".to_string();
    }
    if matches!(
        command.as_str(),
        "duckdb" | "mariadb" | "mongosh" | "mysql" | "psql" | "redis-cli" | "sqlite3"
    ) {
        return "database".to_string();
    }
    if matches!(
        command.as_str(),
        "code" | "code-insiders" | "emacs" | "nano" | "nvim" | "subl" | "vim"
    ) {
        return "editor".to_string();
    }
    if matches!(
        command.as_str(),
        "curl"
            | "dig"
            | "ngrok"
            | "nslookup"
            | "openssl"
            | "rsync"
            | "scp"
            | "sftp"
            | "ssh"
            | "wget"
    ) {
        return "network".to_string();
    }
    if matches!(
        command.as_str(),
        "apt"
            | "apt-get"
            | "brew"
            | "choco"
            | "dnf"
            | "pacman"
            | "scoop"
            | "winget"
            | "yum"
            | "zypper"
    ) {
        return "packageManager".to_string();
    }
    if matches!(
        command.as_str(),
        "bundle"
            | "composer"
            | "dart"
            | "dotnet"
            | "flutter"
            | "gem"
            | "go"
            | "gofmt"
            | "gradle"
            | "java"
            | "javac"
            | "kotlin"
            | "kotlinc"
            | "lua"
            | "mvn"
            | "perl"
            | "php"
            | "ruby"
            | "swift"
            | "swiftc"
    ) || source == "go"
    {
        return "runtime".to_string();
    }
    if matches!(
        command.as_str(),
        "ar" | "bazel"
            | "clang"
            | "clang++"
            | "cmake"
            | "g++"
            | "gcc"
            | "gdb"
            | "ld"
            | "lldb"
            | "make"
            | "meson"
            | "ninja"
            | "ranlib"
            | "xcodebuild"
    ) {
        return "build".to_string();
    }

    "other".to_string()
}

fn classify_source(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();

    if normalized.contains("/node_modules/") || normalized.ends_with("/npm") {
        return "node".to_string();
    }
    if normalized.contains("/.cargo/bin") || normalized.contains("/.rustup/") {
        return "cargo".to_string();
    }
    if normalized.contains("/opt/homebrew/") || normalized.contains("/homebrew/") {
        return "homebrew".to_string();
    }
    if normalized.contains("/.volta/") || normalized.contains("/volta/bin") {
        return "volta".to_string();
    }
    if normalized.contains("/.asdf/") {
        return "asdf".to_string();
    }
    if normalized.contains("/mise/") {
        return "mise".to_string();
    }
    if normalized.contains("/scoop/") {
        return "scoop".to_string();
    }
    if normalized.contains("/chocolatey/") {
        return "chocolatey".to_string();
    }
    if normalized.contains("/go/bin") || normalized.contains("/program files/go/bin") {
        return "go".to_string();
    }
    if normalized.contains("/.pyenv/") || normalized.contains("/pyenv-win/") {
        return "pyenv".to_string();
    }
    if normalized.contains("/python") && normalized.contains("/scripts") {
        return "python".to_string();
    }
    if normalized.contains("/.local/bin") {
        return "local".to_string();
    }

    "path".to_string()
}

fn classify_kind(path: &Path) -> String {
    let extension = path
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    if matches!(extension.as_str(), "cmd" | "bat" | "ps1") {
        "shim".to_string()
    } else if matches!(
        extension.as_str(),
        "js" | "mjs" | "cjs" | "ts" | "py" | "rb" | "sh"
    ) {
        "script".to_string()
    } else {
        "executable".to_string()
    }
}
